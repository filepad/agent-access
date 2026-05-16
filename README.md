# Filepad Agent Access

Public SDK and remote MCP pairing packages for connecting external AI agents to Filepad workspaces.

## Packages

| Package | Version | Purpose |
|---|---:|---|
| [@filepad/agent-access-sdk](./packages/agent-access-sdk) | 0.1.6 | TypeScript client for Agent Access HTTP APIs |
| [@filepad/agent-connect](./packages/agent-connect) | 0.1.16 | Pairing CLI that installs remote MCP endpoint config for OpenClaw, Claude Code, Codex, Cursor, and Windsurf |
| [@filepad/mcp-server](./packages/mcp-server) | 0.1.11 | Stdio MCP server used by native MCP hosts after pairing |
| [@filepad/claude-code-hooks](./packages/claude-code-hooks) | 0.1.3 | Claude Code hook adapter used only by Claude Code runtime profiles |
| [@filepad/guardian](./packages/guardian) | 0.1.0 | Local repo-runtime verifier for Active Contracts. Runs checks and reports target-bound evidence |

## Install

```bash
npm install @filepad/agent-access-sdk
npm install @filepad/mcp-server
npx -y @filepad/agent-connect@latest pair ABC123 --runtime openclaw
```

## Validate

```bash
pnpm install
pnpm validate:agent-access:release
```

## Connect An Agent

See [docs/agent-access/connect-external-agent.md](./docs/agent-access/connect-external-agent.md).

First prompt after pairing the remote MCP endpoint:

```text
Use Filepad now. Call filepad_connect first, read the bootstrap response, inspect the constitution and agent home, then tell me what you can do and what you recommend doing first.
```

For first-class OpenClaw, Claude Code, Codex, Cursor, Windsurf, or custom-agent
behavior, also install the runtime instruction pack in
[docs/agent-access/runtime-native-onboarding.md](./docs/agent-access/runtime-native-onboarding.md).

## Security

Agent Access secrets are bearer-equivalent credentials. Do not paste real secrets into issues, chat transcripts, screenshots, or source control. See [SECURITY.md](./SECURITY.md).

## License

MIT
