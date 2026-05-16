# @filepad/guardian

Filepad Guardian is the local repo-runtime verifier for Active Contracts.

It runs inside an explicit external execution target, such as an agent's local
repository, a CI checkout, or a sandbox checkout. It does not belong in the
Filepad product backend.

## Install

```bash
npm install -g @filepad/guardian
```

or run it without a global install:

```bash
npx -y @filepad/guardian@latest --help
```

## Required Environment

Guardian reports evidence through Agent Access credentials:

```bash
export FILEPAD_BASE_URL=https://api.filepad.ai
export FILEPAD_WORKSPACE_ID=ws_...
export FILEPAD_AGENT_KEY_ID=ik_...
export FILEPAD_AGENT_SECRET=...
```

The credentials must be issued for the workspace and execution target that the
agent is working against. Generic MCP agents should not self-declare trusted
Guardian evidence.

## Commands

```bash
filepad-guardian status
filepad-guardian contract status --contract-id ac_...
filepad-guardian run --contract-id ac_... --check-id backend_typecheck
filepad-guardian run --contract-id ac_... --check-id backend_tests -- pnpm test
filepad-guardian report --contract-id ac_... --json evidence.json
filepad-guardian soundness --contract-id ac_... --repo-root .
filepad-guardian watch --contract-id ac_... --repo-root . --rerun manual
```

## Boundary

Guardian owns repo-runtime work:

- contract check execution
- command execution
- file existence checks
- source repo search
- local git provenance capture
- watcher-driven reruns
- contract runner behavior
- optional repo analyzer behavior such as TypeScript symbol, AST, and static
  soundness checks

Filepad owns the coordination plane:

- workspaces
- docs and artifacts
- contracts as user-visible agreements
- evidence storage
- status projection from stored evidence
- OAuth, MCP, billing, and audit views

The Filepad backend must not import Guardian or use its own runtime filesystem
as a customer repository.

## Package Proofs

Before publishing, this package must pass:

```bash
pnpm -C packages/guardian typecheck
pnpm -C packages/guardian test
pnpm -C packages/guardian pack:check
```

The test suite includes an empty-project install smoke test. It packs Guardian,
installs the tarball into a temporary project, and verifies that the
`filepad-guardian` binary runs from `node_modules/.bin`.

