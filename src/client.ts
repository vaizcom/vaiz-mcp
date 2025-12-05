import type { VaizConfig, MCPMessage, MCPRequest, MCPResponse } from './types.js';

const DEFAULT_API_URL = 'https://api.vaiz.com/mcp';

export class VaizMCPClient {
  private apiKey: string;
  private spaceId: string;
  private apiUrl: string;
  private sessionId: string | null = null;

  constructor(config: VaizConfig = {}) {
    this.apiKey = config.apiKey || process.env.VAIZ_API_TOKEN || '';
    this.spaceId = config.spaceId || process.env.VAIZ_SPACE_ID || '';
    this.apiUrl = config.apiUrl || process.env.VAIZ_API_URL || DEFAULT_API_URL;

    if (!this.apiKey) {
      throw new Error(
        'Vaiz API key is required. Set VAIZ_API_TOKEN environment variable or pass apiKey in config.'
      );
    }

    if (!this.spaceId) {
      throw new Error(
        'Vaiz Space ID is required. Set VAIZ_SPACE_ID environment variable or pass spaceId in config.'
      );
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Current-Space-Id': this.spaceId,
      'Content-Type': 'application/json',
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
    };
  }

  /**
   * Send a JSON-RPC request to the Vaiz MCP server
   */
  async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    // Store session ID from response if present
    const newSessionId = response.headers.get('Mcp-Session-Id');
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    if (!response.ok) {
      const errorText = await response.text();
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32000,
          message: `HTTP ${response.status}: ${response.statusText}`,
          data: errorText,
        },
      };
    }

    const contentType = response.headers.get('content-type') || '';
    
    // Handle SSE responses
    if (contentType.includes('text/event-stream')) {
      return this.handleSSEResponse(response, request.id);
    }

    // Handle regular JSON responses
    const result = await response.json() as MCPResponse;
    return result;
  }

  /**
   * Handle Server-Sent Events response from the MCP server
   */
  private async handleSSEResponse(
    response: Response,
    requestId: string | number
  ): Promise<MCPResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      return {
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: -32000,
          message: 'No response body available',
        },
      };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let result: MCPResponse | null = null;

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
                const parsed = JSON.parse(data) as MCPMessage;
                if ('id' in parsed && parsed.id === requestId) {
                  result = parsed as MCPResponse;
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

    return (
      result || {
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: -32000,
          message: 'No valid response received from SSE stream',
        },
      }
    );
  }

  /**
   * Initialize the MCP connection
   */
  async initialize(): Promise<MCPResponse> {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'vaiz-mcp',
          version: '0.1.0',
        },
      },
    });
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPResponse> {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: 'list-tools-1',
      method: 'tools/list',
    });
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<MCPResponse> {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: `call-${Date.now()}`,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    });
  }

  /**
   * List available resources from the MCP server
   */
  async listResources(): Promise<MCPResponse> {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: 'list-resources-1',
      method: 'resources/list',
    });
  }

  /**
   * Read a resource from the MCP server
   */
  async readResource(uri: string): Promise<MCPResponse> {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: `read-${Date.now()}`,
      method: 'resources/read',
      params: { uri },
    });
  }
}

export function createVaizMCPClient(config?: VaizConfig): VaizMCPClient {
  return new VaizMCPClient(config);
}

