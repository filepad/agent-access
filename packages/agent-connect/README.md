# @filepad/agent-connect

OAuth remote MCP setup CLI for Filepad Agent Access.

```bash
npx -y @filepad/agent-connect@latest connect --runtime openclaw
```

The command opens Filepad OAuth consent, obtains a resource-bound `/mcp` bearer token, writes the runtime's remote
MCP endpoint configuration, prints a concise handoff for the current agent
session, and instructs the host to restart/reload MCP. After restart, call
`filepad_bootstrap`.

This package does not install contract verification hooks. Claude Code contract
verification is owned by `@filepad/runtime-adapter-claude-code`.

That restart/reload message is an expected success state, not a connection
failure. Some runtimes, including Codex, load MCP tools only when a session
starts; the CLI therefore reports `connected=true`, `configWritten=true`,
`nativeToolsAvailable=false`, and `requiresHostRestart=true` so agents can
calmly ask the user to restart before continuing.

For `--runtime openclaw`, the CLI writes Filepad under
`mcp.servers.filepad`, matching OpenClaw's native config schema. Other generic
MCP clients use the standard `mcpServers.filepad` shape.

The handoff also prints agent-facing probes:

- public health: `/agent-api/v1/health`
- public discovery: `/agent-api/v1/discovery`
- remote MCP stream:
  `/mcp`

Use `--output json` for automation:

```bash
npx -y @filepad/agent-connect@latest connect --runtime openclaw --output json
```
