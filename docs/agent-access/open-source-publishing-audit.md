# Agent Access Open Source Publishing Audit

Status: active release gate for the public Agent Access surface.

## Public In V1

- `@filepad/agent-access-sdk`
- `@filepad/agent-connect`
- `@filepad/claude-code-hooks`
- `@filepad/mcp-server`
- Agent Access documentation under `docs/agent-access`
- External-agent proof scripts under `scripts/agent-access`

These are safe to publish because they are client/protocol code. They authenticate through scoped Agent Access keys and do not contain Filepad backend, frontend, billing, admin, queue, signal engine, automation runtime, or deployment internals.

## Private In V1

- Filepad backend
- Filepad frontend
- Founder/admin tools
- Billing and subscription code
- Cloud deployment scripts and production configuration
- Signal/workflow/automation internals
- Connectors such as GitHub, Gmail, Drive, Slack, and CRM integrations
- `@filepad/contracts`

`@filepad/contracts` remains private because it still depends on workspace-only packages and exports broad internal endpoint contracts. Publish a smaller public contract package later only after it is separated from `@filepad/schemas`, `@filepad/billing-types`, and internal-only endpoints.

## Release Gate

Run before publishing:

```bash
pnpm validate:agent-access:release
```

## Public Repo Export

Generate the standalone public repository shape:

```bash
pnpm export:agent-access-public
```

By default this writes to:

```text
.tmp/agent-access-public
```

The export contains only:

- public packages
- Agent Access docs
- external-agent proof scripts
- public CI
- public examples
- root README / LICENSE / SECURITY / CONTRIBUTING

It intentionally excludes the Filepad app, backend, frontend, billing, deployment, private docs, private workspace packages, logs, and local environment files.

See `docs/agent-access/public-github-launch-checklist.md` for the exact GitHub and npm launch sequence.

This runs:

- public-boundary check
- SDK typecheck and tests
- MCP server typecheck and tests
- Claude Code hook adapter typecheck and tests
- agent-connect typecheck and tests
- package tarball checks
- clean-install proof

For a live staging proof, set fresh Agent Access credentials and run:

```bash
FILEPAD_BASE_URL=https://api.filepad.ai \
FILEPAD_WORKSPACE_ID=ws_... \
FILEPAD_AGENT_KEY_ID=ik_... \
FILEPAD_AGENT_SECRET=... \
pnpm proof:mcp staging
```

## Boundary Rules

Public packages must not:

- import private Filepad packages other than the MCP server depending on the SDK
- require a local Filepad monorepo checkout
- contain real workspace ids, integration key ids, artifact ids, file node ids, or secrets
- include source/test files in the npm tarball
- claim OAuth, hosted MCP transport, WebSocket streaming, or remote MCP execution as live
- use `as any` or `as never` in package source

Public packages must:

- include `README.md`
- include `LICENSE`
- include `SECURITY.md`
- publish only `dist`, `README.md`, `LICENSE`, and `SECURITY.md`
- keep `publishConfig.access` set to `public`
- use HMAC-signed Agent Access for V1

## Publish Order

1. `@filepad/agent-access-sdk`
2. `@filepad/mcp-server`
3. `@filepad/claude-code-hooks`
4. `@filepad/agent-connect`

Do not publish `@filepad/contracts` in this release.
