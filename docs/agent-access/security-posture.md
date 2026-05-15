# Agent Access Security Posture

Filepad treats external agents as scoped integrations. The backend is the
security boundary: it authenticates every request, enforces workspace scopes,
applies tool approval policy, records auditable events, and can revoke access.

Remote MCP is a hosted transport over the same Agent Access capability model.
Runtime hooks add local enforcement for runtimes that support hooks, but hooks
are defense in depth rather than the source of truth.
