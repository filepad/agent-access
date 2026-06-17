# Remote MCP Production Architecture

Remote MCP is hosted by the Filepad backend at `/mcp`.

The backend owns OAuth resource binding, workspace authorization, tool discovery, tool
execution, evidence recording, contract context, and audit emission. Agent
hosts own only local runtime configuration and optional runtime hooks.

The production path is:

```text
Agent runtime -> /mcp -> Agent Access auth -> ExternalAgentKernel
              -> workspace services -> artifacts/contracts/evidence
```

Remote transport supports JSON-RPC over HTTP responses and event-stream
responses where the runtime requests streaming. Tool calls stay server-side so
Filepad can meter, revoke, audit, and evolve the capability surface centrally.
