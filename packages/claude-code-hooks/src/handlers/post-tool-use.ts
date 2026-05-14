// FILE MEMO: PostToolUse hook handler.
// Records tool use as an ACTIVITY EVENT — not as passing check evidence.
// Evidence for contract checks must come from Guardian or explicit MCP tool calls
// that map a command result to a specific checkId.
// PostToolUse is non-blocking regardless of enforcement mode.

import type { HookClient } from '../client.js';
import type { PostToolUseInput } from '../types.js';
import type { EnforcementMode } from '../enforcement.js';

export async function handlePostToolUse(
  input: PostToolUseInput,
  client: HookClient,
  mode: EnforcementMode,
): Promise<{ exitCode: 0 }> {
  if (mode === 'off') {
    return { exitCode: 0 };
  }

  await client.event({
    sessionId: input.session_id,
    eventName: 'post-tool-use',
    payload: {
      toolName: input.tool_name,
      toolInput: input.tool_input,
      // Do not include full tool_response to avoid bloating the event payload.
      toolResponseSummary: summariseToolResponse(input.tool_name, input.tool_response),
    },
    enforcementMode: mode,
  });

  return { exitCode: 0 };
}

function summariseToolResponse(toolName: string, response: unknown): string {
  if (typeof response === 'string') {
    return response.slice(0, 200);
  }
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    // Bash tool response structure
    if (toolName === 'Bash') {
      const output = typeof r['output'] === 'string' ? r['output'].slice(0, 200) : '';
      const error = typeof r['error'] === 'string' ? r['error'].slice(0, 100) : '';
      return error ? `[stderr] ${error}` : output;
    }
    // File tool responses (Edit, Write) — just note the path if present
    const path = typeof r['path'] === 'string' ? r['path'] : undefined;
    return path ? `edited: ${path}` : '[response]';
  }
  return '[no response]';
}
