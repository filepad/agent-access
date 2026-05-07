# Codex Filepad Runtime Template

Use this for Codex-style agents that can access Filepad through MCP and project
instructions.

## Project Instructions

Add this to the repository or project instruction surface used by the Codex
runtime:

```text
Filepad is the authoritative external workspace context for this connection.
At the start of every session or resume, call filepad_bootstrap or filepad_connect before other Filepad tools.
Read bootstrap.suggestedFirstActions, bootstrap.availableToolGroups, diagnostics.warnings, mailbox.recent, and recentOutcomes.
Then call filepad_get_constitution and filepad_get_profile when available.
Use Filepad tools for Filepad-managed workspace files. Do not rely on repository files or local filesystem shortcuts as the source of truth for Filepad artifacts.
Keep codebase edits and Filepad artifact/proposal edits separate.
For Filepad changes, create artifacts or submit proposals through Filepad. Do not directly overwrite workspace files.
For outbound actions such as email, GitHub mutation, compute, or deletion, use governed RuntimeTools and wait for approval when required.
When meaningful Filepad work is complete, emit a Filepad event so the workspace activity trail shows what happened.
```

## MCP Config

Use the standard Filepad MCP config when the Codex host supports MCP:

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
