import type { HookCredentials } from './config.js';
import type { HookClient } from './client.js';
import { offlineDenyReason, type EnforcementMode, type OfflinePolicy } from './enforcement.js';
import { handlePreToolUse } from './handlers/pre-tool-use.js';
import { handleStop } from './handlers/stop.js';
import { handlePostToolUse } from './handlers/post-tool-use.js';
import { handleEvent } from './handlers/event.js';
import { handleSessionStart } from './handlers/session-start.js';
import { spawnGuardianForSession, stopGuardianForSession } from './guardian-spawn.js';
import { reportHookHealth, type HealthContext } from './health.js';
import {
  SUPPORTED_HOOK_COMMANDS,
  HOOK_COMMAND_TO_EVENT,
  type HookCommand,
  type PreToolUseInput,
  type PostToolUseInput,
  type StopInput,
  type SessionStartInput,
} from './types.js';

export type RunResult = {
  stdout: string | null;
  stderr: string[];
  exitCode: 0 | 1;
};

export type RunOptions = {
  command: string;
  inputJson: string;
  mode: EnforcementMode;
  offlinePolicy: OfflinePolicy;
  resolveCredentials: () => Promise<HookCredentials>;
  clientFactory: (creds: HookCredentials) => HookClient;
  reportHealth?: ((params: { client: HookClient; credentials: HookCredentials; ctx: HealthContext }) => Promise<void>) | undefined;
};

export function isHookCommand(s: string): s is HookCommand {
  return (SUPPORTED_HOOK_COMMANDS as readonly string[]).includes(s);
}

function preToolUseAllow(reason?: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      ...(reason ? { permissionDecisionReason: reason } : {}),
    },
  });
}

function preToolUseDeny(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

function stopBlock(reason: string): string {
  return JSON.stringify({ decision: 'block', reason });
}

function extractSessionId(input: unknown): string {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return typeof (input as Record<string,unknown>)['session_id'] === 'string'
      ? (input as Record<string,unknown>)['session_id'] as string
      : 'unknown';
  }
  return 'unknown';
}

export async function runHookCommand(options: RunOptions): Promise<RunResult> {
  const { command, inputJson, mode, offlinePolicy, resolveCredentials, clientFactory, reportHealth } = options;

  const eventName = HOOK_COMMAND_TO_EVENT[command as HookCommand] ?? command;

  async function emitHealth(overrides: Partial<HealthContext> & { sessionId: string }): Promise<void> {
    if (!reportHealth) return;
    const ctx: HealthContext = {
      command,
      eventName,
      mode,
      offlinePolicy,
      credentialsLoaded: false,
      backendReachable: false,
      inputParsed: false,
      stdout: null,
      blockedOrDenied: false,
      ...overrides,
    };
    try {
      let credentials: HookCredentials;
      try { credentials = await resolveCredentials(); } catch { return; }
      const client = clientFactory(credentials);
      await reportHealth({ client, credentials, ctx });
    } catch { /* best-effort */ }
  }

  if (!isHookCommand(command)) {
    return { stdout: null, stderr: [`Unknown event: ${command}`], exitCode: 1 };
  }

  let input: unknown;
  let inputParsed = true;
  let inputParseError: string | undefined;
  try {
    input = inputJson.trim() ? JSON.parse(inputJson) : {};
  } catch {
    inputParsed = false;
    inputParseError = `invalid JSON on stdin`;
    input = {};
  }

  const sessionId = extractSessionId(input);

  if (!inputParsed) {
    const stdout = command === 'pre-tool-use' ? preToolUseAllow() : null;
    emitHealth({ sessionId, inputParsed: false, inputParseError, stdout });
    return { stdout, stderr: [inputParseError!], exitCode: 0 };
  }

  if (mode === 'off') {
    const stdout = command === 'pre-tool-use' ? preToolUseAllow() : null;
    emitHealth({ sessionId, inputParsed: true, stdout });
    return { stdout, stderr: [], exitCode: 0 };
  }

  let credentials: HookCredentials;
  try {
    credentials = await resolveCredentials();
  } catch (err) {
    const stderr = [`credentials unavailable — ${String(err)}`];
    let stdout: string | null = null;
    let blockedOrDenied = false;
    if (command === 'pre-tool-use') {
      const shouldDeny = mode === 'block' && offlinePolicy === 'deny';
      blockedOrDenied = shouldDeny;
      stdout = shouldDeny ? preToolUseDeny(offlineDenyReason(true)) : preToolUseAllow(offlineDenyReason(false));
    }
    if (command === 'stop' && mode === 'block' && offlinePolicy === 'deny') {
      stdout = stopBlock('Filepad backend unreachable. Contract status cannot be verified.');
    }
    emitHealth({
      sessionId, inputParsed: true, credentialsLoaded: false, stdout, blockedOrDenied,
      failureReason: String(err),
    });
    return { stdout, stderr, exitCode: 0 };
  }

  const client = clientFactory(credentials);

  try {
    if (command === 'pre-tool-use') {
      const { output } = await handlePreToolUse(input as PreToolUseInput, client, mode);
      const stdout = JSON.stringify(output);
      const recOut = output as Record<string, unknown>;
      const hso = recOut['hookSpecificOutput'];
      const allowed = hso && typeof hso === 'object'
        ? (hso as Record<string, unknown>)['permissionDecision'] === 'allow'
        : false;
      emitHealth({
        sessionId, inputParsed: true, credentialsLoaded: true, backendReachable: true,
        stdout, backendDecision: 'called', blockedOrDenied: !allowed,
      });
      return { stdout, stderr: [], exitCode: 0 };
    }

    if (command === 'stop') {
      const { output } = await handleStop(input as StopInput, client, mode);
      const stdout = output ? JSON.stringify(output) : null;
      const blocked = output ? (output as Record<string,unknown>)['decision'] === 'block' : false;
      emitHealth({
        sessionId, inputParsed: true, credentialsLoaded: true, backendReachable: true,
        stdout, backendDecision: 'called', blockedOrDenied: blocked,
      });
      return { stdout, stderr: [], exitCode: 0 };
    }

    if (command === 'post-tool-use') {
      await handlePostToolUse(input as PostToolUseInput, client, mode);
      emitHealth({
        sessionId, inputParsed: true, credentialsLoaded: true, backendReachable: true,
        stdout: null, backendDecision: 'called',
      });
      return { stdout: null, stderr: [], exitCode: 0 };
    }

    if (command === 'session-start') {
      const { output } = await handleSessionStart(input as SessionStartInput, client, mode);
      const stdout = output ? JSON.stringify(output) : null;
      emitHealth({
        sessionId, inputParsed: true, credentialsLoaded: true, backendReachable: true,
        stdout, backendDecision: 'called',
      });
      // Spawn guardian in background — fail silently if not available
      void spawnGuardianForSession(sessionId, credentials);
      return { stdout, stderr: [], exitCode: 0 };
    }

    if (command === 'session-end') {
      // Stop guardian spawned for this session
      await stopGuardianForSession(sessionId);
      const inputRecord = input && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>) : {};
      const { output } = await handleEvent(command, inputRecord, client, mode);
      emitHealth({
        sessionId, inputParsed: true, credentialsLoaded: true, backendReachable: true,
        stdout: output ? JSON.stringify(output) : null, backendDecision: 'called',
      });
      return { stdout: output ? JSON.stringify(output) : null, stderr: [], exitCode: 0 };
    }

    const inputRecord = input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>) : {};
    const { output } = await handleEvent(command, inputRecord, client, mode);
    emitHealth({
      sessionId, inputParsed: true, credentialsLoaded: true, backendReachable: true,
      stdout: output ? JSON.stringify(output) : null, backendDecision: 'called',
    });
    return { stdout: output ? JSON.stringify(output) : null, stderr: [], exitCode: 0 };
  } catch (err) {
    const stderr = [`${command}: backend error — ${String(err)}`];
    let stdout: string | null = null;
    let blockedOrDenied = false;
    if (command === 'pre-tool-use') {
      const shouldDeny = mode === 'block' && offlinePolicy === 'deny';
      blockedOrDenied = shouldDeny;
      stdout = shouldDeny ? preToolUseDeny(offlineDenyReason(true)) : preToolUseAllow(offlineDenyReason(false));
    }
    if (command === 'stop' && mode === 'block' && offlinePolicy === 'deny') {
      stdout = stopBlock('Filepad backend error. Contract status cannot be verified.');
    }
    emitHealth({
      sessionId, inputParsed: true, credentialsLoaded: true, backendReachable: false,
      stdout, blockedOrDenied, failureReason: String(err),
    });
    return { stdout, stderr, exitCode: 0 };
  }
}
