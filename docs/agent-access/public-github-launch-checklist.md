# Public GitHub Launch Checklist

Use this checklist after `pnpm export:agent-access-public` passes validation.

## 1. Generate The Public Repo

```bash
pnpm export:agent-access-public
cd .tmp/agent-access-public
pnpm install --no-frozen-lockfile
pnpm validate:agent-access:release
```

The export directory is intentionally ignored by the private Filepad monorepo. It is safe to initialize as its own Git repository.

## 2. Create The GitHub Repository

Recommended repository:

```text
filepad/agent-access
```

If the `filepad` GitHub organization is not available yet, use the active Filepad-owned GitHub account and transfer later.

```bash
cd .tmp/agent-access-public
git init
git add .
git commit -m "Initial public Agent Access release"
gh repo create filepad/agent-access --public --source=. --remote=origin --push
```

Do not push the private Filepad monorepo.

## 3. Protect The Repository

Before announcing:

- enable GitHub secret scanning
- enable branch protection for `main`
- require the CI workflow to pass
- restrict package publish permissions
- add `security@filepad.ai` as the vulnerability contact

## 4. Publish npm Packages

Log in to npm with an account that can publish to `@filepad`:

```bash
npm login
npm whoami
```

Publish in order:

```bash
cd .tmp/agent-access-public
pnpm validate:agent-access:release

cd packages/agent-access-sdk
npm publish --access public

cd ../mcp-server
npm publish --access public
```

Verify:

```bash
npm view @filepad/agent-access-sdk version
npm view @filepad/mcp-server version
npx -y @filepad/mcp-server
```

## 5. Live Proof

Create a fresh Agent Access key in staging/production, then run:

```bash
FILEPAD_BASE_URL=https://app.filepad.ai/api \
FILEPAD_WORKSPACE_ID=ws_... \
FILEPAD_AGENT_KEY_ID=ik_... \
FILEPAD_AGENT_SECRET=... \
pnpm proof:mcp staging
```

Expected proof path:

- `filepad_health`
- `filepad_list_tree`
- `filepad_search`
- `filepad_list_signals`
- `filepad_emit_event`

After npm publish, repeat from a clean directory using `npx -y @filepad/mcp-server`.

## 6. What Not To Publish Yet

- `@filepad/contracts`
- Filepad backend/frontend
- cloud deployment scripts
- billing/admin code
- connector internals
- private logs or workspace exports

