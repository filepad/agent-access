// FILE MEMO: Claude Code hook output shape validator.
// Validates that emitted stdout JSON matches Claude Code hook output contracts.
// Used by the hook self-reporting telemetry to record outputSchemaValid.

import type { PreToolUseOutput, StopOutput, UserPromptSubmitOutput } from './types.js';

export type ValidationResult = { valid: true } | { valid: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

export function validatePreToolUseOutput(json: unknown): ValidationResult {
  if (!isRecord(json)) return { valid: false, error: 'output is not a JSON object' };
  const h = json['hookSpecificOutput'];
  if (!isRecord(h)) return { valid: false, error: 'missing hookSpecificOutput' };
  if (h['hookEventName'] !== 'PreToolUse') return { valid: false, error: 'hookEventName must be PreToolUse' };
  const decision = h['permissionDecision'];
  if (decision !== 'allow' && decision !== 'deny' && decision !== 'ask' && decision !== 'defer') {
    return { valid: false, error: `invalid permissionDecision: ${String(decision)}` };
  }
  return { valid: true };
}

export function validateStopOutput(json: unknown): ValidationResult {
  if (!isRecord(json)) return { valid: false, error: 'output is not a JSON object' };
  const decision = json['decision'];
  if (decision !== 'block') return { valid: false, error: `Stop output must have decision "block", got "${String(decision)}". Allow must be silent (no stdout).` };
  if ('reason' in json && typeof json['reason'] !== 'string') return { valid: false, error: 'reason must be a string' };
  return { valid: true };
}

export function validateUserPromptSubmitOutput(json: unknown): ValidationResult {
  if (!isRecord(json)) return { valid: false, error: 'output is not a JSON object' };
  const h = json['hookSpecificOutput'];
  if (!isRecord(h)) return { valid: false, error: 'missing hookSpecificOutput' };
  if (h['hookEventName'] !== 'UserPromptSubmit') return { valid: false, error: 'hookEventName must be UserPromptSubmit' };
  return { valid: true };
}

export function validateOutput(command: string, stdout: string | null): ValidationResult {
  if (stdout === null) return { valid: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { valid: false, error: `stdout is not valid JSON: ${stdout.slice(0, 100)}` };
  }

  switch (command) {
    case 'pre-tool-use':
      return validatePreToolUseOutput(parsed);
    case 'stop':
      return validateStopOutput(parsed);
    case 'user-prompt-submit':
      return validateUserPromptSubmitOutput(parsed);
    default:
      return { valid: true };
  }
}

export function classifyOutputKind(command: string, stdout: string | null): string {
  if (stdout === null) return 'none';

  let parsed: unknown;
  try { parsed = JSON.parse(stdout); } catch { return 'unknown'; }

  if (!isRecord(parsed)) return 'unknown';

  const h = parsed['hookSpecificOutput'];
  if (isRecord(h) && h['hookEventName'] === 'PreToolUse') return 'pre_tool_use_permission';
  if (isRecord(h) && h['hookEventName'] === 'UserPromptSubmit') return 'user_prompt_context';

  if (parsed['decision'] === 'block') return 'stop_block';

  return 'unknown';
}

export function extractEmittedDecision(stdout: string | null): string | undefined {
  if (stdout === null) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(stdout); } catch { return undefined; }
  if (!isRecord(parsed)) return undefined;

  const h = parsed['hookSpecificOutput'];
  if (isRecord(h) && typeof h['permissionDecision'] === 'string') return h['permissionDecision'];
  if (typeof parsed['decision'] === 'string') return parsed['decision'];

  return undefined;
}

export function extractEmittedHookEventName(stdout: string | null): string | undefined {
  if (stdout === null) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(stdout); } catch { return undefined; }
  if (!isRecord(parsed)) return undefined;
  const h = parsed['hookSpecificOutput'];
  if (isRecord(h) && typeof h['hookEventName'] === 'string') return h['hookEventName'];
  return undefined;
}
