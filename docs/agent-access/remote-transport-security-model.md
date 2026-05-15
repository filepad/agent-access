# Remote Transport Security Model

Remote MCP uses backend-owned authentication and authorization.

- Pairing creates scoped Agent Access credentials.
- The setup handoff uses a short-lived bearer token.
- Long-lived API usage uses signed Agent Access requests.
- Credentials can be rotated or revoked from the workspace.
- Tool execution is evaluated against the same RuntimeTool scopes and approval
  policies used by Filepad's internal agent features.
- Auditable actions should record actor, workspace, runtime, tool name, result,
  and request id.

Secrets must not be committed, pasted into public docs, or embedded in example
runtime configs.
