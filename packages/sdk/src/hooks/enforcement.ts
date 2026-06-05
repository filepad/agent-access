// FILE MEMO: Enforcement mode resolution for Filepad agent hooks.
// EnforcementMode determines whether hooks observe, warn, or actively block.
// OfflinePolicy determines what happens when Filepad backend is unreachable.
//
// Config resolution order: env vars → credentials file → default.
// All defaults actively enforce contracts unless explicitly relaxed.

export type EnforcementMode = 'off' | 'observe' | 'warn' | 'block';
export type OfflinePolicy = 'allow' | 'deny';

const VALID_MODES: ReadonlySet<string> = new Set(['off', 'observe', 'warn', 'block']);
const VALID_OFFLINE_POLICIES: ReadonlySet<string> = new Set(['allow', 'deny']);

/**
 * Resolve enforcement mode.
 * Sources: FILEPAD_HOOK_ENFORCEMENT_MODE env var → default 'block'.
 */
export function resolveEnforcementMode(
  overrideEnv?: Record<string, string | undefined>,
): EnforcementMode {
  const env = overrideEnv ?? process.env;
  const raw = env['FILEPAD_HOOK_ENFORCEMENT_MODE'];
  if (raw && VALID_MODES.has(raw)) return raw as EnforcementMode;
  return 'block';
}

/**
 * Resolve offline policy.
 * Sources: FILEPAD_HOOK_OFFLINE_POLICY env var → default 'allow'.
 * In 'block' enforcement mode with 'deny' offline policy,
 * Filepad will block tools when it cannot reach the backend.
 */
export function resolveOfflinePolicy(
  overrideEnv?: Record<string, string | undefined>,
): OfflinePolicy {
  const env = overrideEnv ?? process.env;
  const raw = env['FILEPAD_HOOK_OFFLINE_POLICY'];
  if (raw && VALID_OFFLINE_POLICIES.has(raw)) return raw as OfflinePolicy;
  return 'allow';
}

/**
 * Build the offline deny output for PreToolUse.
 * Used when enforcement mode is 'block' and offline policy is 'deny'.
 */
export function offlineDenyReason(isBlock: boolean): string {
  if (isBlock) {
    return 'Filepad backend unreachable. Enforcement mode is block + offline deny. Tool execution blocked until Filepad reconnects.';
  }
  return 'Filepad backend unreachable — failing open because enforcement is not in block mode.';
}
