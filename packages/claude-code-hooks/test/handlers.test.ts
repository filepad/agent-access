// TEST CATEGORY: unit
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handlePreToolUse } from '../src/handlers/pre-tool-use.js';
import { handleStop } from '../src/handlers/stop.js';
import { handlePostToolUse } from '../src/handlers/post-tool-use.js';
import type { HookClient } from '../src/client.js';
import type { PreToolUseInput, StopInput, PostToolUseInput } from '../src/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePreToolUseInput(overrides: Partial<PreToolUseInput> = {}): PreToolUseInput {
  return {
    session_id: 'sess_test',
    transcript_path: '/tmp/t.json',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'echo hello' },
    ...overrides,
  };
}

function makeStopInput(overrides: Partial<StopInput> = {}): StopInput {
  return {
    session_id: 'sess_test',
    transcript_path: '/tmp/t.json',
    hook_event_name: 'Stop',
    stop_hook_active: false,
    ...overrides,
  };
}

function makePostToolUseInput(overrides: Partial<PostToolUseInput> = {}): PostToolUseInput {
  return {
    session_id: 'sess_test',
    transcript_path: '/tmp/t.json',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'pnpm typecheck' },
    tool_response: { output: 'ok', error: '' },
    ...overrides,
  };
}

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

// ── PreToolUse tests ──────────────────────────────────────────────────────────

describe('handlePreToolUse', () => {
  it('maps backend allow → permissionDecision allow', async () => {
    const client = makeClient({
      preToolUse: vi.fn().mockResolvedValue({ decision: 'allow', enforcementMode: 'block' }),
    });
    const { output } = await handlePreToolUse(makePreToolUseInput(), client, 'block');
    expect(output.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('maps backend deny → permissionDecision deny in block mode', async () => {
    const client = makeClient({
      preToolUse: vi.fn().mockResolvedValue({
        decision: 'deny',
        reason: 'Dangerous command',
        enforcementMode: 'block',
      }),
    });
    const { output } = await handlePreToolUse(makePreToolUseInput(), client, 'block');
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toBe('Dangerous command');
  });

  it('allows in warn mode even when backend says deny', async () => {
    const client = makeClient({
      preToolUse: vi.fn().mockResolvedValue({
        decision: 'deny',
        reason: 'Contract failed',
        enforcementMode: 'warn',
      }),
    });
    const { output } = await handlePreToolUse(makePreToolUseInput(), client, 'warn');
    expect(output.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('[FILEPAD WARN]');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('Contract failed');
  });

  it('allows in observe mode even when backend says deny', async () => {
    const client = makeClient({
      preToolUse: vi.fn().mockResolvedValue({
        decision: 'deny',
        reason: 'Blocked',
        enforcementMode: 'observe',
      }),
    });
    const { output } = await handlePreToolUse(makePreToolUseInput(), client, 'observe');
    expect(output.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('[FILEPAD OBSERVE]');
  });

  it('always allows in off mode without calling backend... wait, off is handled in CLI', async () => {
    // In off mode the CLI short-circuits before calling the handler.
    // Verify the handler itself still works if called (it will call backend).
    const client = makeClient();
    const { output } = await handlePreToolUse(makePreToolUseInput(), client, 'off');
    expect(output.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('passes enforcementMode to backend request', async () => {
    const preToolUseMock = vi.fn().mockResolvedValue({ decision: 'allow', enforcementMode: 'block' });
    const client = makeClient({ preToolUse: preToolUseMock });
    await handlePreToolUse(makePreToolUseInput(), client, 'block');
    expect(preToolUseMock).toHaveBeenCalledWith(
      expect.objectContaining({ enforcementMode: 'block' }),
    );
  });
});

// ── Stop tests ────────────────────────────────────────────────────────────────

describe('handleStop', () => {
  it('returns no output when backend says allow', async () => {
    const client = makeClient({
      stop: vi.fn().mockResolvedValue({ decision: 'allow' }),
    });
    const { output } = await handleStop(makeStopInput(), client, 'block');
    expect(output).toBeNull();
  });

  it('returns block when backend says block in block mode', async () => {
    const client = makeClient({
      stop: vi.fn().mockResolvedValue({
        decision: 'block',
        reason: 'Contract "A" has unverified checks',
      }),
    });
    const { output } = await handleStop(makeStopInput(), client, 'block');
    if (!output) throw new Error('expected Stop block output');
    expect(output.decision).toBe('block');
    expect(output.reason).toBe('Contract "A" has unverified checks');
  });

  it('allows silently in warn mode even when backend says block', async () => {
    const client = makeClient({
      stop: vi.fn().mockResolvedValue({ decision: 'block', reason: 'Unverified checks' }),
    });
    const { output } = await handleStop(makeStopInput(), client, 'warn');
    expect(output).toBeNull();
  });

  it('skips backend call when stop_hook_active is true', async () => {
    const stopMock = vi.fn();
    const client = makeClient({ stop: stopMock });
    const { output } = await handleStop(makeStopInput({ stop_hook_active: true }), client, 'block');
    expect(output).toBeNull();
    expect(stopMock).not.toHaveBeenCalled();
  });

  it('allows in off mode without backend call', async () => {
    const stopMock = vi.fn();
    const client = makeClient({ stop: stopMock });
    const { output } = await handleStop(makeStopInput(), client, 'off');
    expect(output).toBeNull();
    expect(stopMock).not.toHaveBeenCalled();
  });
});

// ── PostToolUse tests ─────────────────────────────────────────────────────────

describe('handlePostToolUse', () => {
  it('calls event endpoint (not preToolUse or stop)', async () => {
    const eventMock = vi.fn().mockResolvedValue({ ok: true, recorded: false });
    const preToolUseMock = vi.fn();
    const stopMock = vi.fn();
    const client = makeClient({ event: eventMock, preToolUse: preToolUseMock, stop: stopMock });
    await handlePostToolUse(makePostToolUseInput(), client, 'warn');
    expect(eventMock).toHaveBeenCalled();
    expect(preToolUseMock).not.toHaveBeenCalled();
    expect(stopMock).not.toHaveBeenCalled();
  });

  it('sends eventName=post-tool-use', async () => {
    const eventMock = vi.fn().mockResolvedValue({ ok: true, recorded: false });
    const client = makeClient({ event: eventMock });
    await handlePostToolUse(makePostToolUseInput(), client, 'warn');
    expect(eventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'post-tool-use' }),
    );
  });

  it('does not record contract evidence (no preToolUse call)', async () => {
    const preToolUseMock = vi.fn();
    const client = makeClient({ preToolUse: preToolUseMock });
    await handlePostToolUse(makePostToolUseInput(), client, 'block');
    expect(preToolUseMock).not.toHaveBeenCalled();
  });

  it('skips all network calls in off mode', async () => {
    const eventMock = vi.fn();
    const client = makeClient({ event: eventMock });
    await handlePostToolUse(makePostToolUseInput(), client, 'off');
    expect(eventMock).not.toHaveBeenCalled();
  });
});

// ── CLI input safety ──────────────────────────────────────────────────────────

describe('PreToolUse output is always valid JSON', () => {
  it('output has hookSpecificOutput.hookEventName=PreToolUse', async () => {
    const client = makeClient();
    const { output } = await handlePreToolUse(makePreToolUseInput(), client, 'warn');
    expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    // Must be serialisable without throwing
    expect(() => JSON.stringify(output)).not.toThrow();
  });
});
