# Security

Report vulnerabilities in the Claude Code runtime adapter to support@filepad.ai.

This package writes Claude Code hook settings and local Agent Access credentials.
Do not commit generated credential files, screenshots of secrets, or command
history containing `FILEPAD_AGENT_SECRET`.

Runtime adapter bugs may affect contract enforcement, evidence provenance, or
local repository access boundaries. Rotate any exposed Agent Access key.
