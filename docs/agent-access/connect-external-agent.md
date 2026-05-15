# Connect External Agents

Filepad Agent Access is remote-first. A workspace manager creates a short
pairing code in Filepad, the agent runs `@filepad/agent-connect`, and the
backend returns a remote MCP endpoint plus setup handoff credentials. The agent
host stores a URL-based server entry, not a local bridge process.

## Runtime Flow

1. Filepad creates a pairing code for a runtime and scope set.
2. The agent exchanges that code at `/agent-api/v1/pair`.
3. Filepad creates scoped Agent Access credentials and a short-lived handoff
   token.
4. The response includes `/mcp/v1/workspaces/{workspaceId}/stream` as the
   remote MCP endpoint.
5. The runtime reloads MCP tools and calls `filepad_bootstrap`.

## Remote Server Shape

```json
{
  "transport": "streamable_http",
  "url": "https://api.filepad.ai/mcp/v1/workspaces/ws_example/stream",
  "headers": {
    "Authorization": "Bearer fp_sess_example"
  }
}
```

Long-lived API clients should use the Agent Access SDK and HMAC signing.
Runtime MCP setup uses the pairing handoff so raw secrets do not have to be
pasted into chat.
