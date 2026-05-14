// TEST CATEGORY: scaffolding
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { pairAgent, renderPairResult, type PairResponse } from '../src/index.js';

function makePairResponse(): PairResponse {
  return {
    status: 'paired',
    workspace: { id: 'ws_test', name: 'Filepad Dev', owner: 'Alex' },
    credentials: {
      agentKeyId: 'ik_test',
      agentSecret: 'secret_once',
      expiresAt: '2026-05-08T00:00:00.000Z',
    },
    hostConfig: {
      runtime: 'openclaw',
      configPath: '~/.openclaw/openclaw.json',
      server: {
        command: 'npx',
        args: ['-y', '@filepad/mcp-server@latest'],
        env: {
          FILEPAD_BASE_URL: 'https://api.filepad.ai',
          FILEPAD_WORKSPACE_ID: 'ws_test',
          FILEPAD_AGENT_KEY_ID: 'ik_test',
          FILEPAD_AGENT_SECRET: 'secret_once',
        },
      },
      restartInstruction: 'Restart OpenClaw MCP servers.',
    },
    handoff: {
      workspace: { id: 'ws_test', name: 'Filepad Dev', owner: 'Alex' },
      agent: {
        keyId: 'ik_test',
        label: 'Bot-um',
        scopes: ['env:read'],
        status: 'paired',
      },
      constitution: {
        title: 'Filepad Workspace Constitution',
        principles: ['User agency'],
        readMoreUrl: null,
      },
      mailbox: { unread: 0, recent: [] },
      pendingApprovals: { count: 0, items: [] },
      recentOutcomes: [],
      suggestedFirstActions: [],
      nextStep: {
        what: 'Restart MCP',
        how: 'Restart OpenClaw MCP servers.',
        afterRestartCommand: 'filepad_bootstrap',
      },
      sessionToken: 'fp_sess_test',
      text: 'Connected to Filepad workspace: Filepad Dev (Alex)',
    },
  };
}

describe('agent-connect pairing', () => {
  it('writes host MCP config and structured output without text parsing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filepad-agent-connect-'));
    const configPath = join(dir, 'openclaw.json');
    const outputPath = join(dir, 'result.json');
    const response = makePairResponse();
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    try {
      const result = await pairAgent({
        code: 'A3K9MZ2X',
        runtime: 'openclaw',
        baseUrl: 'https://api.filepad.ai',
        configPath,
        outputPath,
        fetchImpl,
      });

      const config = JSON.parse(await readFile(configPath, 'utf8')) as {
        mcp: {
          servers: {
            filepad: {
              command: string;
              args: string[];
              env: Record<string, string>;
            };
          };
        };
      };
      expect(config.mcp.servers.filepad.command).toBe('npx');
      expect(config.mcp.servers.filepad.args).toEqual([
        '-y',
        '@filepad/mcp-server@latest',
      ]);
      expect(config.mcp.servers.filepad.env['FILEPAD_AGENT_SECRET']).toBe('secret_once');
      expect((await stat(configPath)).mode & 0o777).toBe(0o600);

      const structured = JSON.parse(await readFile(outputPath, 'utf8')) as typeof result;
      expect(structured.response.handoff.sessionToken).toBe('fp_sess_test');
      expect(structured.lifecycle).toMatchObject({
        paired: true,
        configWritten: true,
        configTarget: 'mcp.servers.filepad',
        nativeToolsAvailable: false,
        requiresHostRestart: true,
        afterRestartTool: 'filepad_bootstrap',
      });
      expect(renderPairResult(result)).toContain('Machine-readable result:');
      expect(renderPairResult(result)).toContain('MCP config target: mcp.servers.filepad');
      expect(renderPairResult(result)).toContain('Great, Filepad is connected.');
      expect(renderPairResult(result)).toContain('This is not a failure');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('preserves OpenClaw config and removes the invalid generic MCP key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filepad-agent-connect-'));
    const configPath = join(dir, 'openclaw.json');
    const outputPath = join(dir, 'result.json');
    const response = makePairResponse();
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    try {
      await writeFile(
        configPath,
        `${JSON.stringify({
          theme: 'dark',
          mcpServers: {
            filepad: { command: 'old-filepad' },
          },
          mcp: {
            enabled: true,
            servers: {
              other: { command: 'other-tool' },
            },
          },
        }, null, 2)}\n`,
      );

      await pairAgent({
        code: 'A3K9MZ2X',
        runtime: 'openclaw',
        baseUrl: 'https://api.filepad.ai',
        configPath,
        outputPath,
        fetchImpl,
      });

      const config = JSON.parse(await readFile(configPath, 'utf8')) as {
        theme: string;
        mcpServers?: unknown;
        mcp: {
          enabled: boolean;
          servers: Record<string, { command: string }>;
        };
      };
      expect(config.theme).toBe('dark');
      expect(config.mcpServers).toBeUndefined();
      expect(config.mcp.enabled).toBe(true);
      expect(config.mcp.servers['other']?.command).toBe('other-tool');
      expect(config.mcp.servers['filepad']?.command).toBe('npx');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes recovery handoff output before attempting a config merge', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filepad-agent-connect-'));
    const configPath = join(dir, 'config.toml');
    const outputPath = join(dir, 'result.json');
    const response = makePairResponse();
    response.hostConfig.configPath = configPath;
    response.hostConfig.runtime = 'codex';
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    try {
      await writeFile(configPath, 'model = "gpt-5.5"\n');

      await expect(
        pairAgent({
          code: 'A3K9MZ2X',
          runtime: 'codex',
          baseUrl: 'https://api.filepad.ai',
          outputPath,
          fetchImpl,
        }),
      ).rejects.toThrow();

      const structured = JSON.parse(await readFile(outputPath, 'utf8')) as {
        response: PairResponse;
        wroteConfig: boolean;
        lifecycle: {
          configWritten: boolean;
          requiresHostRestart: boolean;
        };
      };
      expect(structured.response.handoff.sessionToken).toBe('fp_sess_test');
      expect(structured.response.hostConfig.runtime).toBe('codex');
      expect(structured.wroteConfig).toBe(false);
      expect(structured.lifecycle.configWritten).toBe(false);
      expect(structured.lifecycle.requiresHostRestart).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
