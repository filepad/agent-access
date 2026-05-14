# Connect an External Agent to Filepad

This guide shows how to connect an external AI agent runtime (OpenClaw, Claude Desktop, Cursor, or a custom agent) to a Filepad workspace through **Agent Access**.

## What is Agent Access?

Agent Access is Filepad's scoped API for external agents. It lets an outside agent:

- Read workspace context (folders, files, skills, search)
- Read workspace signals visible to the key owner
- Create safe artifacts under `artifacts/`
- Propose reviewable edits to allowed files
- Report activity events
- Receive addressed mailbox notifications from Filepad

Agent Access **does not** let external agents directly mutate active workspace files, approve their own proposals, or execute automations.

## Recommended Connection Path

Use MCP first. The Filepad MCP server is the simplest connection for OpenClaw, Claude Desktop, Cursor, Windsurf, and other MCP-capable agents.

Use the Filepad skill with MCP when the agent supports skills. The skill tells the agent to use Filepad tools for Filepad-managed workspace files, create artifacts for durable output, and propose edits instead of writing directly.

Use runtime-native instructions too. MCP exposes tools, but most agents still
prioritize their own native memory, rules, and skills. See
[Runtime-Native Agent Onboarding](./runtime-native-onboarding.md) for the
instruction pack that makes Filepad startup context instead of an optional
toolbox.

Use the SDK or raw HMAC API only when the runtime does not support MCP or you are building a custom adapter.

## Authentication: HMAC Now, OAuth Later

**V1 uses HMAC-SHA256 request signing.** Every request must carry a timestamp, nonce, and signature derived from an Agent Access key.

OAuth 2.0 / OIDC and Device Authorization Grant (QR flow) are **future work** and not available in V1. Do not build V1 integrations expecting OAuth.

## Create an Agent Access Key

1. Open a workspace in Filepad.
2. Go to **Settings → Agent Access** (or **Access Keys**).
3. Click **Create Key**.
4. Choose scopes. Recommended for most agents:
   - `env:read` — read workspace environment and search
   - `tools:read` — discover canonical RuntimeTools
   - `tools:call` — call governed RuntimeTools
   - `artifacts:direct_write` — create new artifacts when intentionally granted
   - `files:propose` — propose reviewable edits
   - `events.write` — report activity
   - `signals:write` — create signals (if your agent uses them)
   - `notifications:read` — receive Filepad callbacks addressed to this key
5. Copy the **Key ID** and **Secret** immediately. The secret is shown only once.

## Required Environment Variables

Set these in your agent runtime environment:

```bash
export FILEPAD_BASE_URL="https://api.filepad.ai"
export FILEPAD_WORKSPACE_ID="ws_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export FILEPAD_AGENT_KEY_ID="ik_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export FILEPAD_AGENT_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

- `FILEPAD_BASE_URL` — Filepad API origin, for example `https://api.filepad.ai` (do not use the browser app origin and do not add `/api`)
- `FILEPAD_WORKSPACE_ID` — the workspace you want the agent to access
- `FILEPAD_AGENT_KEY_ID` — the `ik_...` key id from the Agent Access tab
- `FILEPAD_AGENT_SECRET` — the secret shown once on key creation

## HMAC Signing

Every request must include these headers:

| Header | Value |
|--------|-------|
| `x-integration-key-id` | `FILEPAD_AGENT_KEY_ID` |
| `x-integration-timestamp` | Unix timestamp in seconds |
| `x-integration-nonce` | UUID v4, unique per request |
| `x-integration-signature` | Base64 HMAC-SHA256 signature |

### Canonical String

```
METHOD\npathWithQuery\ntimestampSeconds\nnonce\nsha256(rawBody)
```

Example in Node.js:

```typescript
import { createHash, createHmac, randomUUID } from 'node:crypto';

function signRequest(opts: {
  method: string;
  path: string;
  body: string;
  secret: string;
}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const bodyHash = createHash('sha256').update(opts.body).digest('hex');
  const canonical = [opts.method, opts.path, timestamp, nonce, bodyHash].join('\n');
  const signature = createHmac('sha256', opts.secret).update(canonical, 'utf8').digest('base64');
  return {
    'x-integration-key-id': FILEPAD_AGENT_KEY_ID,
    'x-integration-timestamp': timestamp,
    'x-integration-nonce': nonce,
    'x-integration-signature': signature,
  };
}
```

## Option A: MCP Server (Recommended)

Filepad provides an MCP server that speaks stdio JSON-RPC. It exposes Filepad as tools inside OpenClaw, Claude Desktop, Cursor, or any MCP client.

### OpenClaw Pairing Setup

Create a short pairing code from **Settings -> Agent Access**, then run:

```bash
npx -y @filepad/agent-connect@latest pair ABC12345 --runtime openclaw
```

The pairing CLI exchanges the code, writes the MCP config, and prints a short
handoff that the agent can read before MCP is restarted. Restart or reload MCP,
then confirm OpenClaw can see the server:

This restart/reload step is expected. If the current agent session cannot see
`filepad_bootstrap` yet, pairing still succeeded; the host just needs to reload
its MCP tool list.

For OpenClaw, the pairing CLI writes the server to
`~/.openclaw/openclaw.json` under `mcp.servers.filepad`.

If MCP does not load, verify the backend and connection path before debugging
the agent runtime:

```bash
curl http://localhost:3000/agent-api/v1/health
curl http://localhost:3000/agent-api/v1/discovery
filepad-mcp-server --health
filepad-mcp-server --bootstrap
filepad-mcp-server --tools --with-schemas
filepad-mcp-server --call filepad_list_tree --args '{}'
```

During setup, agents can use the handoff session token on the read-only setup
endpoints instead of implementing HMAC signing:

```bash
curl -H "Authorization: Bearer fp_sess_..." \
  http://localhost:3000/agent-api/v1/workspaces/<workspaceId>/bootstrap
```

```bash
openclaw mcp list
```

Then start a new OpenClaw message:

```text
Call filepad_bootstrap, read the workspace profile and constitution, list your available Filepad tools, then report the first safe action you recommend.
```

Manual secret-based setup is still supported for advanced users, but pairing is
preferred because raw Agent Access secrets do not need to be pasted into chat.

For the security boundary and operator kill switches, see
[Agent Access Security Posture](./security-posture.md).

### Claude Desktop Config

Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "filepad": {
      "command": "npx",
      "args": ["-y", "@filepad/mcp-server@latest"],
      "env": {
        "FILEPAD_BASE_URL": "https://api.filepad.ai",
        "FILEPAD_WORKSPACE_ID": "ws_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "FILEPAD_AGENT_KEY_ID": "ik_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "FILEPAD_AGENT_SECRET": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Restart the MCP client. You should see Filepad tools in the tool list.

### Available MCP Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `filepad_connect` | none | Start-here onboarding/resume diagnostics with workspace identity, scopes, RuntimeTools, agent home, mailbox, recent outcomes, and suggested first actions |
| `filepad_bootstrap` | none | Alias for `filepad_connect` for MCP clients that look for bootstrap-style tools |
| `filepad_health` | none | Verify the Filepad connection and show granted scopes |
| `filepad_list_tree` | `tools:call`, `env:read` | Compatibility alias for canonical workspace file-tree listing |
| `filepad_read_file` | `tools:call`, `env:read` | Compatibility alias for canonical workspace file reading |
| `filepad_search` | `tools:call`, `env:read` | Compatibility alias for canonical workspace search |
| `filepad_create_artifact` | `tools:call`, `artifacts:direct_write` | Compatibility alias for governed artifact creation |
| `filepad_create_artifact_from_file` | `tools:call`, `artifacts:direct_write` | Create a governed artifact from a local text/markdown file visible to the MCP server |
| `filepad_propose_edit` | `files:propose` | Propose a reviewable edit |
| `filepad_emit_event` | `events.write` | Emit an activity event |
| `filepad_create_signal` | `signals:write` | Create a signal if scoped |
| `filepad_list_signals` | `env:read` | Query visible workspace signals by type, severity, or status |
| `filepad_get_signal` | `env:read` | Read one signal's details by id |
| `filepad_ack_notification` | `notifications:read` | Acknowledge mailbox notifications after processing |
| `filepad_get_profile` | `env:read` | Read this integration's agent home profile files |
| `filepad_update_profile` | `env:read`, `files:propose` | Propose a reviewable update to the agent profile |
| `gmail_search` / `gmail_get_message` | `tools:call`, `gmail:read` | Read synced Gmail source records |
| `gmail_import_message` | `tools:call`, `gmail:write` | Promote a synced Gmail source record into workspace knowledge through Temporal |
| `gmail_create_draft` / `gmail_send_with_approval` | `tools:call`, `gmail:write` | Request governed Gmail outbound actions that wait for human approval |

### Agent Home

When an Agent Access key is created, Filepad creates a private home folder for that key:

```text
agents/integrations/{keyId}/
├── identity.md
├── learnings.md
├── goals.md
└── timeline.md
```

Agents can call `filepad_get_profile` to read those files. They can call `filepad_update_profile` to propose updates, but the write path still goes through Filepad's review system and does not directly mutate active files.

### Agent Mailbox

When a key has `notifications:read`, Filepad exposes an addressed mailbox resource:

```text
filepad://workspace/{workspaceId}/mailbox
```

The mailbox is for Filepad-to-agent callbacks. It is scoped to the specific Agent Access key/integration, so agents only see messages addressed to themselves. V1 publishes mailbox items when:

- a proposal created by that integration is approved or rejected
- a signal created by that integration is accepted or rejected
- an automation triggered by that integration's signal completes or fails

Agents should read the mailbox resource, act on unread items, then call `filepad_ack_notification` with the processed notification ids. V1 intentionally has no "mark all read" operation.

## Option B: Official SDK / Custom Adapter

Install the Filepad Agent Access SDK:

```bash
npm install @filepad/agent-access-sdk
```

```typescript
import { FilepadAgentClient } from '@filepad/agent-access-sdk';

const client = new FilepadAgentClient({
  baseUrl: process.env.FILEPAD_BASE_URL!,
  workspaceId: process.env.FILEPAD_WORKSPACE_ID!,
  keyId: process.env.FILEPAD_AGENT_KEY_ID!,
  secret: process.env.FILEPAD_AGENT_SECRET!,
});

// Verify credentials
const { scopes } = await client.verifyCredentials();
console.log('Scopes:', scopes);

// Read environment
const env = await client.getEnvironment();
console.log('Folders:', env.folders.map(f => f.name));

// Search workspace
const search = await client.search('quarterly report', { type: 'keyword', limit: 5 });
console.log('Results:', search.results.length);

// Create artifact
const { artifact } = await client.createArtifact({
  title: 'Agent Report',
  text: '# Summary\n\nGenerated by external agent.',
});
console.log('Artifact:', artifact.id);

// Propose an edit after reading a file and its current version
const { proposalId } = await client.proposeEdit({
  fileNodeId: 'fn_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  baseVersionId: 'av_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  summary: 'Update the skill with a reviewed external-agent note',
  newText: 'Updated content here',
});
console.log('Proposal:', proposalId);

// Emit event
const { eventId } = await client.createEvent({
  eventType: 'agent.task.completed',
  payload: { artifactId: artifact.id },
});
console.log('Event:', eventId);

// Query visible workspace signals
const signals = await client.getSignals({
  severity: 'warn',
  status: 'suggested',
  limit: 10,
});
console.log('Signals:', signals.signals.length);
if (signals.signals[0]) {
  const signal = await client.getSignal(signals.signals[0].id);
  console.log('Signal details:', signal.findingTypeKey, signal.status);
}

// Read addressed Filepad callbacks, then acknowledge processed items
const mailbox = await client.getMailbox({ unreadOnly: true, limit: 20 });
for (const item of mailbox.items) {
  console.log('Mailbox item:', item.kind, item.summary);
}
if (mailbox.items.length > 0) {
  await client.ackMailbox(mailbox.items.map(item => item.id));
}
```

## Option C: CLI Fallback

If an agent cannot use MCP, use the SDK or raw HMAC API through a small CLI wrapper. Keep CLI usage as a fallback because it usually requires shell execution approvals and cannot expose Filepad tools as cleanly as MCP.

## Scope Reference

| Scope | What it allows |
|-------|----------------|
| `env:read` | Read folders, file tree, file content, search, skill prompts, MCP resources |
| `tools:read` | Discover canonical RuntimeTools available to the agent |
| `tools:call` | Call governed RuntimeTools through Filepad policy/provenance |
| `artifacts:direct_write` | Create artifacts under `artifacts/` when intentionally granted |
| `files:propose` | Create reviewable edit proposals for allowed files |
| `memory:read` | Read memory entries (reserved for future memory surfaces) |
| `events.write` | Write agent activity events |
| `signals:write` | Create signals for automation triggers |
| `notifications:read` | Read and acknowledge Filepad mailbox notifications addressed to this integration |

## Security Notes

- **Secrets are shown once.** If you lose a secret, rotate the key.
- **Revoked keys cannot be reused.** Revoke a key to cut off access immediately. Clear revoked keys only to remove old records from the visible key list.
- **Nonce replay protection** is enforced. Reusing a nonce returns `400`.
- **Timestamp drift** of more than a few minutes is rejected.
- **Scope enforcement** is strict. A request missing a required scope returns `403`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `401 Invalid signature` | Canonical string mismatch | Ensure exact path, query, method, and body hash |
| `403 Missing scope` | Key lacks required scope | Create a new key with the needed scope |
| `400 Nonce replay` | Reused nonce | Generate a fresh UUID for every request |
| `404 File not found` | File is hidden or id is wrong | Check visibility in workspace settings |
| MCP tools not appearing | Server not connected | Check Claude Desktop logs and env vars |
| OpenClaw hangs on setup | `npx` is waiting for confirmation | Use `args: ["-y", "@filepad/mcp-server@latest"]` |

## Future Work

The following are **not yet available** in V1:

- **OAuth 2.0 / OIDC** — Device Authorization Grant (QR flow) is planned for V2.
- **Streamable HTTP / SSE transport** — The backend route `/mcp/v1/workspaces/:id/stream` is reserved for future MCP over HTTP.
- **WebSocket real-time** — Not in V1.
- **Remote MCP tool execution** — V1 exposes tools through the stdio MCP server. Backend-hosted HTTP/SSE MCP is future work.

Stay scoped to HMAC-signed Agent Access for V1 integrations.
