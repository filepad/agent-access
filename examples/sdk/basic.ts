import { FilepadAgentClient } from '@filepad/agent-access-sdk';

const client = new FilepadAgentClient({
  baseUrl: process.env.FILEPAD_BASE_URL ?? 'https://api.filepad.ai',
  workspaceId: process.env.FILEPAD_WORKSPACE_ID ?? '',
  keyId: process.env.FILEPAD_AGENT_KEY_ID ?? '',
  secret: process.env.FILEPAD_AGENT_SECRET ?? '',
});

const health = await client.verifyCredentials();
console.log('Connected as', health.agent.keyId, 'with scopes', health.scopes);

const tree = await client.getFileTree();
console.log('Visible nodes:', tree.nodes.length);

const profile = await client.getAgentProfile();
console.log('Profile fields:', Object.keys(profile.files));
