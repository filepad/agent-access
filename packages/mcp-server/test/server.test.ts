// TEST CATEGORY: integration
import { beforeAll, describe, expect, it } from 'vitest';

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
