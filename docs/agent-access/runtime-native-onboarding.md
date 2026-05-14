# Runtime-Native Agent Onboarding

MCP makes Filepad tools available, but it does not automatically make Filepad
the agent runtime's identity, memory, or planning loop.

External agents usually have their own native context stack:

- OpenClaw-style runtimes may load native soul, memory, heartbeat, and skills.
- Claude Code-style runtimes may load project instructions and MCP servers.
- Codex-style runtimes may load repository instructions and local skills.
- Cursor, Windsurf, and similar runtimes may load project rules plus MCP tools.

Filepad should integrate with each layer instead of assuming `tools/list` is
enough.

## Product Rule

Filepad MCP is the tool bridge. Filepad runtime instructions are the behavior
bridge.

Every first-class external-agent setup should provide both:

1. Pre-MCP pairing through `@filepad/agent-connect`.
2. MCP configuration for `@filepad/mcp-server`.
3. Runtime-native instructions that tell the agent to call `filepad_bootstrap`
   first and treat Filepad as the workspace source of truth.

## Pairing Before MCP Exists

MCP cannot be the entry point because the host runtime may not have loaded the
Filepad MCP server yet. The first-class flow is:

```bash
npx -y @filepad/agent-connect pair ABC12345 --runtime openclaw
```

The CLI writes the host config, emits structured JSON for automation, and prints
a concise handoff for the current agent session. After the host restarts or
reloads MCP, the agent calls `filepad_bootstrap` for the full tool manifest and
workspace context.

Runtime-specific config shape matters. OpenClaw expects Filepad at
`mcp.servers.filepad`; generic MCP clients commonly expect
`mcpServers.filepad`. `@filepad/agent-connect` must write the correct shape for
the selected `--runtime`.

Agents must also have a non-MCP recovery path. The backend exposes public
health/discovery probes at `/agent-api/v1/health` and
`/agent-api/v1/discovery`, plus an authenticated HTTP bootstrap fallback at
`/agent-api/v1/workspaces/{workspaceId}/bootstrap`. The MCP server also supports
`filepad-mcp-server --health`, `--bootstrap`, and `--tools` when launched
directly with the same environment variables.
Use `filepad-mcp-server --tools --with-schemas` to inspect parameters and
`filepad-mcp-server --call <toolName> --args '{}'` to test one tool without
writing a JSON-RPC client.

The restart/reload handoff is a successful intermediate state. Agents should not
treat missing native Filepad tools in the same session as a pairing failure.
Instead, report that pairing succeeded, the MCP config was written, and the host
must restart or reload MCP before `filepad_bootstrap` can appear. The structured
state is:

```json
{
  "paired": true,
  "configWritten": true,
  "nativeToolsAvailable": false,
  "requiresHostRestart": true,
  "afterRestartTool": "filepad_bootstrap"
}
```

## Required Startup Ritual

When a Filepad-connected agent starts or resumes:

1. Call `filepad_bootstrap` or `filepad_connect`.
2. Read `bootstrap.suggestedFirstActions`.
3. Read `bootstrap.availableToolGroups`.
4. Inspect `diagnostics.warnings`.
5. Review `mailbox.recent` and `recentOutcomes`.
6. Call `filepad_get_constitution` when available.
7. Call `filepad_get_profile` when available.
8. Use Filepad tools for Filepad-managed files.
9. Create artifacts or proposals for durable output.
10. Emit a Filepad event when meaningful work completes.

## Runtime Instruction Pack

Use this text in OpenClaw skills, Claude/Codex project instructions, Cursor or
Windsurf rules, and custom agent system prompts:

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

## Runtime-Specific Notes

### OpenClaw

OpenClaw may prioritize its own native soul, memory, heartbeat, and skills.
Install Filepad as MCP and add the Filepad runtime instruction pack to the
OpenClaw-native skill or memory layer. Without that, Filepad remains only a
toolbox.

Template: [runtime-templates/openclaw.md](./runtime-templates/openclaw.md)

### Claude Desktop / Claude Code

Use the MCP config for tools. Add the runtime instruction pack to the project's
agent instructions so Claude calls `filepad_bootstrap` before treating Filepad
as ordinary optional tools.

Template: [runtime-templates/claude-code.md](./runtime-templates/claude-code.md)

### Codex

Use repository instructions or a local skill to make Filepad startup behavior
explicit. Codex-style agents should treat Filepad as external workspace state
and keep codebase edits separate from Filepad artifact/proposal edits.

Template: [runtime-templates/codex.md](./runtime-templates/codex.md)

### Cursor

Use Cursor project rules plus the Filepad MCP server so Filepad is part of the
agent's planning context before it starts editing.

Template: [runtime-templates/cursor.md](./runtime-templates/cursor.md)

### Windsurf

Use Windsurf rules plus the Filepad MCP server so Filepad is part of the
agent's planning context before it starts editing.

Template: [runtime-templates/windsurf.md](./runtime-templates/windsurf.md)

### Custom Agents

Use the SDK `connect()` helper at startup, then hydrate the agent planner with
the returned `bootstrap`, `agentHome`, `mailbox`, `recentOutcomes`, and `tools`.

Template: [runtime-templates/generic-mcp.md](./runtime-templates/generic-mcp.md)

## Acceptance Proof

A Filepad-native external-agent proof is valid only when the agent:

- starts from the pasted MCP config,
- calls `filepad_bootstrap` or `filepad_connect`,
- reads constitution/profile or reports why it cannot,
- uses Filepad tool groups to decide what it can do,
- creates an artifact or proposal through Filepad,
- emits activity or produces visible workspace provenance.

If the agent only lists tools or reads local files, Filepad is not first-class
yet.
