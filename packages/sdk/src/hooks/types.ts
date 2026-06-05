// FILE MEMO: Claude Code hook payload types + Filepad backend request/response types.
// Claude Code hook spec: https://docs.anthropic.com/en/docs/claude-code/hooks
// Event names follow Claude Code's PascalCase. CLI commands use kebab-case.

import type { EnforcementMode } from './enforcement.js';

// ── Supported CLI command names (kebab-case) ──────────────────────────────────

export const SUPPORTED_HOOK_COMMANDS = [
  'session-start',
  'user-prompt-submit',
  'pre-tool-use',
  'permission-request',
  'post-tool-use',
  'post-tool-use-failure',
  'post-tool-batch',
  'permission-denied',
  'subagent-start',
  'subagent-stop',
  'task-created',
  'task-completed',
  'stop',
  'session-end',
] as const;

export type HookCommand = typeof SUPPORTED_HOOK_COMMANDS[number];

/** Map from kebab-case CLI command → Claude Code PascalCase event name */
export const HOOK_COMMAND_TO_EVENT: Record<HookCommand, string> = {
  'session-start': 'SessionStart',
  'user-prompt-submit': 'UserPromptSubmit',
  'pre-tool-use': 'PreToolUse',
  'permission-request': 'PermissionRequest',
  'post-tool-use': 'PostToolUse',
  'post-tool-use-failure': 'PostToolUseFailure',
  'post-tool-batch': 'PostToolBatch',
  'permission-denied': 'PermissionDenied',
  'subagent-start': 'SubagentStart',
  'subagent-stop': 'SubagentStop',
  'task-created': 'TaskCreated',
  'task-completed': 'TaskCompleted',
  'stop': 'Stop',
  'session-end': 'SessionEnd',
};

// ── Shared base ───────────────────────────────────────────────────────────────

type BaseInput = {
  session_id: string;
  transcript_path: string;
  hook_event_name: string;
};

// ── Claude Code hook input payloads ──────────────────────────────────────────

export type SessionStartInput = BaseInput & {
  hook_event_name: 'SessionStart';
};

export type UserPromptSubmitInput = BaseInput & {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
};

export type PreToolUseInput = BaseInput & {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
};

export type PermissionRequestInput = BaseInput & {
  hook_event_name: 'PermissionRequest';
  tool_name: string;
  tool_input: Record<string, unknown>;
};

export type PostToolUseInput = BaseInput & {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
};

export type PostToolUseFailureInput = BaseInput & {
  hook_event_name: 'PostToolUseFailure';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
};

export type PostToolBatchInput = BaseInput & {
  hook_event_name: 'PostToolBatch';
  tool_uses: Array<{
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_response: unknown;
  }>;
};

export type PermissionDeniedInput = BaseInput & {
  hook_event_name: 'PermissionDenied';
  tool_name: string;
  tool_input: Record<string, unknown>;
};

export type SubagentStartInput = BaseInput & {
  hook_event_name: 'SubagentStart';
  subagent_id?: string | undefined;
  subagent_type?: string | undefined;
};

export type SubagentStopInput = BaseInput & {
  hook_event_name: 'SubagentStop';
  subagent_id?: string | undefined;
  subagent_type?: string | undefined;
};

export type TaskCreatedInput = BaseInput & {
  hook_event_name: 'TaskCreated';
  task_id?: string | undefined;
  task_title?: string | undefined;
};

export type TaskCompletedInput = BaseInput & {
  hook_event_name: 'TaskCompleted';
  task_id?: string | undefined;
  task_title?: string | undefined;
};

export type StopInput = BaseInput & {
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
};

export type SessionEndInput = BaseInput & {
  hook_event_name: 'SessionEnd';
};

// ── Claude Code hook output payloads ─────────────────────────────────────────

/** PreToolUse structured decision output */
export type PreToolUseOutput = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'allow' | 'deny' | 'ask' | 'defer';
    permissionDecisionReason?: string | undefined;
  };
};

/** UserPromptSubmit — can inject additional context into agent's prompt */
export type UserPromptSubmitOutput = {
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit';
    additionalContext?: string | undefined;
  };
};

/** PermissionRequest — can allow/deny permission dialogs */
export type PermissionRequestOutput = {
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest';
    decision: {
      behavior: 'allow' | 'deny';
    };
  };
};

/** Stop — only emits output when blocking. Allow is implicit/no stdout. */
export type StopOutput = {
  decision: 'block';
  reason?: string | undefined;
};

// ── Filepad backend request types ─────────────────────────────────────────────

export type HookPreToolUseRequest = {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  enforcementMode: EnforcementMode;
};

export type HookStopRequest = {
  sessionId: string;
  stopHookActive: boolean;
  enforcementMode: EnforcementMode;
};

export type HookUserPromptSubmitRequest = {
  sessionId: string;
  prompt: string;
  enforcementMode: EnforcementMode;
};

/** Generic event request — used for all observe/record events */
export type HookEventRequest = {
  sessionId: string;
  eventName: string;
  payload: Record<string, unknown>;
  enforcementMode: EnforcementMode;
};

// ── Filepad backend response types ────────────────────────────────────────────

export type HookPreToolUseResponse = {
  decision: 'allow' | 'deny';
  reason?: string | undefined;
  enforcementMode: EnforcementMode;
};

export type HookStopResponse = {
  decision: 'allow' | 'block';
  reason?: string | undefined;
  failingContracts?: Array<{
    contractId: string;
    name: string;
    lifecycleStatus: string;
  }> | undefined;
};

export type HookUserPromptSubmitResponse = {
  decision: 'allow' | 'block';
  additionalContext?: string | undefined;
  reason?: string | undefined;
};

/** SessionStart — can inject additional context into the agent's first turn */
export type SessionStartOutput = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart';
    additionalContext: string;
  };
};

/** Generic event response — returned for all observe events */
export type HookEventResponse = {
  ok: true;
  recorded: boolean;
  warnings?: string[] | undefined;
  // Returned for session-start and any event that wants to inject context
  additionalContext?: string | null | undefined;
};
