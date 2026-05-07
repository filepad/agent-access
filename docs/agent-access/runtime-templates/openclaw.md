# OpenClaw Filepad Runtime Template

Use this when connecting OpenClaw to Filepad through `@filepad/mcp-server`.

## MCP Setup

```bash
openclaw mcp set filepad '{"command":"npx","args":["-y","@filepad/mcp-server@latest"],"env":{"FILEPAD_BASE_URL":"https://app.filepad.ai/api","FILEPAD_WORKSPACE_ID":"ws_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx","FILEPAD_AGENT_KEY_ID":"ik_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx","FILEPAD_AGENT_SECRET":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}}'
```

## Native Runtime Instructions

Add this to OpenClaw memory, a Filepad skill, or the runtime startup rules:

```text
Filepad is the authoritative workspace context for this connection.
At the start of every session or resume, call filepad_bootstrap or filepad_connect before other Filepad tools.
Read bootstrap.suggestedFirstActions, bootstrap.availableToolGroups, diagnostics.warnings, mailbox.recent, and recentOutcomes.
Then call filepad_get_constitution and filepad_get_profile when available.
Use Filepad tools for Filepad-managed workspace files. Do not rely on local filesystem shortcuts as the source of truth.
For changes, create artifacts or submit proposals through Filepad. Do not directly overwrite workspace files.
For outbound actions such as email, GitHub mutation, compute, or deletion, use governed RuntimeTools and wait for approval when required.
When meaningful work is complete, emit a Filepad event so the workspace activity trail shows what happened.
```

## First Message

```text
Use Filepad now. Call filepad_bootstrap first, read the bootstrap response, inspect the constitution and agent home, then tell me what you can do and what you recommend doing first.
```

## Proof

A valid OpenClaw proof must show:

- `filepad_bootstrap` or `filepad_connect` was called,
- constitution/profile were read or the missing scope was reported,
- the agent created a Filepad artifact or proposal,
- Filepad activity shows the result.
