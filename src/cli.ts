#!/usr/bin/env node

import { createVaizMCPProxyServer } from './proxy-server.js';

function printHelp(): void {
  console.log(`
vaiz-mcp - MCP proxy server for Vaiz

Usage:
  vaiz-mcp [options]

Environment Variables:
  VAIZ_API_TOKEN    Required. Your Vaiz API key (Bearer token)
  VAIZ_SPACE_ID   Optional. Your Vaiz Space ID
  VAIZ_API_URL    Optional. Vaiz MCP API URL (default: https://api.vaiz.com/mcp)
  VAIZ_DEBUG      Optional. Set to 'true' to enable debug logging to stderr

Options:
  --help, -h      Show this help message
  --version, -v   Show version number

Example Cursor configuration (~/.cursor/mcp.json):
  {
    "mcpServers": {
      "vaiz": {
        "command": "npx",
        "args": ["vaiz-mcp"],
        "env": {
          "VAIZ_API_TOKEN": "your-api-key",
          "VAIZ_SPACE_ID": "your-space-id"
        }
      }
    }
  }

Or after global installation:
  {
    "mcpServers": {
      "vaiz": {
        "command": "vaiz-mcp",
        "env": {
          "VAIZ_API_TOKEN": "your-api-key",
          "VAIZ_SPACE_ID": "your-space-id"
        }
      }
    }
  }
`);
}

function printVersion(): void {
  console.log('vaiz-mcp v0.1.0');
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    printVersion();
    process.exit(0);
  }

  // Check for required environment variables
  if (!process.env.VAIZ_API_TOKEN) {
    console.error('Error: VAIZ_API_TOKEN environment variable is required');
    console.error('Run "vaiz-mcp --help" for usage information');
    process.exit(1);
  }

  const server = createVaizMCPProxyServer();
  server.start();
}

main();
