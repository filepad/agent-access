# Connect External Agents

Filepad Agent Access is remote-first. A workspace manager creates a short
OAuth consent in Filepad, the agent runs `@filepad/agent-connect`, and the
backend returns a resource-bound OAuth token for the canonical remote MCP endpoint. The agent
host stores a URL-based server entry, not a local bridge process.

## Runtime Flow

1. The connector registers an OAuth public client with a loopback redirect URI.
2. Filepad OAuth consent issues an authorization code for the `/mcp` protected resource.
3. The connector exchanges the code with PKCE at `/oauth/token`.
4. The connector writes `/mcp` as the remote MCP endpoint with the resource-bound bearer token.
5. The runtime reloads MCP tools and calls `filepad_bootstrap`.

## Remote Server Shape

```json
{
  "transport": "streamable_http",
  "url": "https://api.filepad.ai/mcp",
  "headers": {
    "Authorization": "Bearer fp_sess_example"
  }
}
```

Long-lived API clients should use the Agent Access SDK and HMAC signing.
Runtime MCP setup uses OAuth PKCE and resource-bound bearer tokens so raw Agent Access secrets do not have to be
pasted into chat.
