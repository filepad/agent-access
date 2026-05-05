// TEST CATEGORY: integration
// Requires backend running on localhost:3000 with a valid Agent Access key.
// Set FILEPAD_SDK_TEST_BASE_URL, FILEPAD_SDK_TEST_WORKSPACE_ID,
// FILEPAD_SDK_TEST_KEY_ID, FILEPAD_SDK_TEST_SECRET to run.
import { beforeAll, describe, expect, it } from 'vitest';

import { FilepadAgentClient } from '../src/client.js';
import { AuthenticationError } from '../src/errors.js';

function getTestConfig() {
  const baseUrl = process.env['FILEPAD_SDK_TEST_BASE_URL'] ?? 'http://localhost:3000';
  const workspaceId = process.env['FILEPAD_SDK_TEST_WORKSPACE_ID'];
  const keyId = process.env['FILEPAD_SDK_TEST_KEY_ID'];
  const secret = process.env['FILEPAD_SDK_TEST_SECRET'];

  if (!workspaceId || !keyId || !secret) {
    return null;
  }
  return { baseUrl, workspaceId, keyId, secret };
}

const config = getTestConfig();

describe('FilepadAgentClient integration', () => {
  let client: FilepadAgentClient | null = null;

  beforeAll(() => {
    if (config) {
      client = new FilepadAgentClient({
        baseUrl: config.baseUrl,
        workspaceId: config.workspaceId,
        keyId: config.keyId,
        secret: config.secret,
      });
    }
  });

  it('verifies credentials', async () => {
    if (!client) return;
    const caps = await client.verifyCredentials();
    expect(caps.scopes.length).toBeGreaterThan(0);
  });

  it('reads environment', async () => {
    if (!client) return;
    const env = await client.getEnvironment();
    expect(env.workspaceId).toBe(config!.workspaceId);
    expect(env.folders.length).toBeGreaterThan(0);
  });

  it('reads file tree', async () => {
    if (!client) return;
    const tree = await client.getFileTree();
    expect(tree.nodes.length).toBeGreaterThan(0);
  });

  it('discovers prompts', async () => {
    if (!client) return;
    const prompts = await client.getPrompts();
    expect(Array.isArray(prompts.prompts)).toBe(true);
  });

  it('discovers MCP prompts', async () => {
    if (!client) return;
    const mcp = await client.getMcpPrompts();
    expect(Array.isArray(mcp.prompts)).toBe(true);
  });

  it('discovers MCP resources', async () => {
    if (!client) return;
    const mcp = await client.getMcpResources();
    expect(Array.isArray(mcp.resources)).toBe(true);
  });

  it('searches workspace', async () => {
    if (!client) return;
    const results = await client.search('test', { type: 'keyword', limit: 5 });
    expect(Array.isArray(results.results)).toBe(true);
  });

  it('runs the full proof scenario', async () => {
    if (!client) return;
    // 1. Capabilities
    const caps = await client.getCapabilities();
    expect(caps.scopes.length).toBeGreaterThan(0);

    // 2. Environment
    const env = await client.getEnvironment();
    expect(env.workspaceId).toBe(config!.workspaceId);

    // 3. File tree
    const tree = await client.getFileTree();
    expect(tree.nodes.length).toBeGreaterThan(0);

    // 4. Prompts
    const prompts = await client.getPrompts();

    // 5. Search
    const search = await client.search('test', { type: 'hybrid', limit: 5 });

    // 6. Read first file if available
    const firstFileNode = tree.nodes.find((n) => n.kind === 'file');
    if (firstFileNode) {
      const file = await client.getFile(firstFileNode.id);
      expect(file.node.id).toBe(firstFileNode.id);
    }

    // 7. Create artifact
    const artifact = await client.createArtifact({
      title: 'SDK integration proof report',
      text: '# SDK Integration Proof\n\nAll endpoints reachable.',
    });
    expect(artifact.artifact.id).toBeTruthy();
    expect(artifact.version.id).toBeTruthy();

    // 8. Create event
    const event = await client.createEvent({
      eventType: 'agent.proof.completed',
      payload: { artifactId: artifact.artifact.id },
    });
    expect(event.eventId).toBeTruthy();

    // 9. Create signal
    const signal = await client.createSignal({
      findingTypeKey: 'sdk.proof',
      summary: 'SDK integration test completed successfully',
      severity: 'info',
      value: { artifactId: artifact.artifact.id },
    });
    expect(signal.signalId).toBeTruthy();
  });
});

describe('FilepadAgentClient with invalid credentials', () => {
  it('fails authentication with wrong secret', async () => {
    const badClient = new FilepadAgentClient({
      baseUrl: process.env['FILEPAD_SDK_TEST_BASE_URL'] ?? 'http://localhost:3000',
      workspaceId: 'ws_test',
      keyId: 'ik_test',
      secret: 'wrong_secret',
    });

    await expect(badClient.verifyCredentials()).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });
});
