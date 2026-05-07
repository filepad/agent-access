# Filepad Agent Access

Public SDK and MCP server packages for connecting external AI agents to Filepad workspaces.

## Packages

| Package | Version | Purpose |
|---|---:|---|
| [@filepad/agent-access-sdk](./packages/agent-access-sdk) | 0.1.2 | TypeScript client for Agent Access HTTP APIs |
| [@filepad/mcp-server](./packages/mcp-server) | 0.1.2 | stdio MCP server exposing Filepad tools to MCP-compatible agents |

## Install

```bash
npm install @filepad/agent-access-sdk
npx -y @filepad/mcp-server@latest
```

## Validate

```bash
pnpm install
pnpm validate:agent-access:release
```

## Connect An Agent

See [docs/agent-access/connect-external-agent.md](./docs/agent-access/connect-external-agent.md).

First prompt after installing the MCP server:

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
