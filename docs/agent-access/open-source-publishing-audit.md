# Open Source Publishing Audit

The public release contains the SDK, pairing CLI, MCP server, Claude Code hook
adapter, Guardian, Claude Code runtime adapter, public docs, CI scripts, and
release scripts. It excludes hosted application source, backend source,
frontend source, private contracts, deployment configuration, and local bridge
packages.

Audit every release for private imports, real credentials, committed build
output, workspace-only dependency specifiers, and docs that contradict the
remote-first connection model.
