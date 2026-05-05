# Security Policy

## Supported Versions

Security fixes are provided for the latest published `0.x` release of `@filepad/mcp-server`.

## Reporting a Vulnerability

Email security reports to `security@filepad.ai`.

Please include:

- package name and version
- MCP client/runtime used
- reproduction steps
- affected tools or resources
- expected impact

Do not open a public issue for vulnerabilities involving Agent Access secrets, request signing, workspace data exposure, or tool permission bypasses.

## Secret Handling

This package reads `FILEPAD_AGENT_SECRET` from environment variables supplied by the MCP client. Many MCP clients store their configuration on disk. Treat that config as sensitive and rotate the Filepad Agent Access key if it is exposed.

