# @filepad/runtime-adapter-claude-code

Claude Code runtime adapter for Filepad Active Contracts.

This package is the owner of Claude Code contract verification setup. It writes
Claude Code hooks, stores hook credentials outside the repository, and records a
repo-local runtime manifest that points at the active Filepad contract.

It does not pair MCP. Use `@filepad/agent-connect` or native Claude Code MCP
OAuth for MCP access first, then use this adapter when the user explicitly wants
contract verification in a local repo.

## Install Contract Verification

Preferred human setup uses a Filepad pairing code so the secret is exchanged
directly by the adapter:

```bash
npx -y @filepad/runtime-adapter-claude-code@latest install \
  --pair-code <CODE> \
  --contract-id ac_... \
  --base-url https://api.filepad.ai
```

CI and other controlled environments may pass credentials explicitly:

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

- `@filepad/agent-connect`: MCP pairing/config only.
- `@filepad/runtime-adapter-claude-code`: Claude Code hook and Guardian setup.
- `@filepad/claude-code-hooks`: low-level hook executable.
- `@filepad/guardian`: repo-runtime evidence reporter.

Secrets are stored under `~/.config/filepad/connections/claude-code/...`.
Repo-local metadata is stored at `.filepad/runtime/claude-code.json` and does
not contain the Agent Access secret.
