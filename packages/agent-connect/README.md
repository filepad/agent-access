# @filepad/agent-connect

Remote MCP pairing CLI for Filepad Agent Access.

```bash
npx -y @filepad/agent-connect@latest pair A3K9MZ2X --runtime openclaw
```

The command exchanges a short Filepad pairing code, writes the runtime's remote
MCP endpoint configuration, prints a concise handoff for the current agent
session, and instructs the host to restart/reload MCP. After restart, call
`filepad_bootstrap`.

That restart/reload message is an expected success state, not a pairing
failure. Some runtimes, including Codex, load MCP tools only when a session
starts; the CLI therefore reports `paired=true`, `configWritten=true`,
`nativeToolsAvailable=false`, and `requiresHostRestart=true` so agents can
calmly ask the user to restart before continuing.

For `--runtime openclaw`, the CLI writes Filepad under
`mcp.servers.filepad`, matching OpenClaw's native config schema. Other generic
MCP clients use the standard `mcpServers.filepad` shape.

The handoff also prints agent-facing probes:

- public health: `/agent-api/v1/health`
- public discovery: `/agent-api/v1/discovery`
- authenticated HTTP bootstrap fallback:
  `/agent-api/v1/workspaces/{workspaceId}/bootstrap`
- remote MCP stream:
  `/mcp/v1/workspaces/{workspaceId}/stream`

Use `--output json` for automation:

```bash
npx -y @filepad/agent-connect@latest pair A3K9MZ2X --runtime openclaw --output json
```
