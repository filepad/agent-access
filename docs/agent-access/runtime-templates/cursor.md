# Cursor Filepad Runtime Template

Use this for Cursor project rules plus Filepad MCP.

## Cursor Rules

```text
Filepad is the authoritative workspace context for this connection.
At the start of every session or resume, call filepad_bootstrap or filepad_connect before other Filepad tools.
Read bootstrap.suggestedFirstActions, bootstrap.availableToolGroups, diagnostics.warnings, mailbox.recent, and recentOutcomes.
Then call filepad_get_constitution and filepad_get_profile when available.
Use Filepad tools for Filepad-managed workspace files. Do not rely on local repository files as Filepad truth.
For changes, create artifacts or submit proposals through Filepad. Do not directly overwrite workspace files.
For outbound actions such as email, GitHub mutation, compute, or deletion, use governed RuntimeTools and wait for approval when required.
When meaningful work is complete, emit a Filepad event so the workspace activity trail shows what happened.
```

## MCP Config

Add the Filepad MCP server through Cursor's MCP settings using the standard
`@filepad/mcp-server` config.
