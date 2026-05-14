// FILE MEMO: Stop hook handler.
// Gates agent completion. Blocks if active contracts have failing/unverified checks,
// respecting enforcement mode. stop_hook_active guard prevents infinite loops.

import type { HookClient } from '../client.js';
import type { StopInput, StopOutput } from '../types.js';
import type { EnforcementMode } from '../enforcement.js';

export async function handleStop(
  input: StopInput,
  client: HookClient,
  mode: EnforcementMode,
): Promise<{ output: StopOutput | null; exitCode: 0 }> {
  // Infinite-loop guard: allow silently if stop hook has already fired this turn.
  if (input.stop_hook_active) {
    return { output: null, exitCode: 0 };
  }

  // In off mode: never block completion; allow is implicit/no stdout.
  if (mode === 'off') {
    return { output: null, exitCode: 0 };
  }

  const result = await client.stop({
    sessionId: input.session_id,
    stopHookActive: input.stop_hook_active,
    enforcementMode: mode,
  });

  // observe/warn: never block completion. Stop has no top-level "allow" decision.
  if (mode === 'observe' || mode === 'warn') {
    return { output: null, exitCode: 0 };
  }

  // block mode: enforce.
  if (result.decision === 'allow') {
    return { output: null, exitCode: 0 };
  }

  return {
    output: {
      decision: 'block',
      ...(result.reason ? { reason: result.reason } : {}),
    },
    exitCode: 0,
  };
}
