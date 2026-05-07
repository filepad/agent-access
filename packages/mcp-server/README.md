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
      "args": ["-y", "@filepad/mcp-server@latest"],
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

Restart Claude Desktop. Start with `filepad_connect` or `filepad_bootstrap`;
it returns identity, workspace, scopes, available RuntimeTools, agent home,
mailbox, recent outcomes, missing permissions, tool groups, and suggested
first actions in one response.

First prompt to send your agent:

```text
Use Filepad now. Call filepad_connect first, read the bootstrap response, inspect the constitution and agent home, then tell me what you can do and what you recommend doing first.
```

For OpenClaw, Claude Code, Codex, Cursor, Windsurf, or custom agents, add the
runtime instruction pack from
[`docs/agent-access/runtime-native-onboarding.md`](https://github.com/filepad/agent-access/blob/main/docs/agent-access/runtime-native-onboarding.md)
to the agent's native project rules, memory, skill, or instruction file. MCP
exposes tools; runtime instructions make Filepad part of the agent's startup
loop.

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
| `filepad_connect` | None | Start-here onboarding/resume diagnostics with workspace identity, scopes, tools, agent home, mailbox, recent outcomes, and suggested first actions |
| `filepad_bootstrap` | None | Alias for `filepad_connect` for MCP clients that look for bootstrap-style tools |
| `filepad_health` | None | Check connection and report granted scopes |
| `filepad_list_tree` | `tools:call`, `env:read` | Compatibility alias for canonical workspace file-tree listing |
| `filepad_read_file` | `tools:call`, `env:read` | Compatibility alias for canonical workspace file reading |
| `filepad_search` | `tools:call`, `env:read` | Compatibility alias for canonical workspace search |
| `filepad_create_artifact` | `tools:call`, `artifacts:direct_write` | Compatibility alias for governed artifact creation |
| `filepad_create_artifact_from_file` | `tools:call`, `artifacts:direct_write` | Read a local text/markdown file and create a governed artifact |
| `filepad_propose_edit` | `files:propose` | Propose a reviewable edit |
| `filepad_emit_event` | `events.write` | Emit an activity event |
| `filepad_create_signal` | `signals:write` | Create a signal |
| `filepad_list_signals` | `env:read` | Query visible workspace signals |
| `filepad_get_signal` | `env:read` | Read one workspace signal by id |
| `filepad_ack_notification` | `notifications:read` | Acknowledge mailbox notifications after processing |
| `filepad_get_profile` | `env:read` | Read this integration's agent home profile files |
| `filepad_update_profile` | `env:read`, `files:propose` | Propose a reviewable update to the agent profile |
| `gmail_search` / `gmail_get_message` | `tools:call`, `gmail:read` | Read synced Gmail source records |
| `gmail_import_message` | `tools:call`, `gmail:write` | Promote a synced Gmail source record into workspace knowledge through Temporal |
| `gmail_create_draft` / `gmail_send_with_approval` | `tools:call`, `gmail:write` | Request governed Gmail outbound actions that wait for human approval |

Tools are automatically filtered by your key's granted scopes. If your key only has `env:read`, you will only see read tools. Provider tools such as Gmail are discovered from the backend canonical RuntimeTool catalog so MCP clients use the same policy path as FilepadAI and automations. Local `filepad_*` mutation helpers are compatibility aliases over the governed Agent Access/RuntimeTool path, not a separate write system.

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
