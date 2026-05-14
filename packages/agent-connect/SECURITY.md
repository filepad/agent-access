# Security Policy

## Supported Versions

Security fixes are provided for the latest published `0.x` release of `@filepad/agent-connect`.

## Reporting a Vulnerability

Email security reports to `security@filepad.ai`.

Please include:

- package name and version
- affected runtime or config writer
- reproduction steps
- expected impact

Do not open a public issue for vulnerabilities involving pairing codes, generated credentials, MCP config writes, request signing, secrets, or workspace data exposure.

## Secret Handling

Pairing codes are short-lived and should be pasted into the target agent runtime only. The CLI exchanges the code for agent credentials, writes them into the selected runtime config, and stores a structured result in a temporary file. Rotate the Filepad key if credentials are copied into chat, logs, screenshots, or source control.
