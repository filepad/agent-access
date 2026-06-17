// TEST CATEGORY: scaffolding
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { connectAgent, renderConnectResult } from '../src/index.js';

function makeOAuthFetch(calls: string[]): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url === 'https://api.filepad.ai/register') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { redirect_uris?: string[] };
      expect(body.redirect_uris?.[0]).toBe('http://127.0.0.1:7777/callback');
      return new Response(JSON.stringify({ client_id: 'client_test' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === 'https://api.filepad.ai/oauth/token') {
      expect(String(init?.body)).toContain('grant_type=authorization_code');
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

describe('agent-connect OAuth MCP setup', () => {
  it('writes canonical /mcp config from OAuth without calling legacy pair endpoint', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filepad-agent-connect-'));
    const configPath = join(dir, 'openclaw.json');
    const outputPath = join(dir, 'result.json');
    const calls: string[] = [];

    try {
      const result = await connectAgent({
        runtime: 'openclaw',
        baseUrl: 'https://api.filepad.ai',
        configPath,
        outputPath,
        redirectUri: 'http://127.0.0.1:7777/callback',
        fetchImpl: makeOAuthFetch(calls),
        authorizationCodeProvider: async ({ authorizationUrl, state, redirectUri }) => {
          const url = new URL(authorizationUrl);
          expect(url.pathname).toBe('/oauth/authorize');
          expect(url.searchParams.get('resource')).toBe('https://api.filepad.ai/mcp');
          expect(url.searchParams.get('client_id')).toBe('client_test');
          expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
          expect(url.searchParams.get('state')).toBe(state);
          return 'oauth_code_test';
        },
      });

      const config = JSON.parse(await readFile(configPath, 'utf8')) as {
        mcp: { servers: { filepad: { transport: string; url: string; headers: Record<string, string> } } };
      };
      expect(config.mcp.servers.filepad).toEqual({
        transport: 'streamable_http',
        url: 'https://api.filepad.ai/mcp',
        headers: { Authorization: 'Bearer fp_oauth_test' },
      });
      expect((await stat(configPath)).mode & 0o777).toBe(0o600);
      expect(calls).toEqual(['https://api.filepad.ai/register', 'https://api.filepad.ai/oauth/token']);

      const structured = JSON.parse(await readFile(outputPath, 'utf8')) as typeof result;
      expect(structured.response.oauth.resource).toBe('https://api.filepad.ai/mcp');
      expect(structured.lifecycle).toMatchObject({
        connected: true,
        configWritten: true,
        configTarget: 'mcp.servers.filepad',
        nativeToolsAvailable: false,
        requiresHostRestart: true,
        afterRestartTool: 'filepad_bootstrap',
      });
      expect(renderConnectResult(result)).toContain('MCP config target: mcp.servers.filepad');
      expect(renderConnectResult(result)).toContain('Great, Filepad is connected.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('preserves OpenClaw config and removes the invalid generic MCP key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filepad-agent-connect-'));
    const configPath = join(dir, 'openclaw.json');
    const outputPath = join(dir, 'result.json');
    const calls: string[] = [];

    try {
      await writeFile(
        configPath,
        `${JSON.stringify({
          theme: 'dark',
          mcpServers: { filepad: { command: 'old-filepad' } },
          mcp: { enabled: true, servers: { other: { command: 'other-tool' } } },
        }, null, 2)}\n`,
      );

      await connectAgent({
        runtime: 'openclaw',
        baseUrl: 'https://api.filepad.ai',
        configPath,
        outputPath,
        redirectUri: 'http://127.0.0.1:7777/callback',
        fetchImpl: makeOAuthFetch(calls),
        authorizationCodeProvider: async () => 'oauth_code_test',
      });

      const config = JSON.parse(await readFile(configPath, 'utf8')) as {
        theme: string;
        mcpServers?: unknown;
        mcp: { enabled: boolean; servers: Record<string, { command?: string; url?: string }> };
      };
      expect(config.theme).toBe('dark');
      expect(config.mcpServers).toBeUndefined();
      expect(config.mcp.enabled).toBe(true);
      expect(config.mcp.servers['other']?.command).toBe('other-tool');
      expect(config.mcp.servers['filepad']).toMatchObject({ url: 'https://api.filepad.ai/mcp' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes recovery handoff output before attempting a config merge', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filepad-agent-connect-'));
    const configPath = join(dir, 'config.toml');
    const outputPath = join(dir, 'result.json');
    const calls: string[] = [];

    try {
      await writeFile(configPath, 'model = "gpt-5.5"\n');

      await expect(
        connectAgent({
          runtime: 'codex',
          baseUrl: 'https://api.filepad.ai',
          configPath,
          outputPath,
          redirectUri: 'http://127.0.0.1:7777/callback',
          fetchImpl: makeOAuthFetch(calls),
          authorizationCodeProvider: async () => 'oauth_code_test',
        }),
      ).rejects.toThrow();

      const structured = JSON.parse(await readFile(outputPath, 'utf8')) as {
        response: { oauth: { resource: string }; hostConfig: { runtime: string } };
        wroteConfig: boolean;
        lifecycle: { configWritten: boolean; requiresHostRestart: boolean };
      };
      expect(structured.response.oauth.resource).toBe('https://api.filepad.ai/mcp');
      expect(structured.response.hostConfig.runtime).toBe('codex');
      expect(structured.wroteConfig).toBe(false);
      expect(structured.lifecycle.configWritten).toBe(false);
      expect(structured.lifecycle.requiresHostRestart).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
