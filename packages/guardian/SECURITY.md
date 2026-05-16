# Security Policy

## Supported Versions

Security fixes are provided for the latest published `0.x` release of `@filepad/agent-access-sdk`.

## Reporting a Vulnerability

Email security reports to `security@filepad.ai`.

Please include:

- package name and version
- affected API surface
- reproduction steps
- expected impact

Do not open a public issue for vulnerabilities involving authentication, request signing, secrets, or workspace data exposure.

## Secret Handling

Agent Access secrets are bearer-equivalent credentials. They are shown once in Filepad and should be stored only in the target agent runtime or secret manager. Rotate a key if the secret is copied into chat, logs, screenshots, or source control.

