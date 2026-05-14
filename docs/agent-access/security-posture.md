# Agent Access Security Posture

Filepad treats external agents as untrusted clients. OpenClaw, Codex, Cursor,
Claude Code, Windsurf, and generic MCP hosts may be compromised, prompt-injected,
misconfigured, or running with broader local permissions than Filepad can inspect.

Filepad's job is not to make a host runtime safe. Filepad's job is to reduce blast
radius by placing agent actions behind scoped credentials, typed tools, policy
checks, approval gates, and audit trails.

## Boundary Model

```text
external agent runtime -> Filepad MCP/SDK adapter -> Filepad policy boundary -> governed RuntimeTools
```

Rules:

- External agents never receive raw provider tokens for Gmail, GitHub, or other connected apps.
- External agents receive scoped Filepad integration credentials only.
- Setup session bearer tokens are for setup/read diagnostics only.
- Mutating RuntimeTools require integration auth, declared scopes, workspace role checks, and policy decisions.
- Risky external actions must use governed approval workflows.
- Every external-agent tool execution is auditable.

## Operational Switches

Use these environment variables to control the external-agent surface:

```bash
AGENT_ACCESS_ENABLED=false
```

Disables Agent Access pairing, handoff, external-agent API routes, MCP resource
routes, RuntimeTool calls, and workspace agent-connection management routes.
Health and discovery remain available so operators can see that Agent Access is
disabled intentionally.

```bash
AGENT_ACCESS_SETUP_BEARER_ENABLED=false
```

Disables `Authorization: Bearer fp_sess_...` setup-token auth. HMAC integration
auth remains available for paired agents.

## OpenClaw

OpenClaw should be presented as an untrusted runtime with known host-level risk.
Pairing OpenClaw to Filepad should not be described as making OpenClaw safe.

Recommended language:

> Filepad does not grant OpenClaw raw service tokens or local filesystem access.
> Filepad only exposes scoped, governed tools. Keep OpenClaw updated and sandboxed;
> use Filepad as the policy boundary, not as a trust shortcut.

If OpenClaw native MCP loading fails, agents should use the CLI fallback before
debugging JSON-RPC or HTTP signing:

```bash
filepad-mcp-server --health
filepad-mcp-server --tools --with-schemas
filepad-mcp-server --call filepad_list_tree --args '{}'
filepad-mcp-server --bootstrap
```

## What This Does Not Solve

- A compromised user machine can still read local MCP config and use the scoped
  Filepad credentials until revoked.
- A compromised external runtime can still perform any action allowed by its
  Filepad scopes and approval policy.
- Filepad becomes a high-value target because it stores connected-app credentials.
  Provider tokens must remain encrypted at rest, scoped, revocable, and auditable.

The product claim should stay precise: Filepad reduces agent blast radius through
governance. It does not make arbitrary agent runtimes inherently safe.
