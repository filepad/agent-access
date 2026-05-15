# Runtime Native Onboarding

Runtimes should connect through Filepad's remote MCP endpoint. The pairing CLI
selects the runtime-specific config target and writes the server object returned
by the backend.

Claude Code may also receive a desired hooks state. Hooks are installed only for
the Claude Code runtime and use local credentials stored outside the project.

Runtime authors should support URL-based MCP servers, bearer headers, reloadable
server configuration, and clear tool discovery errors.
