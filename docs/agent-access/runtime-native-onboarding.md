# Runtime Native Onboarding

Runtimes should connect through Filepad's remote MCP endpoint. The OAuth setup CLI
selects the runtime-specific config target and writes the server object returned
by the backend.

`@filepad/agent-connect` owns only MCP OAuth/config. Runtime-specific contract
verification setup is owned by runtime adapters.

Claude Code contract verification is installed by
`@filepad/runtime-adapter-claude-code`. That adapter writes Claude Code hook
settings, stores credentials outside the project, records a repo-local runtime
manifest, and verifies the setup with `doctor`. The normal human flow should use
`filepad-runtime-adapter-claude-code install --contract-id <id> --workspace-id <id> --agent-key-id <id>` with `FILEPAD_AGENT_SECRET` set;
explicit `FILEPAD_AGENT_SECRET` install is for CI or controlled automation.

Runtime authors should support URL-based MCP servers, bearer headers, reloadable
server configuration, and clear tool discovery errors.
