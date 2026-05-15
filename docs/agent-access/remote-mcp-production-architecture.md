# Remote MCP Production Architecture

Remote MCP is hosted by the Filepad backend at
`/mcp/v1/workspaces/{workspaceId}/stream`.

The backend owns authentication, workspace authorization, tool discovery, tool
execution, evidence recording, contract context, and audit emission. Agent
hosts own only local runtime configuration and optional runtime hooks.

The production path is:

```text
Agent runtime -> remote MCP endpoint -> Agent Access auth -> RuntimeTool bridge
              -> workspace services -> artifacts/contracts/evidence
```

Remote transport supports JSON-RPC over HTTP responses and event-stream
responses where the runtime requests streaming. Tool calls stay server-side so
Filepad can meter, revoke, audit, and evolve the capability surface centrally.
