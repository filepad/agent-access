# Filepad Agent Access

Public SDK and MCP server packages for connecting external AI agents to Filepad workspaces.

## Packages

| Package | Version | Purpose |
|---|---:|---|
| [@filepad/agent-access-sdk](./packages/agent-access-sdk) | 0.1.1 | TypeScript client for Agent Access HTTP APIs |
| [@filepad/mcp-server](./packages/mcp-server) | 0.1.1 | stdio MCP server exposing Filepad tools to MCP-compatible agents |

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

## Security

Agent Access secrets are bearer-equivalent credentials. Do not paste real secrets into issues, chat transcripts, screenshots, or source control. See [SECURITY.md](./SECURITY.md).

## License

MIT
