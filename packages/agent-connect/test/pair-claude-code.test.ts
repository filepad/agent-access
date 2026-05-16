// TEST CATEGORY: pairing
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { pairAgent, renderPairResult, type PairResponse } from '../src/index.js';

function makeClaudeCodePairResponse(): PairResponse {
  return {
    status: 'paired',
    workspace: { id: 'ws_test', name: 'Filepad Dev', owner: 'Alex' },
    credentials: {
      agentKeyId: 'ik_test',
      agentSecret: 'secret_once',
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
    hostConfig: {
      runtime: 'claude-code',
      configPath: 'claude-code://mcp/local',
      server: {
        transport: 'streamable_http',
        url: 'https://api.filepad.ai/mcp/v1/workspaces/ws_test/stream',
        headers: {
          Authorization: 'Bearer fp_sess_test',
        },
      },
      restartInstruction: 'Reload Claude Code MCP servers.',
      desiredState: {
        version: 1,
        runtime: 'claude-code',
        scope: 'project',
        mcp: {
          enabled: true,
          configPath: 'claude-code://mcp/local',
          configTarget: 'claude.mcp.local.filepad',
        },
        hooks: {
          enabled: true,
          configPath: './.claude/settings.local.json',
          credentialsPath: '~/.config/filepad/connections/claude-code/ws_test/ik_test.json',
          adapterPackage: '@filepad/claude-code-hooks',
          adapterVersion: '0.1.3',
          adapterBinary: 'filepad-claude-code-hook',
          adapterCommand: 'npx -y @filepad/claude-code-hooks@0.1.3',
          enforcementMode: 'block',
          offlinePolicy: 'allow',
          events: ['PreToolUse', 'Stop', 'SessionStart', 'UserPromptSubmit'],
        },
      },
    },
    handoff: {
      workspace: { id: 'ws_test', name: 'Filepad Dev', owner: 'Alex' },
      agent: { keyId: 'ik_test', label: 'Test Agent', scopes: [], status: 'paired' },
      constitution: { title: 'Test', principles: [], readMoreUrl: null },
      mailbox: { unread: 0, recent: [] },
      pendingApprovals: { count: 0, items: [] },
      recentOutcomes: [],
      suggestedFirstActions: [],
      nextStep: {
        what: 'Reload MCP',
        how: 'Reload Claude Code MCP servers.',
        afterRestartCommand: 'filepad_bootstrap',
      },
      sessionToken: 'fp_sess_test',
      text: 'Connected to Filepad workspace: Filepad Dev (Alex)',
    },
  };
}

describe('agent-connect Claude Code pairing boundary', () => {
  it('registers MCP only and does not install contract hooks from desired host state', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filepad-agent-connect-claude-code-'));
    const configPath = join(dir, '.claude', 'settings.json');
    const outputPath = join(dir, 'pair-result.json');
    const response = makeClaudeCodePairResponse();
    response.hostConfig.desiredState!.mcp.configPath = configPath;
    const mcpCommands: Array<{ command: string; args: string[] }> = [];
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    try {
      const result = await pairAgent({
        code: 'A3K9',
        runtime: 'claude-code',
        baseUrl: 'https://api.filepad.ai',
        outputPath,
        fetchImpl,
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
        url: 'https://api.filepad.ai/mcp/v1/workspaces/ws_test/stream',
        headers: { Authorization: 'Bearer fp_sess_test' },
      });

      const structured = JSON.parse(await readFile(outputPath, 'utf8')) as typeof result;
      expect(structured.hooksInstalled).toBe(false);
      expect(structured.hooksCredentialsPath).toBeNull();
      expect(renderPairResult(result)).toContain('Contract verification hooks: not installed by agent-connect.');
      expect(renderPairResult(result)).toContain('@filepad/runtime-adapter-claude-code');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
