# @filepad/runtime-adapter-claude-code

Claude Code runtime adapter for Filepad Active Contracts.

This package is the owner of Claude Code contract verification setup. It writes
Claude Code hooks, stores hook credentials outside the repository, and records a
repo-local runtime manifest that points at the active Filepad contract.

It does not configure MCP. Use `@filepad/agent-connect` or native Claude Code MCP
OAuth for MCP access first, then use this adapter when the user explicitly wants
contract verification in a local repo.

## Install Contract Verification

Install with explicit runtime credentials. MCP connection is handled separately by `@filepad/agent-connect connect`:

```bash
FILEPAD_AGENT_SECRET=... npx -y @filepad/runtime-adapter-claude-code@latest install \
  --contract-id ac_... \
  --workspace-id ws_... \
  --agent-key-id ik_... \
  --base-url https://api.filepad.ai
```

## Doctor

```bash
npx -y @filepad/runtime-adapter-claude-code@latest doctor
```

## Ownership

- `@filepad/agent-connect`: OAuth MCP setup/config only.
- `@filepad/runtime-adapter-claude-code`: Claude Code hook and Guardian setup.
- `@filepad/claude-code-hooks`: low-level hook executable.
- `@filepad/guardian`: repo-runtime evidence reporter.

Secrets are stored under `~/.config/filepad/connections/claude-code/...`.
Repo-local metadata is stored at `.filepad/runtime/claude-code.json` and does
not contain the Agent Access secret.
