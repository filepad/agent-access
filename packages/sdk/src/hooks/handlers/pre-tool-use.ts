// FILE MEMO: PreToolUse hook handler.
// Reads Claude Code PreToolUse input, calls Filepad backend, enforces based on mode.
// Enforcement modes:
//   off/observe: always allow (record only)
//   warn: allow but include reason in permissionDecisionReason
//   block: deny when backend says deny

import type { HookClient } from '../client.js';
import type { PreToolUseInput, PreToolUseOutput } from '../types.js';
import type { EnforcementMode } from '../enforcement.js';

export async function handlePreToolUse(
  input: PreToolUseInput,
  client: HookClient,
  mode: EnforcementMode,
): Promise<{ output: PreToolUseOutput; exitCode: 0 }> {
  const result = await client.preToolUse({
    sessionId: input.session_id,
    toolName: input.tool_name,
    toolInput: input.tool_input,
    enforcementMode: mode,
  });

  // In off/observe: never block, even if backend says deny
  if (mode === 'off' || mode === 'observe') {
    return {
      output: {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          ...(result.decision === 'deny' && result.reason
            ? { permissionDecisionReason: `[FILEPAD OBSERVE] ${result.reason}` }
            : {}),
        },
      },
      exitCode: 0,
    };
  }

  // In warn: allow but surface the reason so agent sees the warning
  if (mode === 'warn') {
    const reason = result.decision === 'deny' && result.reason
      ? `[FILEPAD WARN] ${result.reason}`
      : undefined;
    return {
      output: {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          ...(reason ? { permissionDecisionReason: reason } : {}),
        },
      },
      exitCode: 0,
    };
  }

  // In block: enforce the backend decision
  return {
    output: {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: result.decision,
        ...(result.reason ? { permissionDecisionReason: result.reason } : {}),
      },
    },
    exitCode: 0,
  };
}
