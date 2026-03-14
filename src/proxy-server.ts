import { readFileSync } from 'fs';
import { join } from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Tool, Prompt, Resource } from '@modelcontextprotocol/sdk/types.js';
import type { VaizConfig, MCPRequest, MCPResponse } from './types.js';
import { VAIZ_TOOLS } from './tools.js';
import { VAIZ_PROMPTS } from './prompts.js';
import { VAIZ_RESOURCES } from './resources.js';

function getPackageMeta() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return {
      version: pkg.version,
      name: pkg.name,
    };
  } catch {
    return { version: 'unknown', name: 'unknown' };
  }
}

const DEFAULT_API_URL = 'https://api.vaiz.com/mcp';
const MAX_RETRIES = 2;
const MAX_RETRIES_429 = 6;
const RETRY_DELAY_MS = 500;
const RETRY_DELAY_429_MS = 3000;
const MAX_RETRY_DELAY_MS = 10000;
const FETCH_TIMEOUT_MS = 5000;


function mergeByName<T extends { name: string }>(
  hardcoded: T[],
  remote: T[],
): T[] {
  const map = new Map<string, T>();
  for (const item of hardcoded) map.set(item.name, item);
  for (const item of remote) map.set(item.name, item);
  return [...map.values()];
}

function mergeByUri(
  hardcoded: Resource[],
  remote: Resource[],
): Resource[] {
  const map = new Map<string, Resource>();
  for (const item of hardcoded) map.set(item.uri, item);
  for (const item of remote) map.set(item.uri, item);
  return [...map.values()];
}

/**
 * MCP Proxy Server that forwards stdio JSON-RPC messages to Vaiz HTTP MCP API.
 *
 * Uses the official MCP SDK with explicit handler registrations so that static
 * analysers can discover tool / prompt definitions in source.
 *
 * Resilience strategy:
 * - Retry with exponential backoff on transient errors
 * - Cache tools/list and prompts/list responses
 * - Background health check when API is down
 * - Re-initialize session + send notifications/tools/list_changed on recovery
 */
export class VaizMCPProxyServer {
  private apiKey: string;
  private spaceId: string | undefined;
  private apiUrl: string;
  private sessionId: string | null = null;
  private debug: boolean;

  private mcpServer: McpServer;
  private transport: StdioServerTransport | null = null;

  private responseCache: Map<string, unknown> = new Map();
  private lastInitParams: Record<string, unknown> | undefined;

  private apiHealthy = true;

  constructor(config: VaizConfig & { debug?: boolean } = {}) {
    this.apiKey = config.apiKey || process.env.VAIZ_API_TOKEN || '';
    this.spaceId = config.spaceId || process.env.VAIZ_SPACE_ID || undefined;
    this.apiUrl = config.apiUrl || process.env.VAIZ_API_URL || DEFAULT_API_URL;
    this.debug = config.debug || process.env.VAIZ_DEBUG === 'true';

    if (!this.apiKey) {
      this.logError(
        'Vaiz API key is required. Set VAIZ_API_TOKEN environment variable.',
      );
      process.exit(1);
    }

    this.mcpServer = new McpServer(
      getPackageMeta(),
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
        },
      },
    );

    this.registerHandlers();
  }

  // ── logging ──────────────────────────────────────────────

  private log(message: string): void {
    if (this.debug) {
      process.stderr.write(`[vaiz-mcp] ${message}\n`);
    }
  }

  private logWarn(message: string): void {
    process.stderr.write(`[vaiz-mcp] WARN: ${message}\n`);
  }

  private logError(message: string): void {
    process.stderr.write(`[vaiz-mcp] ERROR: ${message}\n`);
  }

  // ── HTTP helpers ─────────────────────────────────────────

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      ...(this.spaceId ? { 'Current-Space-Id': this.spaceId } : {}),
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isTransientError(error: unknown): boolean {
    if (error instanceof TypeError) return true;
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('etimedout') ||
        msg.includes('socket') ||
        msg.includes('abort')
      );
    }
    return false;
  }

  private isRetryableStatus(status: number): boolean {
    return status >= 500;
  }

  // ── health check & recovery ──────────────────────────────

  private markApiDown(): void {
    if (!this.apiHealthy) return;
    this.apiHealthy = false;
    this.sessionId = null;
    this.logWarn('API is DOWN — will recover on next successful request');
  }

  private async reinitializeSession(): Promise<boolean> {
    this.log('Re-initializing session...');
    this.sessionId = null;

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
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        ...(this.spaceId ? { 'Current-Space-Id': this.spaceId } : {}),
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(initRequest),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logError(
        `Re-init HTTP ${response.status}: ${body.slice(0, 200)}`,
      );
      return false;
    }

    const newSessionId = response.headers.get('Mcp-Session-Id');
    if (newSessionId) {
      this.sessionId = newSessionId;
      this.log(`New session: ${newSessionId}`);
    }

    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        const text = await response.text();
        for (const line of text.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data) {
              JSON.parse(data);
              break;
            }
          }
        }
      } else {
        await response.json();
      }
    } catch (err) {
      this.logWarn(
        `Re-init: response parse error: ${err instanceof Error ? err.message : err}`,
      );
    }

    await fetch(this.apiUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    }).catch(() => {});

    this.logWarn('Session re-initialized OK');
    return true;
  }

  // ── remote proxy with retry ──────────────────────────────

  private async proxyToRemote(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.apiHealthy) {
      const cached = this.responseCache.get(method);
      if (cached) return cached;
      throw new Error('API unavailable');
    }

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: `proxy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      method,
      params,
    };

    if (method === 'initialize' && params) {
      this.lastInitParams = params;
    }

    let lastError: string | undefined;
    let maxAttempts = MAX_RETRIES;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        this.log(`  retry ${attempt}/${maxAttempts} after ${delay}ms`);
        await this.sleep(delay);
      }

      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        const sid = response.headers.get('Mcp-Session-Id');
        if (sid) {
          this.sessionId = sid;
          this.log(`  session: ${sid}`);
        }

        if (!response.ok) {
          const body = await response.text();
          this.logError(
            `  HTTP ${response.status}: ${body.slice(0, 200)}`,
          );

          if (response.status === 429) {
            maxAttempts = MAX_RETRIES_429;
            if (attempt < maxAttempts) {
              const retryAfter = parseInt(
                response.headers.get('Retry-After') || '',
                10,
              );
              const baseDelay =
                retryAfter && retryAfter > 0
                  ? retryAfter * 1000
                  : RETRY_DELAY_429_MS;
              const jitter = Math.random() * 1000;
              const delay = Math.min(baseDelay + jitter, MAX_RETRY_DELAY_MS);
              this.log(
                `  429 — waiting ${Math.round(delay)}ms before retry`,
              );
              await this.sleep(delay);
              lastError = `HTTP 429`;
              continue;
            }
            lastError = `HTTP 429: all session slots busy`;
            break;
          }

          if (
            this.isRetryableStatus(response.status) &&
            attempt < maxAttempts
          ) {
            lastError = `HTTP ${response.status}`;
            continue;
          }

          if (
            (response.status === 400 || response.status === 404) &&
            attempt < maxAttempts
          ) {
            this.logWarn('Possible stale session — re-initializing');
            try {
              await this.reinitializeSession();
            } catch {
              this.logWarn('Re-init threw, will retry');
            }
            lastError = `HTTP ${response.status}`;
            continue;
          }

          lastError = `HTTP ${response.status}: ${response.statusText}`;
          break;
        }

        // ── Success ──
        if (!this.apiHealthy) {
          this.apiHealthy = true;
          this.logWarn('API is back (via successful request)');
          if (method !== 'tools/list') {
            this.mcpServer.sendToolListChanged();
          }
        }

        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/event-stream')) {
          return await this.parseSSEResult(response, request.id, method);
        }

        const result = (await response.json()) as MCPResponse;

        if (result.result) {
          this.responseCache.set(method, result.result);
          this.log(`  cached ${method}`);
        }

        if (result.error) {
          throw new Error(result.error.message);
        }

        return result.result;
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

    this.logWarn(`${method} failed after retries: ${lastError}`);
    this.markApiDown();

    const cached = this.responseCache.get(method);
    if (cached) return cached;

    throw new Error(`API unavailable: ${lastError}`);
  }

  private async parseSSEResult(
    response: Response,
    requestId: string | number,
    method: string,
  ): Promise<unknown> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body available');

    const decoder = new TextDecoder();
    let buffer = '';

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
                const parsed = JSON.parse(data) as MCPResponse;
                if ('id' in parsed && parsed.id === requestId) {
                  if (parsed.result) {
                    this.responseCache.set(method, parsed.result);
                    this.log(`  cached ${method} (from SSE)`);
                  }
                  if (parsed.error) {
                    throw new Error(parsed.error.message);
                  }
                  return parsed.result;
                }
              } catch (e) {
                if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
                  throw e;
                }
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    throw new Error('No valid response received from SSE stream');
  }

  // ── handler registration ─────────────────────────────────

  private registerHandlers(): void {
    const lowLevel = this.mcpServer.server;

    lowLevel.setRequestHandler(ListToolsRequestSchema, async () => {
      this.log('← tools/list');
      try {
        const result = (await this.proxyToRemote('tools/list')) as {
          tools?: Tool[];
        };
        const remoteTools = result?.tools ?? [];
        return { tools: mergeByName(VAIZ_TOOLS, remoteTools) };
      } catch {
        const cached = this.responseCache.get('tools/list') as {
          tools?: Tool[];
        } | undefined;
        return {
          tools: mergeByName(VAIZ_TOOLS, cached?.tools ?? []),
        };
      }
    });

    lowLevel.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.log(`← tools/call ${request.params.name}`);
      const result = await this.proxyToRemote('tools/call', request.params);
      return result as { content: Array<{ type: string; text: string }> };
    });

    lowLevel.setRequestHandler(ListPromptsRequestSchema, async () => {
      this.log('← prompts/list');
      try {
        const result = (await this.proxyToRemote('prompts/list')) as {
          prompts?: Prompt[];
        };
        const remotePrompts = result?.prompts ?? [];
        return { prompts: mergeByName(VAIZ_PROMPTS, remotePrompts) };
      } catch {
        const cached = this.responseCache.get('prompts/list') as {
          prompts?: Prompt[];
        } | undefined;
        return {
          prompts: mergeByName(VAIZ_PROMPTS, cached?.prompts ?? []),
        };
      }
    });

    lowLevel.setRequestHandler(GetPromptRequestSchema, async (request) => {
      this.log(`← prompts/get ${request.params.name}`);
      const result = await this.proxyToRemote('prompts/get', request.params);
      return result as {
        description?: string;
        messages: Array<{
          role: 'user' | 'assistant';
          content: { type: string; text: string };
        }>;
      };
    });

    lowLevel.setRequestHandler(
      ListResourcesRequestSchema,
      async () => {
        this.log('← resources/list');
        try {
          const result = (await this.proxyToRemote('resources/list')) as {
            resources?: Resource[];
          };
          const remoteResources = result?.resources ?? [];
          return { resources: mergeByUri(VAIZ_RESOURCES, remoteResources) };
        } catch {
          const cached = this.responseCache.get('resources/list') as {
            resources?: Resource[];
          } | undefined;
          return {
            resources: mergeByUri(VAIZ_RESOURCES, cached?.resources ?? []),
          };
        }
      },
    );

    lowLevel.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        this.log(`← resources/read ${request.params.uri}`);
        const result = await this.proxyToRemote(
          'resources/read',
          request.params,
        );
        return result as {
          contents: Array<{ uri: string; text?: string; mimeType?: string }>;
        };
      },
    );
  }

  // ── lifecycle ────────────────────────────────────────────

  async start(): Promise<void> {
    this.log('Starting Vaiz MCP proxy server');
    this.log(`API URL: ${this.apiUrl}`);
    this.log(`Space ID: ${this.spaceId ?? '(not set)'}`);

    this.transport = new StdioServerTransport();
    await this.mcpServer.connect(this.transport);

    this.log('Server connected via stdio transport');

    process.on('SIGINT', async () => {
      this.log('Received SIGINT, shutting down');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      this.log('Received SIGTERM, shutting down');
      await this.stop();
      process.exit(0);
    });
  }

  async stop(): Promise<void> {
    await this.mcpServer.close();
  }
}

export function createVaizMCPProxyServer(
  config?: VaizConfig & { debug?: boolean },
): VaizMCPProxyServer {
  return new VaizMCPProxyServer(config);
}
