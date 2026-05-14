// FILE MEMO: Hook health telemetry reporter.
// Captures invocation metadata alongside hook execution.
// Recording failures must not affect hook behavior — telemetry is best-effort.

import type { HookClient } from './client.js';
import type { HookCredentials } from './config.js';
import type { EnforcementMode, OfflinePolicy } from './enforcement.js';
import { validateOutput, classifyOutputKind, extractEmittedDecision, extractEmittedHookEventName } from './validator.js';

export type HealthContext = {
  command: string;
  eventName: string;
  sessionId: string;
  mode: EnforcementMode;
  offlinePolicy: OfflinePolicy;
  credentialsLoaded: boolean;
  backendReachable: boolean;
  inputParsed: boolean;
  inputParseError?: string | undefined;
  backendDecision?: string | undefined;
  stdout: string | null;
  blockedOrDenied: boolean;
  failureReason?: string | undefined;
  workspaceId?: string | undefined;
  keyId?: string | undefined;
};

function deriveFinalResult(ctx: HealthContext): 'healthy' | 'degraded' | 'failed' {
  if (!ctx.credentialsLoaded) return 'failed';
  if (!ctx.backendReachable) {
    if (ctx.mode === 'block' && ctx.offlinePolicy === 'deny') return 'degraded';
    return 'degraded';
  }
  if (!ctx.inputParsed) {
    if (ctx.mode === 'off') return 'healthy';
    return 'degraded';
  }
  const validation = validateOutput(ctx.command, ctx.stdout);
  if (!validation.valid && ctx.command === 'stop') {
    // Stop with invalid output (e.g. { decision: "allow" }) is a spec violation
    return 'degraded';
  }
  if (!validation.valid && ctx.command === 'pre-tool-use') {
    return 'degraded';
  }
  return 'healthy';
}

export async function reportHookHealth(params: {
  client: HookClient;
  credentials: HookCredentials;
  ctx: HealthContext;
}): Promise<void> {
  const { client, credentials, ctx } = params;

  const validation = validateOutput(ctx.command, ctx.stdout);
  const outputKind = classifyOutputKind(ctx.command, ctx.stdout);

  try {
    await client.recordInvocation({
      workspaceId: credentials.workspaceId,
      keyId: credentials.keyId,
      runtime: 'claude-code',
      adapter: 'filepad-claude-code-hook',
      eventName: ctx.eventName,
      commandName: ctx.command,
      sessionId: ctx.sessionId,
      transcriptPathPresent: false,
      enforcementMode: ctx.mode,
      offlinePolicy: ctx.offlinePolicy,
      credentialsLoaded: ctx.credentialsLoaded,
      backendReachable: ctx.backendReachable,
      inputParsed: ctx.inputParsed,
      inputParseError: ctx.inputParseError,
      backendDecision: ctx.backendDecision,
      emittedOutputKind: outputKind,
      emittedDecision: extractEmittedDecision(ctx.stdout),
      emittedHookEventName: extractEmittedHookEventName(ctx.stdout),
      outputSchemaValid: validation.valid ? true : false,
      outputSchemaError: validation.valid ? undefined : validation.error,
      blockedOrDenied: ctx.blockedOrDenied,
      finalResult: deriveFinalResult(ctx),
      failureReason: ctx.failureReason,
      startedAt: undefined,
      finishedAt: undefined,
    });
  } catch {
    // Telemetry failure must not affect hook behavior.
    // Best-effort only.
  }
}
