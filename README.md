# vaiz-mcp

MCP (Model Context Protocol) client for Vaiz — connect Cursor/Claude to your Vaiz workspace.

## Installation

```bash
npm install -g vaiz-mcp
```

Or use directly via npx:

```bash
npx vaiz-mcp
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VAIZ_API_TOKEN` | ✅ | Your Vaiz API key (Bearer token) |
| `VAIZ_SPACE_ID` | ❌ | Your Vaiz Space ID |
| `VAIZ_API_URL` | ❌ | MCP API URL (default: `https://api.vaiz.com/mcp`) |
| `VAIZ_DEBUG` | ❌ | Set to `true` for debug output to stderr |

### Cursor Configuration

Create or edit `~/.cursor/mcp.json`:

```json
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
```

Or after global installation (`npm install -g vaiz-mcp`):

```json
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
```

### Claude Desktop Configuration

Add to `claude_desktop_config.json`:

```json
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
```

## Usage

After configuration, Cursor/Claude will automatically connect to your Vaiz workspace and gain access to:

- 🔍 Search tasks, projects, users
- 📋 Task management (create, edit, comments)
- 📊 View boards and projects
- 👥 Team member information
- 📝 Work with documents and milestones

## Debugging

To enable debug output, add the `VAIZ_DEBUG` variable:

```json
{
  "mcpServers": {
    "vaiz": {
      "command": "npx",
      "args": ["vaiz-mcp"],
      "env": {
        "VAIZ_API_TOKEN": "your-api-key",
        "VAIZ_DEBUG": "true"
      }
    }
  }
}
```

Debug messages will be output to stderr.

## Programmatic Usage

You can also use the library programmatically:

```typescript
import { createVaizMCPClient } from 'vaiz-mcp';

const client = createVaizMCPClient({
  apiKey: 'your-api-key',
  spaceId: 'your-space-id',
});

// Initialize connection
const initResult = await client.initialize();

// Get list of tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool('search', { 
  query: 'important task',
  entityType: 'task' 
});
```

## Development

```bash
# Clone the repository
git clone https://github.com/vaiz/vaiz-mcp.git
cd vaiz-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
```

## License

MIT
