import * as readline from 'readline';
import type { VaizConfig, MCPRequest, MCPResponse, MCPNotification } from './types.js';

const DEFAULT_API_URL = 'https://api.vaiz.com/mcp';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const HEALTH_CHECK_INTERVAL_MS = 5000;

/**
 * MCP Proxy Server that forwards stdio JSON-RPC messages to Vaiz HTTP MCP API.
 *
 * Resilience strategy:
 * - Retry with exponential backoff on transient errors
 * - Cache tools/list responses; NEVER return an error for tools/list
 * - Background health check when API is down
 * - Re-initialize session + send notifications/tools/list_changed on recovery
 */
export class VaizMCPProxyServer {
  private apiKey: string;
  private spaceId: string | undefined;
  private apiUrl: string;
  private sessionId: string | null = null;
  private rl: readline.Interface | null = null;
  private initialized = false;
  private debug: boolean;

  // Response cache for tools/list and initialize
  private responseCache: Map<string, MCPResponse> = new Map();

  // Store original initialize params for session re-initialization
  private lastInitParams: Record<string, unknown> | undefined;

  // Health check / API state
  private apiHealthy = true;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: VaizConfig & { debug?: boolean } = {}) {
    this.apiKey = config.apiKey || process.env.VAIZ_API_TOKEN || '';
    this.spaceId = config.spaceId || process.env.VAIZ_SPACE_ID || undefined;
    this.apiUrl = config.apiUrl || process.env.VAIZ_API_URL || DEFAULT_API_URL;
    this.debug = config.debug || process.env.VAIZ_DEBUG === 'true';

    if (!this.apiKey) {
      this.logError(
        'Vaiz API key is required. Set VAIZ_API_TOKEN environment variable.'
      );
      process.exit(1);
    }
  }

  // ── logging ──────────────────────────────────────────────

  private log(message: string): void {
    if (this.debug) {
      process.stderr.write(`[vaiz-mcp] ${message}\n`);
    }
  }

  /** Always logged (not just in debug mode) */
  private logWarn(message: string): void {
    process.stderr.write(`[vaiz-mcp] WARN: ${message}\n`);
  }

  private logError(message: string): void {
    process.stderr.write(`[vaiz-mcp] ERROR: ${message}\n`);
  }

  // ── helpers ──────────────────────────────────────────────

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      ...(this.spaceId ? { 'Current-Space-Id': this.spaceId } : {}),
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isTransientError(error: unknown): boolean {
    if (error instanceof TypeError) return true;
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('fetch') || msg.includes('network') ||
        msg.includes('econnrefused') || msg.includes('econnreset') ||
        msg.includes('etimedout') || msg.includes('socket') ||
        msg.includes('abort');
    }
    return false;
  }

  private isRetryableStatus(status: number): boolean {
    return status >= 500 || status === 429;
  }

  // ── health check & recovery ──────────────────────────────

  private markApiDown(): void {
    if (!this.apiHealthy) return;
    this.apiHealthy = false;
    this.sessionId = null;
    this.logWarn('API is DOWN — starting background health check');
    this.startHealthCheck();
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(async () => {
      this.log('Health check: pinging API...');
      try {
        // Try to re-initialize a fresh session
        const ok = await this.reinitializeSession();
        if (ok) {
          this.apiHealthy = true;
          this.stopHealthCheck();
          this.logWarn('API is UP — notifying Cursor to refresh tools');
          this.notifyToolsChanged();
        }
      } catch {
        this.log('Health check: API still unreachable');
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /** Tell Cursor to re-fetch tools/list */
  private notifyToolsChanged(): void {
    this.log('Sending notifications/tools/list_changed to Cursor');
    this.sendResponse({
      jsonrpc: '2.0',
      method: 'notifications/tools/list_changed',
    });
  }

  /**
   * Establish a fresh session with the remote API.
   * Sends initialize + notifications/initialized.
   */
  private async reinitializeSession(): Promise<boolean> {
    this.log('Re-initializing session...');
    this.sessionId = null;
    this.initialized = false;

    const initRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: '_reinit_' + Date.now(),
      method: 'initialize',
      params: this.lastInitParams || {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'vaiz-mcp-proxy', version: '1.0.0' },
      },
    };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(initRequest),
    });

    if (!response.ok) {
      this.logError(`Re-init HTTP ${response.status}`);
      return false;
    }

    const newSessionId = response.headers.get('Mcp-Session-Id');
    if (newSessionId) {
      this.sessionId = newSessionId;
      this.log(`New session: ${newSessionId}`);
    }

    const result = await response.json() as MCPResponse;
    if (result.result) {
      this.responseCache.set('initialize', result);
    }

    // Fire notifications/initialized
    await fetch(this.apiUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    }).catch(() => {});

    this.initialized = true;
    this.log('Session re-initialized OK');
    return true;
  }

  // ── main proxy logic ─────────────────────────────────────

  private async proxyRequest(request: MCPRequest): Promise<void> {
    this.log(`← ${request.method} (id=${request.id})`);

    // Remember init params for future re-init
    if (request.method === 'initialize' && request.params) {
      this.lastInitParams = request.params;
    }

    let lastError: string | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        this.log(`  retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await this.sleep(delay);
      }

      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(request),
        });

        // Capture session
        const sid = response.headers.get('Mcp-Session-Id');
        if (sid) {
          this.sessionId = sid;
          this.log(`  session: ${sid}`);
        }

        // ── HTTP error ──
        if (!response.ok) {
          const body = await response.text();
          this.logError(`  HTTP ${response.status}: ${body.slice(0, 200)}`);

          // Retryable server error
          if (this.isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
            lastError = `HTTP ${response.status}`;
            continue;
          }

          // Possibly stale session — re-initialize to get new session ID, then retry
          if ((response.status === 400 || response.status === 404) && attempt < MAX_RETRIES) {
            this.logWarn('Possible stale session — re-initializing');
            try {
              const ok = await this.reinitializeSession();
              if (ok) {
                this.logWarn('Session re-initialized, retrying request');
                lastError = `HTTP ${response.status}`;
                continue;
              }
            } catch {}
            lastError = `HTTP ${response.status}: session re-init failed`;
            break;
          }

          // Non-retryable
          lastError = `HTTP ${response.status}: ${response.statusText}`;
          break;
        }

        // ── Success ──
        // Mark API as healthy if it was down
        if (!this.apiHealthy) {
          this.apiHealthy = true;
          this.stopHealthCheck();
          this.logWarn('API is back (via successful request)');
          if (request.method !== 'tools/list') {
            this.notifyToolsChanged();
          }
        }

        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/event-stream')) {
          await this.handleSSEResponse(response, request.id, request.method);
          return;
        }

        const result = await response.json() as MCPResponse;

        // Cache critical methods
        if ((request.method === 'initialize' || request.method === 'tools/list') && result.result) {
          this.responseCache.set(request.method, result);
          this.log(`  cached ${request.method}`);
        }

        this.sendResponse(result);
        return;

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logError(`  attempt ${attempt + 1} failed: ${msg}`);
        lastError = msg;

        if (this.isTransientError(error) && this.sessionId) {
          this.sessionId = null;
        }

        if (!this.isTransientError(error) || attempt >= MAX_RETRIES) {
          break;
        }
      }
    }

    // ── All retries failed ──
    this.logWarn(`${request.method} failed after retries: ${lastError}`);
    this.markApiDown();

    // tools/list and initialize: ALWAYS return cached, NEVER return error
    if (request.method === 'tools/list') {
      const cached = this.responseCache.get('tools/list');
      if (cached) {
        this.logWarn('Serving cached tools/list (API unavailable)');
        this.sendResponse({ ...cached, id: request.id });
      } else {
        // No cache yet — return empty tools (better than error)
        this.logWarn('No cached tools/list — returning empty tools');
        this.sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: { tools: [] },
        });
      }
      return;
    }

    if (request.method === 'initialize') {
      const cached = this.responseCache.get('initialize');
      if (cached) {
        this.logWarn('Serving cached initialize (API unavailable)');
        this.sendResponse({ ...cached, id: request.id });
        return;
      }
    }

    // Everything else — return error
    this.sendResponse({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32000,
        message: `API unavailable: ${lastError}`,
      },
    });
  }

  private async handleSSEResponse(
    response: Response,
    requestId: string | number,
    method: string
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
                  // Cache SSE responses for critical methods
                  if ((method === 'tools/list' || method === 'initialize') && parsed.result) {
                    this.responseCache.set(method, parsed);
                    this.log(`  cached ${method} (from SSE)`);
                  }
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
    this.log(`Space ID: ${this.spaceId ?? '(not set)'}`);

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
    this.stopHealthCheck();
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

