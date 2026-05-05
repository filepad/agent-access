# @filepad/mcp-server

MCP server for Filepad Agent Access. Exposes Filepad workspaces as tools to Claude Desktop, Cursor, Windsurf, and any other MCP-compatible client.

## What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open protocol for connecting AI assistants to external data sources and tools. This package implements an MCP server that speaks stdio JSON-RPC over Filepad Agent Access.

## Install

```bash
npm install -g @filepad/mcp-server
```

Requires Node.js 18+.

## Claude Desktop Configuration

Add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "filepad": {
      "command": "npx",
      "args": ["-y", "@filepad/mcp-server"],
      "env": {
        "FILEPAD_BASE_URL": "https://app.filepad.ai/api",
        "FILEPAD_WORKSPACE_ID": "ws_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "FILEPAD_AGENT_KEY_ID": "ik_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "FILEPAD_AGENT_SECRET": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Restart Claude Desktop. You should see Filepad tools in the tool list.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FILEPAD_BASE_URL` | Yes | Filepad API base URL (e.g. `https://app.filepad.ai/api`) |
| `FILEPAD_WORKSPACE_ID` | Yes | Workspace id (e.g. `ws_...`) |
| `FILEPAD_AGENT_KEY_ID` | Yes | Agent Access key id (e.g. `ik_...`) |
| `FILEPAD_AGENT_SECRET` | Yes | Agent Access secret (shown once on creation) |

## Available Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `filepad_health` | None | Check connection and report granted scopes |
| `filepad_list_tree` | `env:read` | List workspace folders and files |
| `filepad_read_file` | `env:read` | Read a file by id |
| `filepad_search` | `env:read` | Search workspace context |
| `filepad_create_artifact` | `artifacts:write` | Create a note artifact |
| `filepad_propose_edit` | `files:propose` | Propose a reviewable edit |
| `filepad_emit_event` | `events.write` | Emit an activity event |
| `filepad_create_signal` | `signals:write` | Create a signal |
| `filepad_list_signals` | `env:read` | Query visible workspace signals |
| `filepad_get_signal` | `env:read` | Read one workspace signal by id |
| `filepad_ack_notification` | `notifications:read` | Acknowledge mailbox notifications after processing |
| `filepad_get_profile` | `env:read` | Read this integration's agent home profile files |
| `filepad_update_profile` | `env:read`, `files:propose` | Propose a reviewable update to the agent profile |

Tools are automatically filtered by your key's granted scopes. If your key only has `env:read`, you will only see read tools.

## Resources and Prompts

The server also exposes:

- **Resources** — Workspace environment, file tree, and individual files as `filepad://` URIs
- **Mailbox** — Filepad callbacks addressed to this integration at `filepad://workspace/{workspaceId}/mailbox` when `notifications:read` is granted
- **Prompts** — Skill instructions from `skills/*.md` files in the workspace
- **Agent home** — Per-key profile files under `agents/integrations/{keyId}/` for identity, learnings, goals, and timeline

## Programmatic Usage

You can also use the server class directly in your own code:

```typescript
import { FilepadMcpServer } from '@filepad/mcp-server';

const server = new FilepadMcpServer({
  baseUrl: process.env.FILEPAD_BASE_URL!,
  workspaceId: process.env.FILEPAD_WORKSPACE_ID!,
  keyId: process.env.FILEPAD_AGENT_KEY_ID!,
  secret: process.env.FILEPAD_AGENT_SECRET!,
});

await server.initialize();

const response = await server.handleMessage({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {},
});

console.log(response);
```

## Security

- Secrets are never logged
- Requests are signed with HMAC-SHA256
- Nonce replay protection is enforced by the backend
- Scope enforcement is strict — missing scopes return `403`

## License

MIT
