// TEST CATEGORY: integration
import { beforeAll, describe, expect, it } from 'vitest';

import type { FilepadAgentClient } from '@filepad/agent-access-sdk';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleCallTool, handleListTools } from '../src/handlers.js';
import { FilepadMcpServer } from '../src/server.js';

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

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

function assertResponse(
  value: unknown,
): asserts value is JsonRpcResponse {
  if (
    !value ||
    typeof value !== 'object' ||
    !('jsonrpc' in value) ||
    !('id' in value)
  ) {
    throw new Error('Expected JSONRPC response');
  }
}

describe('FilepadMcpServer integration', () => {
  let server: FilepadMcpServer | null = null;

  beforeAll(async () => {
    if (config) {
      server = new FilepadMcpServer(config);
      await server.initialize();
    }
  });

  it('handles initialize', async () => {
    if (!server) return;
    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {} },
    });
    expect(response).toBeTruthy();
    assertResponse(response);
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result).toBeTruthy();
    const result = response.result as Record<string, unknown>;
    const serverInfo = result['serverInfo'] as Record<string, string>;
    expect(serverInfo['name']).toBe('filepad');
    expect(result['instructions']).toContain('filepad_connect');
  });

  it('lists tools filtered by scopes', async () => {
    if (!server) return;
    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    expect(response).toBeTruthy();
    assertResponse(response);
    expect(response.result).toBeTruthy();
    const result = response.result as Record<string, unknown>;
    const tools = result['tools'] as Array<{ name: string }>;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map((t) => t.name)).toContain('filepad_search');
    expect(tools.map((t) => t.name)).toContain('filepad_connect');
    expect(tools.map((t) => t.name)).toContain('filepad_bootstrap');
    expect(tools.map((t) => t.name)).toContain('filepad_health');
  });

  it('handles health tool call', async () => {
    if (!server) return;
    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'filepad_health',
        arguments: {},
      },
    });
    expect(response).toBeTruthy();
    assertResponse(response);
    expect(response.result).toBeTruthy();
    const result = response.result as Record<string, unknown>;
    const content = result['content'] as Array<{ type: string; text: string }>;
    const health = JSON.parse(content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(health['status']).toBe('ok');
    expect(health['workspaceId']).toBe(config?.workspaceId);
    expect(health['version']).toBe('0.1.0');
  });

  it('lists resources', async () => {
    if (!server) return;
    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/list',
      params: {},
    });
    expect(response).toBeTruthy();
    assertResponse(response);
    expect(response.result).toBeTruthy();
    const result = response.result as Record<string, unknown>;
    const resources = result['resources'] as unknown[];
    expect(Array.isArray(resources)).toBe(true);
    expect(resources.length).toBeGreaterThan(0);
  });

  it('lists prompts', async () => {
    if (!server) return;
    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'prompts/list',
      params: {},
    });
    expect(response).toBeTruthy();
    assertResponse(response);
    expect(response.result).toBeTruthy();
    const result = response.result as Record<string, unknown>;
    const prompts = result['prompts'] as unknown[];
    expect(Array.isArray(prompts)).toBe(true);
  });
});

describe('FilepadMcpServer error handling', () => {
  it('returns error for unknown method', async () => {
    const badServer = new FilepadMcpServer({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_test',
      keyId: 'ik_test',
      secret: 'secret_test',
    });

    const response = await badServer.handleMessage({
      jsonrpc: '2.0',
      id: 99,
      method: 'unknown/method',
      params: {},
    });
    expect(response).toBeTruthy();
    assertResponse(response);
    expect(response.error).toBeTruthy();
    expect(response.error?.code).toBe(-32601);
  });
});

describe('MCP tool calls', () => {
  it('lists local compatibility aliases alongside backend RuntimeTools', async () => {
    const client = {
      listTools: async () => ({
        tools: [
          {
            providerName: 'workspace_search',
            description: 'Canonical search',
            inputSchema: { type: 'object' },
          },
        ],
      }),
    } as unknown as FilepadAgentClient;

    const result = await handleListTools({}, {
      client,
      workspaceId: 'ws_test',
      scopes: ['env:read', 'tools:call', 'artifacts:direct_write'],
    });

    expect(result.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'filepad_connect',
        'filepad_health',
        'filepad_search',
        'filepad_create_artifact_from_file',
        'workspace_search',
      ]),
    );
  });

  it('returns connect diagnostics through filepad_connect', async () => {
    const client = {
      connect: async () => ({
        status: 'ok',
        checkedAt: new Date(0).toISOString(),
        agent: {
          keyId: 'ik_test',
          integrationId: 'integration_test',
          workspaceId: 'ws_test',
          displayName: 'Test agent',
        },
        workspace: {
          id: 'ws_test',
          displayName: 'Test Workspace',
          kind: 'personal',
          ownerName: 'Test Owner',
          ownerTimezone: 'UTC',
          installedKits: [],
        },
        scopes: ['env:read'],
        recommendedScopes: [],
        tools: [],
        bootstrap: {
          summary: 'Connected',
          startupPrompt: 'Call filepad_get_constitution.',
          suggestedFirstActions: ['Call filepad_get_constitution.'],
          availableToolGroups: [
            {
              group: 'bootstrap',
              purpose: 'Start work.',
              tools: ['filepad_connect', 'filepad_bootstrap'],
            },
          ],
        },
        agentHome: {
          status: 'ready',
          folderPath: 'agents/integrations/ik_test',
          files: [],
        },
        mailbox: { unreadCount: 0, recent: [] },
        recentOutcomes: [],
        diagnostics: { warnings: [], nextRecommendedActions: [] },
      }),
    } as unknown as FilepadAgentClient;

    const result = await handleCallTool(
      {
        params: {
          name: 'filepad_connect',
          arguments: {},
        },
      },
      {
        client,
        workspaceId: 'ws_test',
        scopes: [],
      },
    );

    const content = result.content as Array<{ text: string }>;
    expect(JSON.parse(content[0]?.text ?? '{}')).toMatchObject({
      status: 'ok',
      agent: { keyId: 'ik_test' },
      bootstrap: {
        suggestedFirstActions: ['Call filepad_get_constitution.'],
      },
      agentHome: { status: 'ready' },
    });
  });

  it('returns the same connect diagnostics through filepad_bootstrap', async () => {
    const client = {
      connect: async () => ({
        status: 'ok',
        checkedAt: new Date(0).toISOString(),
        agent: {
          keyId: 'ik_test',
          integrationId: 'integration_test',
          workspaceId: 'ws_test',
          displayName: 'Test agent',
        },
        workspace: {
          id: 'ws_test',
          displayName: 'Test Workspace',
          kind: 'personal',
          ownerName: 'Test Owner',
          ownerTimezone: 'UTC',
          installedKits: [],
        },
        scopes: ['env:read'],
        recommendedScopes: [],
        tools: [],
        bootstrap: {
          summary: 'Connected',
          startupPrompt: 'Call filepad_get_constitution.',
          suggestedFirstActions: ['Call filepad_get_constitution.'],
          availableToolGroups: [
            {
              group: 'bootstrap',
              purpose: 'Start work.',
              tools: ['filepad_connect', 'filepad_bootstrap'],
            },
          ],
        },
        agentHome: {
          status: 'ready',
          folderPath: 'agents/integrations/ik_test',
          files: [],
        },
        mailbox: { unreadCount: 0, recent: [] },
        recentOutcomes: [],
        diagnostics: { warnings: [], nextRecommendedActions: [] },
      }),
    } as unknown as FilepadAgentClient;

    const result = await handleCallTool(
      {
        params: {
          name: 'filepad_bootstrap',
          arguments: {},
        },
      },
      {
        client,
        workspaceId: 'ws_test',
        scopes: [],
      },
    );

    const content = result.content as Array<{ text: string }>;
    expect(JSON.parse(content[0]?.text ?? '{}')).toMatchObject({
      status: 'ok',
      bootstrap: {
        availableToolGroups: [
          expect.objectContaining({ group: 'bootstrap' }),
        ],
      },
    });
  });

  it('forwards backend canonical RuntimeTool calls that are not local registry tools', async () => {
    const callToolCalls: unknown[] = [];
    const client = {
      callTool: async (params: unknown) => {
        callToolCalls.push(params);
        return {
          toolName: 'gmail_send_with_approval',
          output: {
            outboundId: 'gmail_out_1',
            status: 'awaiting_approval',
          },
        };
      },
    } as unknown as FilepadAgentClient;

    const result = await handleCallTool(
      {
        params: {
          name: 'gmail_send_with_approval',
          arguments: {
            toAddresses: ['customer@example.com'],
            subject: 'Re: Renewal',
            bodyText: 'Thanks for reaching out.',
          },
        },
      },
      {
        client,
        workspaceId: 'ws_test',
        scopes: ['tools:call', 'gmail:write'],
      },
    );

    expect(callToolCalls).toEqual([
      {
        toolName: 'gmail_send_with_approval',
        input: {
          toAddresses: ['customer@example.com'],
          subject: 'Re: Renewal',
          bodyText: 'Thanks for reaching out.',
        },
      },
    ]);
    const content = result.content as Array<{ text: string }>;
    expect(JSON.parse(content[0]?.text ?? '{}')).toMatchObject({
      toolName: 'gmail_send_with_approval',
      output: {
        outboundId: 'gmail_out_1',
        status: 'awaiting_approval',
      },
    });
  });

  it('routes read-only compatibility aliases through canonical RuntimeTools', async () => {
    const callToolCalls: unknown[] = [];
    const client = {
      callTool: async (params: unknown) => {
        callToolCalls.push(params);
        return { toolName: 'workspace_search', output: { results: [] } };
      },
    } as unknown as FilepadAgentClient;

    await handleCallTool(
      {
        params: {
          name: 'filepad_search',
          arguments: {
            query: 'renewal',
            type: 'hybrid',
            limit: 5,
          },
        },
      },
      {
        client,
        workspaceId: 'ws_test',
        scopes: ['tools:call', 'env:read'],
      },
    );

    expect(callToolCalls).toEqual([
      {
        toolName: 'workspace_search',
        input: {
          query: 'renewal',
          searchType: 'hybrid',
          limit: 5,
        },
      },
    ]);
  });

  it('passes artifact kind through to the Agent Access SDK', async () => {
    const createArtifactCalls: unknown[] = [];
    const client = {
      createArtifact: async (params: unknown) => {
        createArtifactCalls.push(params);
        return {
          artifact: {
            id: 'a_test',
            workspaceId: 'ws_test',
            fileNodeId: 'fn_test',
            kind: 'richDoc',
            title: 'Rich doc',
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
            latestVersionId: 'av_test',
          },
          version: {
            id: 'av_test',
            artifactId: 'a_test',
            createdAt: new Date(0).toISOString(),
            createdByUserId: 'user_test',
          },
        };
      },
    } as unknown as FilepadAgentClient;

    await handleCallTool(
      {
        params: {
          name: 'filepad_create_artifact',
          arguments: {
            title: 'Rich doc',
            kind: 'richDoc',
            text: '{"type":"doc","content":[]}',
          },
        },
      },
      {
        client,
        workspaceId: 'ws_test',
        scopes: ['tools:call', 'artifacts:direct_write'],
      },
    );

    expect(createArtifactCalls).toEqual([
      {
        title: 'Rich doc',
        kind: 'richDoc',
        text: '{"type":"doc","content":[]}',
      },
    ]);
  });

  it('creates an artifact from a local markdown file through the canonical artifact alias', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filepad-mcp-'));
    const markdownPath = join(dir, 'business-plan.md');
    await writeFile(
      markdownPath,
      '# Business Plan\n\nThis local markdown file should become a richDoc.',
      'utf8',
    );
    const createArtifactCalls: unknown[] = [];
    const client = {
      createArtifact: async (params: unknown) => {
        createArtifactCalls.push(params);
        return {
          artifact: {
            id: 'a_markdown',
            workspaceId: 'ws_test',
            fileNodeId: 'fn_markdown',
            kind: 'richDoc',
            title: 'Business Plan',
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
            latestVersionId: 'av_markdown',
          },
          version: {
            id: 'av_markdown',
            artifactId: 'a_markdown',
            createdAt: new Date(0).toISOString(),
            createdByUserId: 'integration:ik_test',
          },
        };
      },
    } as unknown as FilepadAgentClient;

    try {
      const result = await handleCallTool(
        {
          params: {
            name: 'filepad_create_artifact_from_file',
            arguments: {
              path: markdownPath,
              title: 'Business Plan',
            },
          },
        },
        {
          client,
          workspaceId: 'ws_test',
          scopes: ['tools:call', 'artifacts:direct_write'],
        },
      );

      expect(createArtifactCalls).toEqual([
        {
          title: 'Business Plan',
          text: '# Business Plan\n\nThis local markdown file should become a richDoc.',
          kind: 'auto',
          format: 'markdown',
        },
      ]);
      const content = result.content as Array<{ text: string }>;
      expect(JSON.parse(content[0]?.text ?? '{}')).toMatchObject({
        artifact: { kind: 'richDoc', title: 'Business Plan' },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
