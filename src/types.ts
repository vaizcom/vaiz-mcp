export interface VaizConfig {
  /**
   * Vaiz API key (Bearer token)
   * Can be set via VAIZ_API_TOKEN environment variable
   */
  apiKey?: string;

  /**
   * Current Space ID for Vaiz workspace
   * Can be set via VAIZ_SPACE_ID environment variable
   */
  spaceId?: string;

  /**
   * Vaiz MCP API URL
   * Defaults to https://api.vaiz.com/mcp
   * Can be set via VAIZ_API_URL environment variable
   */
  apiUrl?: string;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export type MCPMessage = MCPRequest | MCPResponse | MCPNotification;

