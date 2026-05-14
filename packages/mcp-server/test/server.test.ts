// TEST CATEGORY: integration
import { beforeAll, describe, expect, it } from 'vitest';

import type { FilepadAgentClient } from '@filepad/agent-access-sdk';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleCallTool, handleListTools, compactBootstrapForAgent } from '../src/handlers.js';
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
    expect(result['instructions']).toContain('filepad_bootstrap');
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
    expect(tools.map((t) => t.name)).toContain('filepad_bootstrap');
    expect(tools.map((t) => t.name)).toContain('filepad_health');
    expect(tools.map((t) => t.name)).toContain('filepad_describe_tool');
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
        'filepad_bootstrap',
        'filepad_describe_tool',
        'filepad_health',
        'filepad_search',
        'filepad_create_artifact_from_file',
        'workspace_search',
      ]),
    );
  });

  it('still lists bootstrap tools when backend RuntimeTool discovery is unavailable', async () => {
    const client = {
      listTools: async () => {
        throw new Error('Missing required scope: tools:read');
      },
    } as unknown as FilepadAgentClient;

    const result = await handleListTools({}, {
      client,
      workspaceId: 'ws_test',
      scopes: ['env:read'],
    });

    const names = result.tools.map((tool) => tool.name);
    expect(names).toContain('filepad_bootstrap');
    expect(names).toContain('filepad_health');
    expect(names).toContain('filepad_describe_tool');
  });

  it('returns compact diagnostics through filepad_connect (compatibility alias)', async () => {
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
        },
        scopes: ['env:read'],
        recommendedScopes: [],
        tools: [],
        bootstrap: {
          summary: 'Connected',
          startupPrompt: 'Filepad is your governed workspace.',
          suggestedFirstActions: ['Call filepad_get_constitution.'],
          operatingBrief: {
            product: 'Filepad is a governed workspace.',
            permissions: {
              canReadWorkspace: true,
              canCreateArtifacts: false,
              canCreateFolders: false,
              canProposeEdits: false,
              externalActionsMayRequireApproval: true,
            },
            territory: {
              read: ['*'], write: ['*'], propose: ['*'],
              offLimits: ['.filepad/'], rule: 'Propose edits.',
            },
            contracts: [],
            assignment: null,
            pendingApprovals: 0,
            mailboxUnread: 0,
            suggestedAction: null,
          },
          quickReference: [],
          availableToolGroups: [
            { group: 'bootstrap', purpose: 'Start work.', tools: ['filepad_bootstrap'] },
          ],
        },
        mailbox: { unreadCount: 0, recent: [] },
        recentOutcomes: [],
        diagnostics: { warnings: [], nextRecommendedActions: [] },
      }),
    } as unknown as FilepadAgentClient;

    const result = await handleCallTool(
      { params: { name: 'filepad_connect', arguments: {} } },
      { client, workspaceId: 'ws_test', scopes: [] },
    );

    const content = result.content as Array<{ text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? '{}');
    expect(parsed.status).toBe('ok');
    expect(parsed.bootstrap.operatingBrief.product).toBe('Filepad is a governed workspace.');
    expect(parsed.tools).toBeUndefined();
  });

  it('returns the compact bootstrap shape with operatingBrief through filepad_bootstrap', async () => {
    const client = {
      bootstrap: async () => ({
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
        },
        scopes: ['env:read'],
        recommendedScopes: [],
        tools: [
          {
            providerName: 'workspace_search',
            displayName: 'Search workspace',
            description: 'Search files',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
            outputSchema: { type: 'object' },
            capabilityScope: 'workspace',
            capabilityType: 'read',
            riskLevel: 'low',
            approvalPolicy: 'auto',
            minimumWorkspaceRole: 'viewer',
            requiredScopes: ['tools:call', 'env:read'],
            mutates: { artifacts: false, fileNodes: false, externalNetwork: false, secrets: false },
            requiresConnection: false,
            integrationProvider: 'filepad',
          },
        ],
        bootstrap: {
          summary: 'Connected',
          startupPrompt: 'Filepad is your governed workspace.',
          suggestedFirstActions: ['Call filepad_get_constitution.'],
          operatingBrief: {
            product: 'Filepad is a governed workspace for agent work.',
            permissions: {
              canReadWorkspace: true,
              canCreateArtifacts: false,
              canCreateFolders: false,
              canProposeEdits: false,
              externalActionsMayRequireApproval: true,
            },
            territory: {
              read: ['*'],
              write: ['*'],
              propose: ['*'],
              offLimits: ['.filepad/'],
              rule: 'Propose edits.',
            },
            contracts: [],
            assignment: null,
            pendingApprovals: 0,
            mailboxUnread: 0,
            suggestedAction: {
              label: 'Create a contract from your brief.',
              tool: 'filepad_create_contract',
              reason: 'No active contracts exist.',
            },
          },
          quickReference: [],
          availableToolGroups: [
            {
              group: 'bootstrap',
              purpose: 'Start work.',
              tools: ['filepad_bootstrap'],
            },
          ],
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
    const parsed = JSON.parse(content[0]?.text ?? '{}');

    // Compact shape: operatingBrief present with all fields
    expect(parsed.bootstrap.operatingBrief).toBeDefined();
    expect(parsed.bootstrap.operatingBrief.product).toBe('Filepad is a governed workspace for agent work.');
    expect(parsed.bootstrap.operatingBrief.permissions).toEqual({
      canReadWorkspace: true,
      canCreateArtifacts: false,
      canCreateFolders: false,
      canProposeEdits: false,
      externalActionsMayRequireApproval: true,
    });
    expect(parsed.bootstrap.operatingBrief.contracts).toEqual([]);
    expect(parsed.bootstrap.operatingBrief.assignment).toBeNull();
    expect(parsed.bootstrap.operatingBrief.pendingApprovals).toBe(0);
    expect(parsed.bootstrap.operatingBrief.mailboxUnread).toBe(0);
    expect(parsed.bootstrap.operatingBrief.suggestedAction).toEqual({
      label: 'Create a contract from your brief.',
      tool: 'filepad_create_contract',
      reason: 'No active contracts exist.',
    });

    // Compact shape: full tools array is stripped
    expect(parsed.tools).toBeUndefined();

    // Compact shape: availableToolGroups only has group + purpose (no tools arrays)
    const groups = parsed.bootstrap.availableToolGroups;
    expect(groups).toEqual([
      { group: 'bootstrap', purpose: 'Start work.' },
    ]);
  });

  it('reports all missing propose_edit fields and accepts content as a newText alias', async () => {
    const proposeCalls: unknown[] = [];
    const client = {
      proposeEdit: async (params: unknown) => {
        proposeCalls.push(params);
        return { proposalId: 'p_1' };
      },
    } as unknown as FilepadAgentClient;

    await expect(
      handleCallTool(
        {
          params: {
            name: 'filepad_propose_edit',
            arguments: {
              fileNodeId: 'fn_1',
              content: 'Updated text',
            },
          },
        },
        {
          client,
          workspaceId: 'ws_test',
          scopes: ['files:propose'],
        },
      ),
    ).rejects.toThrow(/baseVersionId, summary/);

    const result = await handleCallTool(
      {
        params: {
          name: 'filepad_propose_edit',
          arguments: {
            fileNodeId: 'fn_1',
            baseVersionId: 'av_1',
            summary: 'Update text',
            content: 'Updated text',
          },
        },
      },
      {
        client,
        workspaceId: 'ws_test',
        scopes: ['files:propose'],
      },
    );

    expect(proposeCalls).toEqual([
      {
        fileNodeId: 'fn_1',
        baseVersionId: 'av_1',
        summary: 'Update text',
        newText: 'Updated text',
      },
    ]);
    expect(result.content).toBeTruthy();
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
