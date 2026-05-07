# Testing External Agents

This document explains how to prove that an external agent can use Filepad through **Agent Access** — and how to avoid accidentally counting local bypasses as valid proof.

## The Goal

A valid proof shows that an external agent runtime, running outside the Filepad infrastructure, can:

1. Authenticate with Agent Access HMAC credentials
2. Read workspace context through the public Agent API
3. Create artifacts, propose edits, and emit events through MCP stdio
4. Read and acknowledge addressed mailbox notifications when scoped
5. Query visible workspace signals through Agent Access
6. Do all of this **without** touching the local filesystem, database, or private endpoints

## What Counts as Bypass (Invalid Proof)

The following techniques **do not** prove Agent Access works. They prove the local environment is porous:

| Bypass | Why it invalidates the proof |
|--------|------------------------------|
| `exec` to read `.env` files | The agent learned secrets from disk, not from Filepad |
| Direct `psql` queries | The agent bypassed the API and touched the database |
| `curl` to `/api/internal/...` | Private routes are not part of the Agent Access contract |
| Reading workspace files from disk | Local filesystem access is not Agent Access |
| Session cookie reuse | Browser session auth is not Agent Access HMAC |
| Reading `docker-compose.yml` for DB credentials | Environment inspection is not API integration |

## OpenClaw Specific Warning

OpenClaw and similar agent frameworks may have an `exec` tool that lets the agent run shell commands. If `exec` is enabled, the agent can:

- Read `.env` files containing `DATABASE_URL`
- Run `psql` and query the database directly
- Read local workspace files from the filesystem
- Bypass Filepad entirely

**Valid proof requires one of:**

1. **Disable `exec`** in the agent configuration, or
2. **Explicitly constrain** the agent to use only MCP tools and reject any `exec` attempt

## Valid Proof Checklist

Before declaring Agent Access proof complete, verify:

- [ ] The agent runtime is started with **only** `FILEPAD_BASE_URL`, `FILEPAD_WORKSPACE_ID`, `FILEPAD_AGENT_KEY_ID`, and `FILEPAD_AGENT_SECRET`
- [ ] No `.env` file, local filesystem path, or database connection string is provided to the agent
- [ ] The agent uses **MCP stdio JSON-RPC** or the **Agent Access SDK** to communicate with Filepad
- [ ] Mailbox checks use `filepad://workspace/{workspaceId}/mailbox` or `getMailbox`, not database queries
- [ ] Signal checks use `filepad_list_signals`, `filepad_get_signal`, or the SDK signal methods
- [ ] `psql`, `curl` to private endpoints, and `exec` are not available to the agent
- [ ] The proof script or harness validates each step independently (initialize → tools/list → health → tree)
- [ ] The proof is repeatable on a clean machine with only the published packages installed

## Environment Variables

All proof scripts respect `FILEPAD_BASE_URL` if set. If not set, they use target defaults:

| Target | Default Base URL |
|--------|------------------|
| `local` | `http://localhost:3000/api` |
| `staging` | `https://app.filepad.ai/api` |

Required variables for backend-connected proofs:

```bash
export FILEPAD_WORKSPACE_ID="ws_..."
export FILEPAD_AGENT_KEY_ID="ik_..."
export FILEPAD_AGENT_SECRET="..."
```

Optional:

```bash
export FILEPAD_BASE_URL="https://app.filepad.ai/api"  # overrides target default
```

## Running the MCP Proof Harness

The MCP proof script performs a full stdio JSON-RPC proof:

```bash
# Local backend (uses http://localhost:3000/api)
FILEPAD_WORKSPACE_ID=ws_... \
FILEPAD_AGENT_KEY_ID=ik_... \
FILEPAD_AGENT_SECRET=... \
  pnpm proof:mcp local

# Staging backend (uses https://app.filepad.ai/api)
FILEPAD_WORKSPACE_ID=ws_... \
FILEPAD_AGENT_KEY_ID=ik_... \
FILEPAD_AGENT_SECRET=... \
  pnpm proof:mcp staging

# Override base URL explicitly
FILEPAD_BASE_URL=https://app.filepad.ai/api \
FILEPAD_WORKSPACE_ID=ws_... \
FILEPAD_AGENT_KEY_ID=ik_... \
FILEPAD_AGENT_SECRET=... \
  pnpm proof:mcp staging
```

This script performs these steps:
1. `initialize` — MCP protocol handshake
2. `tools/list` — Verify scope-filtered tools are exposed
3. `filepad_connect` — Verify HMAC auth, scope retrieval, RuntimeTool discovery, agent home, mailbox, and recent outcomes
4. `filepad_health` — Verify the lightweight compatibility health check
5. `filepad_list_tree` — Verify workspace tree access
6. `filepad_search` — Verify indexed search works
7. `filepad_emit_event` — Verify activity event emission
8. `filepad_ack_notification` — Verify mailbox acknowledgement when `notifications:read` is granted
9. `filepad_list_signals` / `filepad_get_signal` — Verify signals are visible through public Agent Access

If authentication fails, the script prints diagnostic context:
- Base URL used
- Workspace ID used
- Key ID used
- Likely causes: revoked key, wrong secret, wrong workspace, base URL mismatch, clock skew

## Clean Install Proof

To prove the packages work outside the monorepo:

```bash
# Local (install-only, no backend check)
pnpm proof:clean-install local

# Staging (full backend-connected proof)
FILEPAD_WORKSPACE_ID=ws_... \
FILEPAD_AGENT_KEY_ID=ik_... \
FILEPAD_AGENT_SECRET=... \
  pnpm proof:clean-install staging
```

This script:
1. Builds and packs both packages
2. Installs them in a temporary directory outside the monorepo
3. Runs the CLI with missing env vars (confirms clean error)
4. Runs the CLI with real credentials (confirms MCP health check)
5. Cleans up all temp files

## What the Proof Validates

| Step | What it proves |
|------|----------------|
| `initialize` | MCP protocol handshake works |
| `tools/list` | Scopes are correctly filtered and tools are exposed |
| `filepad_connect` | HMAC auth works and the agent can discover identity, scopes, tools, agent home, mailbox, and recent outcomes |
| `filepad_health` | Lightweight compatibility health check works |
| `filepad_list_tree` | Workspace context is accessible through the API |
| `filepad_search` | Indexed workspace search works |
| `filepad_emit_event` | Activity events can be emitted into the audit trail |
| `filepad_ack_notification` | Addressed Filepad callbacks can be marked processed without broad mutation |
| `filepad_list_signals` | Workspace signal state is queryable without UI/database access |

## Red Flags

If you see any of these during proof, the test is invalid:

- The agent "found" credentials by reading `.env`
- The agent used `psql` or database connections
- The agent accessed files via local paths like `/home/user/filepad/...`
- The proof script required running inside the monorepo with access to `apps/backend/`
- The agent used a browser session cookie instead of HMAC headers

## Summary

**Valid proof:** External agent + HMAC credentials + public Agent API + MCP stdio only.

**Invalid proof:** Any technique that lets the agent bypass the public API surface.
