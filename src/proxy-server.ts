import * as readline from 'readline';
import type { VaizConfig, MCPRequest, MCPResponse, MCPNotification } from './types.js';

const DEFAULT_API_URL = 'https://api.vaiz.com/mcp';

/**
 * MCP Proxy Server that forwards stdio JSON-RPC messages to Vaiz HTTP MCP API
 */
export class VaizMCPProxyServer {
  private apiKey: string;
  private spaceId: string;
  private apiUrl: string;
  private sessionId: string | null = null;
  private rl: readline.Interface | null = null;
  private initialized = false;
  private debug: boolean;

  constructor(config: VaizConfig & { debug?: boolean } = {}) {
    this.apiKey = config.apiKey || process.env.VAIZ_API_TOKEN || '';
    this.spaceId = config.spaceId || process.env.VAIZ_SPACE_ID || '';
    this.apiUrl = config.apiUrl || process.env.VAIZ_API_URL || DEFAULT_API_URL;
    this.debug = config.debug || process.env.VAIZ_DEBUG === 'true';

    if (!this.apiKey) {
      this.logError(
        'Vaiz API key is required. Set VAIZ_API_TOKEN environment variable.'
      );
      process.exit(1);
    }

    if (!this.spaceId) {
      this.logError(
        'Vaiz Space ID is required. Set VAIZ_SPACE_ID environment variable.'
      );
      process.exit(1);
    }
  }

  private log(message: string): void {
    if (this.debug) {
      process.stderr.write(`[vaiz-mcp] ${message}\n`);
    }
  }

  private logError(message: string): void {
    process.stderr.write(`[vaiz-mcp] ERROR: ${message}\n`);
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Current-Space-Id': this.spaceId,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
    };
  }

  private sendResponse(response: MCPResponse | MCPNotification): void {
    const json = JSON.stringify(response);
    process.stdout.write(json + '\n');
    this.log(`→ ${json}`);
  }

  private async proxyRequest(request: MCPRequest): Promise<void> {
    this.log(`← ${JSON.stringify(request)}`);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      });

      // Store session ID from response if present
      const newSessionId = response.headers.get('Mcp-Session-Id');
      if (newSessionId) {
        this.sessionId = newSessionId;
        this.log(`Session ID: ${newSessionId}`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        this.logError(`HTTP ${response.status}: ${errorText}`);
        this.sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32000,
            message: `HTTP ${response.status}: ${response.statusText}`,
            data: errorText,
          },
        });
        return;
      }

      const contentType = response.headers.get('content-type') || '';

      // Handle SSE responses
      if (contentType.includes('text/event-stream')) {
        await this.handleSSEResponse(response, request.id);
        return;
      }

      // Handle regular JSON responses
      const result = await response.json() as MCPResponse;
      this.sendResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logError(`Request failed: ${errorMessage}`);
      this.sendResponse({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32000,
          message: `Request failed: ${errorMessage}`,
        },
      });
    }
  }

  private async handleSSEResponse(
    response: Response,
    requestId: string | number
  ): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      this.sendResponse({
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: -32000,
          message: 'No response body available',
        },
      });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let responseSent = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data && data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                this.sendResponse(parsed);
                if ('id' in parsed && parsed.id === requestId) {
                  responseSent = true;
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!responseSent) {
      this.sendResponse({
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: -32000,
          message: 'No valid response received from SSE stream',
        },
      });
    }
  }

  private handleNotification(notification: MCPNotification): void {
    this.log(`← Notification: ${JSON.stringify(notification)}`);
    
    // Handle initialized notification
    if (notification.method === 'notifications/initialized') {
      this.initialized = true;
      this.log('Client initialized');
    }
    
    // Forward notifications to the remote server (fire-and-forget)
    fetch(this.apiUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(notification),
    }).catch((error) => {
      this.log(`Failed to forward notification: ${error}`);
    });
  }

  /**
   * Start the proxy server, listening on stdin and writing to stdout
   */
  start(): void {
    this.log(`Starting Vaiz MCP proxy server`);
    this.log(`API URL: ${this.apiUrl}`);
    this.log(`Space ID: ${this.spaceId}`);

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.rl.on('line', async (line) => {
      if (!line.trim()) return;

      try {
        const message = JSON.parse(line);

        // Check if it's a request (has 'id') or notification (no 'id')
        if ('id' in message) {
          await this.proxyRequest(message as MCPRequest);
        } else {
          this.handleNotification(message as MCPNotification);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logError(`Failed to parse message: ${errorMessage}`);
        this.logError(`Raw message: ${line}`);
      }
    });

    this.rl.on('close', () => {
      this.log('stdin closed, shutting down');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      this.log('Received SIGINT, shutting down');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.log('Received SIGTERM, shutting down');
      process.exit(0);
    });
  }

  /**
   * Stop the proxy server
   */
  stop(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

export function createVaizMCPProxyServer(
  config?: VaizConfig & { debug?: boolean }
): VaizMCPProxyServer {
  return new VaizMCPProxyServer(config);
}

