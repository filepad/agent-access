// TEST CATEGORY: unit
import { describe, expect, it, vi } from 'vitest';
import { runHookCommand, type RunOptions } from '../src/run.js';
import type { HookClient } from '../src/client.js';
import type { HookCredentials } from '../src/config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_CREDS: HookCredentials = {
  baseUrl: 'https://api.filepad.ai',
  workspaceId: 'ws_test',
  keyId: 'ik_test',
  secret: 'secret_test',
};

function makeClient(overrides: Partial<HookClient> = {}): HookClient {
  return {
    preToolUse: vi.fn().mockResolvedValue({ decision: 'allow', enforcementMode: 'warn' }),
    stop: vi.fn().mockResolvedValue({ decision: 'allow' }),
    userPromptSubmit: vi.fn().mockResolvedValue({ decision: 'allow' }),
    event: vi.fn().mockResolvedValue({ ok: true, recorded: false }),
    recordInvocation: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

function makeOptions(overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    command: 'pre-tool-use',
    inputJson: JSON.stringify({
      session_id: 'sess_test',
      transcript_path: '/tmp/t.json',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
    }),
    mode: 'warn',
    offlinePolicy: 'allow',
    resolveCredentials: vi.fn().mockResolvedValue(FAKE_CREDS),
    clientFactory: () => makeClient(),
    ...overrides,
  };
}

function parseStdout(result: { stdout: string | null }): unknown {
  if (!result.stdout) throw new Error('no stdout');
  return JSON.parse(result.stdout);
}

// ── PreToolUse ────────────────────────────────────────────────────────────────

describe('runHookCommand — PreToolUse', () => {
  it('backend allow → stdout JSON has permissionDecision=allow', async () => {
    const client = makeClient({
      preToolUse: vi.fn().mockResolvedValue({ decision: 'allow', enforcementMode: 'warn' }),
    });
    const result = await runHookCommand(makeOptions({ clientFactory: () => client }));
    expect(result.exitCode).toBe(0);
    const out = parseStdout(result) as { hookSpecificOutput: { permissionDecision: string } };
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(() => JSON.parse(result.stdout!)).not.toThrow();
  });

  it('backend deny + block mode → stdout JSON has permissionDecision=deny', async () => {
    const client = makeClient({
      preToolUse: vi.fn().mockResolvedValue({ decision: 'deny', reason: 'Contract violation', enforcementMode: 'block' }),
    });
    const result = await runHookCommand(
      makeOptions({ mode: 'block', clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    const out = parseStdout(result) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toBe('Contract violation');
  });

  it('backend deny + warn mode → stdout JSON has permissionDecision=allow with FILEPAD WARN', async () => {
    const client = makeClient({
      preToolUse: vi.fn().mockResolvedValue({ decision: 'deny', reason: 'Check failed', enforcementMode: 'warn' }),
    });
    const result = await runHookCommand(
      makeOptions({ mode: 'warn', clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    const out = parseStdout(result) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('[FILEPAD WARN]');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('Check failed');
  });

  it('backend deny + observe mode → allow with FILEPAD OBSERVE', async () => {
    const client = makeClient({
      preToolUse: vi.fn().mockResolvedValue({ decision: 'deny', reason: 'Observed', enforcementMode: 'observe' }),
    });
    const result = await runHookCommand(
      makeOptions({ mode: 'observe', clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    const out = parseStdout(result) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('[FILEPAD OBSERVE]');
  });

  it('invalid stdin JSON → exits 0 and emits fail-open allow JSON', async () => {
    const result = await runHookCommand(
      makeOptions({ command: 'pre-tool-use', inputJson: 'NOT JSON{{{' }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toBeNull();
    const out = parseStdout(result) as { hookSpecificOutput: { permissionDecision: string } };
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(result.stderr).toEqual(expect.arrayContaining([expect.stringContaining('invalid JSON')]));
  });

  it('off mode → exits 0, returns allow without calling backend', async () => {
    const preToolUseMock = vi.fn();
    const client = makeClient({ preToolUse: preToolUseMock });
    const result = await runHookCommand(
      makeOptions({ mode: 'off', clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    expect(preToolUseMock).not.toHaveBeenCalled();
    const out = parseStdout(result) as { hookSpecificOutput: { permissionDecision: string } };
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('missing credentials + warn + offline-allow → exits 0, allow with failing-open reason', async () => {
    const result = await runHookCommand(
      makeOptions({
        mode: 'warn',
        offlinePolicy: 'allow',
        resolveCredentials: vi.fn().mockRejectedValue(new Error('no creds')),
      }),
    );
    expect(result.exitCode).toBe(0);
    const out = parseStdout(result) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('failing open');
    expect(result.stderr).toEqual(
      expect.arrayContaining([expect.stringContaining('credentials unavailable')]),
    );
  });

  it('missing credentials + block + offline-deny → exits 0, deny with offline reason', async () => {
    const result = await runHookCommand(
      makeOptions({
        mode: 'block',
        offlinePolicy: 'deny',
        resolveCredentials: vi.fn().mockRejectedValue(new Error('no creds')),
      }),
    );
    expect(result.exitCode).toBe(0);
    const out = parseStdout(result) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('block');
  });

  it('backend throws + block + offline-deny → exits 0, deny output', async () => {
    const client = makeClient({
      preToolUse: vi.fn().mockRejectedValue(new Error('network error')),
    });
    const result = await runHookCommand(
      makeOptions({ mode: 'block', offlinePolicy: 'deny', clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    const out = parseStdout(result) as {
      hookSpecificOutput: { permissionDecision: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(result.stderr).toEqual(
      expect.arrayContaining([expect.stringContaining('backend error')]),
    );
  });

  it('backend throws + warn + offline-allow → exits 0, allow output (fail-open)', async () => {
    const client = makeClient({
      preToolUse: vi.fn().mockRejectedValue(new Error('network error')),
    });
    const result = await runHookCommand(
      makeOptions({ mode: 'warn', offlinePolicy: 'allow', clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    const out = parseStdout(result) as {
      hookSpecificOutput: { permissionDecision: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('stdout is always valid JSON when decision is made', async () => {
    const result = await runHookCommand(makeOptions());
    expect(result.stdout).not.toBeNull();
    expect(() => JSON.parse(result.stdout!)).not.toThrow();
  });

  it('output always has hookEventName=PreToolUse in hookSpecificOutput', async () => {
    const result = await runHookCommand(makeOptions());
    const out = parseStdout(result) as { hookSpecificOutput: { hookEventName: string } };
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
  });
});

// ── Stop ─────────────────────────────────────────────────────────────────────

describe('runHookCommand — Stop', () => {
  const stopInput = JSON.stringify({
    session_id: 'sess_test',
    transcript_path: '/tmp/t.json',
    hook_event_name: 'Stop',
    stop_hook_active: false,
  });

  it('backend allow → no stdout because Stop allow is implicit', async () => {
    const client = makeClient({ stop: vi.fn().mockResolvedValue({ decision: 'allow' }) });
    const result = await runHookCommand(
      makeOptions({ command: 'stop', inputJson: stopInput, clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeNull();
  });

  it('backend block + block mode → stdout JSON has decision=block', async () => {
    const client = makeClient({
      stop: vi.fn().mockResolvedValue({ decision: 'block', reason: 'Contract "A" has unverified checks' }),
    });
    const result = await runHookCommand(
      makeOptions({ command: 'stop', inputJson: stopInput, mode: 'block', clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    const out = parseStdout(result) as { decision: string; reason: string };
    expect(out.decision).toBe('block');
    expect(out.reason).toBe('Contract "A" has unverified checks');
  });

  it('backend block + warn mode → no stdout because warn does not block Stop', async () => {
    const client = makeClient({
      stop: vi.fn().mockResolvedValue({ decision: 'block', reason: 'Unverified checks' }),
    });
    const result = await runHookCommand(
      makeOptions({ command: 'stop', inputJson: stopInput, mode: 'warn', clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeNull();
  });

  it('stop_hook_active=true → allow without calling backend', async () => {
    const stopMock = vi.fn();
    const client = makeClient({ stop: stopMock });
    const activeInput = JSON.stringify({
      session_id: 'sess_test',
      transcript_path: '/tmp/t.json',
      hook_event_name: 'Stop',
      stop_hook_active: true,
    });
    const result = await runHookCommand(
      makeOptions({ command: 'stop', inputJson: activeInput, mode: 'block', clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    expect(stopMock).not.toHaveBeenCalled();
    expect(result.stdout).toBeNull();
  });

  it('off mode → allow without calling backend', async () => {
    const stopMock = vi.fn();
    const client = makeClient({ stop: stopMock });
    const result = await runHookCommand(
      makeOptions({ command: 'stop', inputJson: stopInput, mode: 'off', clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    expect(stopMock).not.toHaveBeenCalled();
    // off mode: pre-tool-use gets allow JSON; Stop has no stdout because
    // top-level Stop allow is implicit.
    expect(result.stdout).toBeNull();
  });

  it('missing credentials + block + offline-deny → block output', async () => {
    const result = await runHookCommand(
      makeOptions({
        command: 'stop',
        inputJson: stopInput,
        mode: 'block',
        offlinePolicy: 'deny',
        resolveCredentials: vi.fn().mockRejectedValue(new Error('no creds')),
      }),
    );
    expect(result.exitCode).toBe(0);
    const out = parseStdout(result) as { decision: string };
    expect(out.decision).toBe('block');
  });

  it('missing credentials + warn → no stdout (not stop-blocking in warn mode)', async () => {
    const result = await runHookCommand(
      makeOptions({
        command: 'stop',
        inputJson: stopInput,
        mode: 'warn',
        offlinePolicy: 'allow',
        resolveCredentials: vi.fn().mockRejectedValue(new Error('no creds')),
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeNull();
  });

  it('never emits top-level allow or approve decisions for Stop', async () => {
    const cases = [
      { mode: 'block' as const, client: makeClient({ stop: vi.fn().mockResolvedValue({ decision: 'allow' }) }) },
      { mode: 'warn' as const, client: makeClient({ stop: vi.fn().mockResolvedValue({ decision: 'block', reason: 'Warn only' }) }) },
      { mode: 'block' as const, client: makeClient({ stop: vi.fn().mockResolvedValue({ decision: 'block', reason: 'Block' }) }) },
    ];

    for (const testCase of cases) {
      const result = await runHookCommand(
        makeOptions({
          command: 'stop',
          inputJson: stopInput,
          mode: testCase.mode,
          clientFactory: () => testCase.client,
        }),
      );
      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const out = JSON.parse(result.stdout) as { decision?: string };
        expect(out.decision).not.toBe('allow');
        expect(out.decision).not.toBe('approve');
      }
    }
  });
});

// ── PostToolUse ───────────────────────────────────────────────────────────────

describe('runHookCommand — PostToolUse', () => {
  const postToolUseInput = JSON.stringify({
    session_id: 'sess_test',
    transcript_path: '/tmp/t.json',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'pnpm typecheck' },
    tool_response: { output: 'ok', error: '' },
  });

  it('sends event to backend, no stdout', async () => {
    const eventMock = vi.fn().mockResolvedValue({ ok: true, recorded: false });
    const client = makeClient({ event: eventMock });
    const result = await runHookCommand(
      makeOptions({ command: 'post-tool-use', inputJson: postToolUseInput, clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeNull();
    expect(eventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'post-tool-use' }),
    );
  });

  it('never calls preToolUse or stop', async () => {
    const preToolUseMock = vi.fn();
    const stopMock = vi.fn();
    const client = makeClient({ preToolUse: preToolUseMock, stop: stopMock });
    await runHookCommand(
      makeOptions({ command: 'post-tool-use', inputJson: postToolUseInput, clientFactory: () => client }),
    );
    expect(preToolUseMock).not.toHaveBeenCalled();
    expect(stopMock).not.toHaveBeenCalled();
  });

  it('backend event failure → exits 0 (resilient, non-blocking)', async () => {
    const client = makeClient({
      event: vi.fn().mockRejectedValue(new Error('backend down')),
    });
    const result = await runHookCommand(
      makeOptions({ command: 'post-tool-use', inputJson: postToolUseInput, clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeNull();
    expect(result.stderr).toEqual(
      expect.arrayContaining([expect.stringContaining('backend error')]),
    );
  });

  it('off mode → skips all network calls', async () => {
    const eventMock = vi.fn();
    const client = makeClient({ event: eventMock });
    const result = await runHookCommand(
      makeOptions({ command: 'post-tool-use', inputJson: postToolUseInput, mode: 'off', clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    expect(eventMock).not.toHaveBeenCalled();
    expect(result.stdout).toBeNull();
  });
});

// ── Generic event commands ────────────────────────────────────────────────────

describe('runHookCommand — generic events', () => {
  const sessionStartInput = JSON.stringify({
    session_id: 'sess_test',
    transcript_path: '/tmp/t.json',
    hook_event_name: 'SessionStart',
  });

  it('session-start sends generic event, no stdout', async () => {
    const eventMock = vi.fn().mockResolvedValue({ ok: true, recorded: false });
    const client = makeClient({ event: eventMock });
    const result = await runHookCommand(
      makeOptions({ command: 'session-start', inputJson: sessionStartInput, clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeNull();
    expect(eventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'session-start' }),
    );
  });

  it('user-prompt-submit with additionalContext → stdout contains hookSpecificOutput', async () => {
    const userPromptMock = vi.fn().mockResolvedValue({
      decision: 'allow',
      additionalContext: 'You have 2 active contracts.',
    });
    const client = makeClient({ userPromptSubmit: userPromptMock });
    const input = JSON.stringify({
      session_id: 'sess_test',
      transcript_path: '/tmp/t.json',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Hello',
    });
    const result = await runHookCommand(
      makeOptions({ command: 'user-prompt-submit', inputJson: input, clientFactory: () => client }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toBeNull();
    const out = parseStdout(result) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(out.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(out.hookSpecificOutput.additionalContext).toBe('You have 2 active contracts.');
  });
});

// ── CLI command routing ───────────────────────────────────────────────────────

describe('runHookCommand — command routing', () => {
  it('unknown command → exitCode 1, no stdout', async () => {
    const result = await runHookCommand(
      makeOptions({ command: 'not-a-real-command' }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBeNull();
    expect(result.stderr).toEqual(
      expect.arrayContaining([expect.stringContaining('Unknown event')]),
    );
  });

  it('all 14 SUPPORTED_HOOK_COMMANDS → exitCode 0 (not exitCode 1)', async () => {
    const commands = [
      'session-start', 'user-prompt-submit', 'pre-tool-use', 'permission-request',
      'post-tool-use', 'post-tool-use-failure', 'post-tool-batch', 'permission-denied',
      'subagent-start', 'subagent-stop', 'task-created', 'task-completed', 'stop', 'session-end',
    ] as const;

    for (const command of commands) {
      const inputMap: Record<string, object> = {
        'pre-tool-use': { session_id: 's', transcript_path: '/t', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} },
        'post-tool-use': { session_id: 's', transcript_path: '/t', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {}, tool_response: {} },
        'post-tool-use-failure': { session_id: 's', transcript_path: '/t', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: {}, tool_response: {} },
        'stop': { session_id: 's', transcript_path: '/t', hook_event_name: 'Stop', stop_hook_active: false },
      };
      const inputJson = JSON.stringify(
        inputMap[command] ?? { session_id: 's', transcript_path: '/t', hook_event_name: command },
      );

      // stop with stop_hook_active=false in warn mode will call backend
      const client = makeClient();
      const result = await runHookCommand(makeOptions({ command, inputJson, clientFactory: () => client }));
      expect(result.exitCode, `command '${command}' should exit 0`).toBe(0);
    }
  });
});
