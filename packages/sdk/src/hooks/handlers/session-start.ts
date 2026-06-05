// FILE MEMO: SessionStart hook handler.
// Fires at the beginning of every Claude Code session.
// Injects current contract status into the agent's context before the first turn.

import type { HookClient } from '../client.js';
import type { EnforcementMode } from '../enforcement.js';
import type { SessionStartInput, SessionStartOutput } from '../types.js';

export async function handleSessionStart(
  input: SessionStartInput,
  client: HookClient,
  mode: EnforcementMode,
): Promise<{ output: SessionStartOutput | null; exitCode: 0 }> {
  if (mode === 'off') {
    return { output: null, exitCode: 0 };
  }

  const sessionId = input.session_id ?? 'unknown';

  try {
    const result = await client.event({
      sessionId,
      eventName: 'session-start',
      payload: {},
      enforcementMode: mode,
    });

    if (result.additionalContext) {
      return {
        output: {
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: result.additionalContext,
          },
        },
        exitCode: 0,
      };
    }
  } catch {
    // Session start must never block the agent — fail open.
  }

  return { output: null, exitCode: 0 };
}
