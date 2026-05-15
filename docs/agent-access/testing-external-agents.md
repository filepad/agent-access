# Testing External Agents

Use pairing to generate a remote MCP endpoint, reload the runtime, and call
`filepad_bootstrap`. A valid proof shows:

- pairing code was exchanged successfully
- remote MCP endpoint was written to the runtime
- runtime can list Filepad tools after reload
- `filepad_bootstrap` returns workspace context and active contracts
- tool calls create evidence, artifacts, proposals, or audit events through the
  backend

For SDK clients, verify signed Agent Access requests against health, bootstrap,
workspace read, artifact creation, and event emission endpoints.
