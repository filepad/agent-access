// TEST CATEGORY: pairing
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { connectAgent, renderConnectResult } from '../src/index.js';

function makeOAuthFetch(): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === 'https://api.filepad.ai/register') {
      return new Response(JSON.stringify({ client_id: 'client_test' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === 'https://api.filepad.ai/oauth/token') {
      expect(String(init?.body)).toContain('code=oauth_code_test');
      return new Response(JSON.stringify({
        access_token: 'fp_oauth_test',
        token_type: 'Bearer',
        expires_in: 28800,
        scope: 'env:read notifications:read',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
}

describe('agent-connect Claude Code OAuth boundary', () => {
  it('registers MCP only and does not install contract hooks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filepad-agent-connect-claude-code-'));
    const configPath = join(dir, '.claude', 'settings.json');
    const outputPath = join(dir, 'connect-result.json');
    const mcpCommands: Array<{ command: string; args: string[] }> = [];

    try {
      const result = await connectAgent({
        runtime: 'claude-code',
        baseUrl: 'https://api.filepad.ai',
        configPath,
        outputPath,
        redirectUri: 'http://127.0.0.1:7777/callback',
        fetchImpl: makeOAuthFetch(),
        authorizationCodeProvider: async ({ authorizationUrl }) => {
          expect(new URL(authorizationUrl).searchParams.get('resource')).toBe('https://api.filepad.ai/mcp');
          return 'oauth_code_test';
        },
        mcpCommandRunner: async (command, args) => {
          mcpCommands.push({ command, args });
        },
      });

      expect(mcpCommands).toHaveLength(1);
      expect(mcpCommands[0]).toMatchObject({
        command: 'claude',
        args: ['mcp', 'add-json', '-s', 'local', 'filepad', expect.any(String)],
      });
      expect(JSON.parse(mcpCommands[0]!.args[5]!)).toMatchObject({
        transport: 'streamable_http',
        url: 'https://api.filepad.ai/mcp',
        headers: { Authorization: 'Bearer fp_oauth_test' },
      });

      const structured = JSON.parse(await readFile(outputPath, 'utf8')) as typeof result;
      expect(structured.hooksInstalled).toBe(false);
      expect(structured.hooksCredentialsPath).toBeNull();
      expect(renderConnectResult(result)).toContain('Contract verification hooks: not installed by agent-connect.');
      expect(renderConnectResult(result)).toContain('@filepad/runtime-adapter-claude-code');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
