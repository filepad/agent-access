// FILE MEMO: Generic event handler for all observe/lifecycle hook events.
// Sends the event to the Filepad backend and returns any additionalContext.
// Events: session-start, user-prompt-submit, permission-request,
//         post-tool-use-failure, post-tool-batch, permission-denied,
//         subagent-start, subagent-stop, task-created, task-completed, session-end.
//
// user-prompt-submit specifically may return additionalContext from the backend
// which is injected into the agent's prompt as a Filepad contract reminder.

import type { HookClient } from '../client.js';
import type { UserPromptSubmitOutput } from '../types.js';
import type { EnforcementMode } from '../enforcement.js';

export async function handleEvent(
  eventName: string,
  input: Record<string, unknown>,
  client: HookClient,
  mode: EnforcementMode,
): Promise<{ output?: UserPromptSubmitOutput | undefined; exitCode: 0 }> {
  if (mode === 'off') {
    return { exitCode: 0 };
  }

  const sessionId = typeof input['session_id'] === 'string' ? input['session_id'] : 'unknown';

  if (eventName === 'user-prompt-submit') {
    const prompt = typeof input['prompt'] === 'string' ? input['prompt'] : '';
    const result = await client.userPromptSubmit({ sessionId, prompt, enforcementMode: mode });
    if (result.additionalContext) {
      return {
        output: {
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: result.additionalContext,
          },
        },
        exitCode: 0,
      };
    }
    return { exitCode: 0 };
  }

  // All other events: send as generic event, no output needed.
  await client.event({
    sessionId,
    eventName,
    payload: sanitisePayload(input),
    enforcementMode: mode,
  });

  return { exitCode: 0 };
}

/** Strip fields that are too large or sensitive from the event payload. */
function sanitisePayload(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const SKIP = new Set(['transcript_path']); // never send transcript path
  for (const [k, v] of Object.entries(input)) {
    if (SKIP.has(k)) continue;
    if (k === 'prompt' && typeof v === 'string') {
      // Truncate prompt — never send full user content to events endpoint
      out[k] = v.slice(0, 500);
      continue;
    }
    out[k] = v;
  }
  return out;
}
