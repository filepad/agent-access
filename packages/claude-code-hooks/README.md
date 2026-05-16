# @filepad/claude-code-hooks

Claude Code hook adapter for Filepad Agent Access.

This package is runtime-specific. It is installed by the Claude Code runtime
adapter and should not be used for Codex, OpenClaw, Cursor, Windsurf, or generic
MCP hosts.

## Usage

The normal path is to install Claude Code contract verification after MCP
pairing:

```bash
FILEPAD_AGENT_SECRET=... npx -y @filepad/runtime-adapter-claude-code@latest install \
  --contract-id ac_... \
  --workspace-id ws_... \
  --agent-key-id ik_... \
  --base-url https://api.filepad.ai
```

The runtime adapter writes Claude Code hook settings that call this package.

## Direct Diagnostics

```bash
npx -y @filepad/claude-code-hooks@latest --help
```

The hook adapter reads credentials from `FILEPAD_HOOKS_CREDENTIALS_PATH`, which
is written by `@filepad/runtime-adapter-claude-code` during contract
verification setup.

## Contract Verification Boundary

This package does not install, spawn, or supervise Guardian.

Contract verification is owned by a separate runtime-adapter/Guardian setup
flow. Claude Code hooks may surface contract state and enforce backend
decisions, but they must not silently pretend Guardian is active when the
Guardian package is missing.
