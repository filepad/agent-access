# Public Package Boundary

The public Agent Access boundary contains:

- `@filepad/agent-access-sdk`: typed HTTP client and remote MCP helper.
- `@filepad/agent-connect`: pairing CLI that writes remote endpoint config.
- `@filepad/claude-code-hooks`: Claude Code local enforcement adapter.

The boundary excludes Filepad app code, backend internals, frontend internals,
deployment configuration, private workspace packages, and local MCP bridge
packages. Public packages must not import from `apps/backend`, `apps/frontend`,
or private workspace-only modules.
