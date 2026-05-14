// TEST CATEGORY: scaffolding
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { pairAgent, renderPairResult, type PairResponse } from '../src/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
      configPath: '~/.claude/settings.json',
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
      restartInstruction: 'Restart Claude Code.',
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
        what: 'Restart',
        how: 'Restart Claude Code.',
        afterRestartCommand: 'filepad_bootstrap',
      },
      sessionToken: 'fp_sess_test',
      text: 'Connected to Filepad workspace: Filepad Dev (Alex)',
    },
  };
}

function makeClaudeCodeDesiredPairResponse(): PairResponse {
  const response = makeClaudeCodePairResponse();
  response.hostConfig.configPath = 'claude-code://mcp/local';
  response.hostConfig.desiredState = {
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
      adapterVersion: '0.1.1',
      adapterBinary: 'filepad-claude-code-hook',
      adapterCommand: 'npx -y @filepad/claude-code-hooks@0.1.1',
      enforcementMode: 'block',
      offlinePolicy: 'allow',
      events: ['PreToolUse', 'Stop', 'SessionStart', 'UserPromptSubmit'],
    },
  };
  return response;
}

function makeFetch(response: PairResponse): typeof fetch {
  return async () =>
    new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

function makeMcpCommandRecorder(calls: Array<{ command: string; args: string[] }>) {
  return async (command: string, args: string[]) => {
    calls.push({ command, args });
  };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

let dir: string;
let origHome: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'filepad-claude-code-hooks-test-'));
  origHome = process.env['HOME'];
  // Point HOME at temp dir so credentials file lands in a predictable location
  process.env['HOME'] = dir;
});

afterEach(async () => {
  if (origHome !== undefined) {
    process.env['HOME'] = origHome;
  } else {
    delete process.env['HOME'];
  }
  await rm(dir, { recursive: true, force: true });
});

// ── Hook installation tests ───────────────────────────────────────────────────

describe('pairAgent Claude Code desired host state', () => {
  it('applies backend desired host state without exposing hook flags', async () => {
    const configPath = join(dir, 'project', '.claude', 'settings.local.json');
    const response = makeClaudeCodeDesiredPairResponse();
    response.hostConfig.desiredState!.mcp.configPath = configPath;
    response.hostConfig.desiredState!.hooks.configPath = configPath;
    const mcpCommands: Array<{ command: string; args: string[] }> = [];

    const result = await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: makeMcpCommandRecorder(mcpCommands),
    });

    const settings = JSON.parse(await readFile(configPath, 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string; env?: Record<string, string> }> }>>;
    };
    const credentialsPath = join(
      dir,
      '.config',
      'filepad',
      'connections',
      'claude-code',
      'ws_test',
      'ik_test.json',
    );

    expect(mcpCommands).toHaveLength(1);
    expect(mcpCommands[0]).toMatchObject({
      command: 'claude',
      args: ['mcp', 'add-json', '-s', 'local', 'filepad', expect.any(String)],
    });
    expect(JSON.parse(mcpCommands[0]!.args[5]!)).toMatchObject({
      command: 'npx',
      args: ['-y', '@filepad/mcp-server@latest'],
      env: { FILEPAD_WORKSPACE_ID: 'ws_test' },
    });
    expect(settings.hooks['PreToolUse']?.[0]?.hooks[0]?.command).toContain(
      'claude-code-hooks',
    );
    expect(settings.hooks['PreToolUse']?.[0]?.hooks[0]?.env).toMatchObject({
      FILEPAD_HOOKS_CREDENTIALS_PATH: credentialsPath,
      FILEPAD_HOOK_ENFORCEMENT_MODE: 'block',
    });
    expect(result.hooksInstalled).toBe(true);
    expect(result.hooksCredentialsPath).toBe(credentialsPath);
  });

  it('falls back to a real Claude settings file when native MCP registration fails', async () => {
    const projectHookConfigPath = join(dir, 'project', '.claude', 'settings.local.json');
    const globalMcpConfigPath = join(dir, '.claude', 'settings.json');
    const response = makeClaudeCodeDesiredPairResponse();
    response.hostConfig.desiredState!.mcp.configPath = 'claude-code://mcp/local';
    response.hostConfig.desiredState!.hooks.configPath = projectHookConfigPath;

    const result = await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: async () => {
        throw new Error('claude CLI unavailable in extension host');
      },
    });

    const mcpSettings = JSON.parse(await readFile(globalMcpConfigPath, 'utf8')) as {
      mcpServers: {
        filepad: {
          command: string;
          args: string[];
          env: Record<string, string>;
        };
      };
    };
    const hookSettings = JSON.parse(await readFile(projectHookConfigPath, 'utf8')) as {
      hooks: Record<string, unknown>;
    };

    expect(mcpSettings.mcpServers.filepad).toMatchObject({
      command: 'npx',
      args: ['-y', '@filepad/mcp-server@latest'],
      env: {
        FILEPAD_BASE_URL: 'https://api.filepad.ai',
        FILEPAD_WORKSPACE_ID: 'ws_test',
        FILEPAD_AGENT_KEY_ID: 'ik_test',
        FILEPAD_AGENT_SECRET: 'secret_once',
      },
    });
    expect(hookSettings.hooks['PreToolUse']).toBeDefined();
    expect((await stat(globalMcpConfigPath)).mode & 0o777).toBe(0o600);
    expect(result.wroteConfig).toBe(true);
    expect(result.lifecycle.configWritten).toBe(true);
    expect(result.lifecycle.configTarget).toBe('claude.mcp.local.filepad');
  });

  it('removes stale global Filepad hooks when applying project-scoped Claude Code hooks', async () => {
    const configPath = join(dir, 'project', '.claude', 'settings.local.json');
    const globalConfigPath = join(dir, '.claude', 'settings.json');
    await mkdir(dirname(globalConfigPath), { recursive: true });
    await writeFile(
      globalConfigPath,
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command:
                    'FILEPAD_HOOK_ENFORCEMENT_MODE=block node /home/alexkush/FilepadProd/packages/agent-hooks/dist/cli.js session-start',
                },
              ],
            },
          ],
        },
        mcpServers: {
          filepad: {
            command: 'npx',
            args: ['-y', '@filepad/mcp-server@latest'],
            env: { FILEPAD_BASE_URL: 'https://api.filepad.ai' },
          },
        },
      }),
    );

    const response = makeClaudeCodeDesiredPairResponse();
    response.hostConfig.desiredState!.mcp.configPath = configPath;
    response.hostConfig.desiredState!.hooks.configPath = configPath;

    await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: async () => {},
    });

    const globalSettings = JSON.parse(await readFile(globalConfigPath, 'utf8')) as {
      hooks?: unknown;
      mcpServers?: unknown;
    };
    expect(globalSettings.hooks).toBeUndefined();
    expect(globalSettings.mcpServers).toBeDefined();
  });

  it('writes hooks config to settings.json with matcher=* for tool events', async () => {
    const configPath = join(dir, 'settings.json');
    const response = makeClaudeCodePairResponse();

    await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      configPath,
      installHooks: true,
      hookCommand: 'filepad-claude-code-hook',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: async () => {},
    });

    const settings = JSON.parse(await readFile(configPath, 'utf8')) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; env?: Record<string, string> }> }>>;
    };

    expect(settings.hooks).toBeDefined();
    // PreToolUse must have matcher="*" (tool event)
    const preToolUse = settings.hooks['PreToolUse']!;
    expect(Array.isArray(preToolUse)).toBe(true);
    expect(preToolUse[0]!.matcher).toBe('*');
    expect(preToolUse[0]!.hooks[0]!.command).toContain('pre-tool-use');
    expect(preToolUse[0]!.hooks[0]!.env?.['FILEPAD_HOOK_ENFORCEMENT_MODE']).toBe('block');

    // Stop must have no matcher (lifecycle event)
    const stop = settings.hooks['Stop']!;
    expect(Array.isArray(stop)).toBe(true);
    expect(stop[0]!.matcher).toBeUndefined();
    expect(stop[0]!.hooks[0]!.command).toContain('stop');
  });

  it('installs exactly the expected 13 hook events', async () => {
    const configPath = join(dir, 'settings.json');
    const response = makeClaudeCodePairResponse();

    await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      configPath,
      installHooks: true,
      hookCommand: 'filepad-claude-code-hook',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: async () => {},
    });

    const settings = JSON.parse(await readFile(configPath, 'utf8')) as {
      hooks: Record<string, unknown>;
    };

    const expectedEvents = [
      'PreToolUse', 'Stop', 'PostToolUse', 'PostToolUseFailure', 'PostToolBatch',
      'PermissionDenied', 'SessionStart', 'UserPromptSubmit', 'SessionEnd',
      'TaskCreated', 'TaskCompleted', 'SubagentStart', 'SubagentStop',
    ];
    for (const event of expectedEvents) {
      expect(settings.hooks[event], `hooks.${event} should exist`).toBeDefined();
    }
    expect(Object.keys(settings.hooks)).toHaveLength(expectedEvents.length);
  });

  it('--enforce writes block enforcement mode and deny offline policy to credentials', async () => {
    const configPath = join(dir, 'settings.json');
    const response = makeClaudeCodePairResponse();

    await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      configPath,
      installHooks: true,
      hookCommand: 'filepad-claude-code-hook',
      hookEnforcementMode: 'block',
      hookOfflinePolicy: 'deny',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: async () => {},
    });

    const credPath = join(dir, '.config', 'filepad', 'connections', 'claude-code', 'ws_test', 'ik_test.json');
    const creds = JSON.parse(await readFile(credPath, 'utf8')) as {
      enforcementMode: string;
      offlinePolicy: string;
    };
    expect(creds.enforcementMode).toBe('block');
    expect(creds.offlinePolicy).toBe('deny');
    expect((await stat(credPath)).mode & 0o777).toBe(0o600);
  });

  it('defaults to block enforcement mode and allow offline policy', async () => {
    const configPath = join(dir, 'settings.json');
    const response = makeClaudeCodePairResponse();

    const result = await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      configPath,
      installHooks: true,
      hookCommand: 'filepad-claude-code-hook',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: async () => {},
    });

    expect(result.hookEnforcementMode).toBe('block');
    expect(result.hookOfflinePolicy).toBe('allow');

    const credPath = join(dir, '.config', 'filepad', 'connections', 'claude-code', 'ws_test', 'ik_test.json');
    const creds = JSON.parse(await readFile(credPath, 'utf8')) as {
      enforcementMode: string;
      offlinePolicy: string;
    };
    expect(creds.enforcementMode).toBe('block');
    expect(creds.offlinePolicy).toBe('allow');
  });

  it('preserves non-Filepad hooks in settings.json', async () => {
    const configPath = join(dir, 'settings.json');
    // Pre-populate with an existing third-party hook
    await writeFile(
      configPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'other-tool check' }] }],
        },
      }),
    );
    const response = makeClaudeCodePairResponse();

    await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      configPath,
      installHooks: true,
      hookCommand: 'filepad-claude-code-hook',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: async () => {},
    });

    const settings = JSON.parse(await readFile(configPath, 'utf8')) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
    };

    const preToolUse = settings.hooks['PreToolUse']!;
    // Filepad entry should be first
    expect(preToolUse[0]!.hooks[0]!.command).toContain('filepad-claude-code-hook');
    // Third-party hook should still be present
    const hasOtherTool = preToolUse.some((entry) =>
      entry.hooks.some((h) => h.command === 'other-tool check'),
    );
    expect(hasOtherTool).toBe(true);
  });

  it('replaces old and current Filepad hook commands without duplicating them', async () => {
    const configPath = join(dir, 'settings.json');
    // Pre-populate with a stale Filepad hook
    await writeFile(
      configPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: '*', hooks: [{ type: 'command', command: 'filepad-claude-code-hook pre-tool-use' }] },
            { matcher: '*', hooks: [{ type: 'command', command: 'filepad-hook pre-tool-use' }] },
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'other-tool check' }] },
          ],
        },
      }),
    );
    const response = makeClaudeCodePairResponse();

    await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      configPath,
      installHooks: true,
      hookCommand: 'filepad-claude-code-hook',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: async () => {},
    });

    const settings = JSON.parse(await readFile(configPath, 'utf8')) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
    };

    const preToolUse = settings.hooks['PreToolUse']!;
    // Exactly one filepad-claude-code-hook entry (no duplicates)
    const filepadEntries = preToolUse.filter((entry) =>
      entry.hooks.some((h) => h.command.includes('filepad-claude-code-hook')),
    );
    expect(filepadEntries).toHaveLength(1);
    expect(
      preToolUse.some((entry) =>
        entry.hooks.some((h) => h.command.includes('filepad-hook')),
      ),
    ).toBe(false);
  });

  it('credentials file has baseUrl, workspaceId, keyId, and secret', async () => {
    const configPath = join(dir, 'settings.json');
    const response = makeClaudeCodePairResponse();

    await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      configPath,
      installHooks: true,
      hookCommand: 'filepad-claude-code-hook',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: async () => {},
    });

    const credPath = join(dir, '.config', 'filepad', 'connections', 'claude-code', 'ws_test', 'ik_test.json');
    const creds = JSON.parse(await readFile(credPath, 'utf8')) as {
      baseUrl: string;
      workspaceId: string;
      keyId: string;
      secret: string;
    };
    expect(creds.baseUrl).toBe('https://api.filepad.ai');
    expect(creds.workspaceId).toBe('ws_test');
    expect(creds.keyId).toBe('ik_test');
    expect(creds.secret).toBe('secret_once');
  });

  it('renderPairResult reports hooks installed, enforcement mode, offline policy, and covered events', async () => {
    const configPath = join(dir, 'settings.json');
    const response = makeClaudeCodePairResponse();

    const result = await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      configPath,
      installHooks: true,
      hookCommand: 'filepad-claude-code-hook',
      hookEnforcementMode: 'block',
      hookOfflinePolicy: 'deny',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: async () => {},
    });

    const rendered = renderPairResult(result);
    expect(rendered).toContain('Hooks installed:');
    expect(rendered).toContain('PreToolUse');
    expect(rendered).toContain('Stop');
    expect(rendered).toContain('Hook enforcement mode: block');
    expect(rendered).toContain('Hook offline policy: deny');
  });

  it('result.hooksInstalled=true and hooksCredentialsPath set when hooks written', async () => {
    const configPath = join(dir, 'settings.json');
    const response = makeClaudeCodePairResponse();

    const result = await pairAgent({
      code: 'A3K9',
      runtime: 'claude-code',
      baseUrl: 'https://api.filepad.ai',
      configPath,
      installHooks: true,
      hookCommand: 'filepad-claude-code-hook',
      fetchImpl: makeFetch(response),
      mcpCommandRunner: async () => {},
    });

    expect(result.hooksInstalled).toBe(true);
    expect(result.hooksCredentialsPath).toBeTruthy();
    expect(result.hooksCredentialsPath).toContain(join('connections', 'claude-code', 'ws_test', 'ik_test.json'));

    const rendered = renderPairResult(result);
    expect(rendered).toContain('Hook enforcement mode: block');
    expect(rendered).not.toContain('Hook enforcement mode: warn');
  });

  it('does not install hooks when runtime is not claude-code', async () => {
    // openclaw runtime — hooks should not be installed even with installHooks: true
    const openclaw = makeClaudeCodePairResponse();
    openclaw.hostConfig.runtime = 'openclaw';
    const configPath = join(dir, 'openclaw.json');

    const result = await pairAgent({
      code: 'A3K9',
      runtime: 'openclaw',
      baseUrl: 'https://api.filepad.ai',
      configPath,
      installHooks: true,
      hookCommand: 'filepad-claude-code-hook',
      fetchImpl: makeFetch(openclaw),
    });

    expect(result.hooksInstalled).toBe(false);
    expect(result.hooksCredentialsPath).toBeNull();
  });
});
