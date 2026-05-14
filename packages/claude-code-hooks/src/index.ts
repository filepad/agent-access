// FILE MEMO: Public exports for @filepad/claude-code-hooks.

export { resolveCredentials, writeCredentialsFile } from './config.js';
export type { HookCredentials } from './config.js';
export { resolveEnforcementMode, resolveOfflinePolicy, offlineDenyReason } from './enforcement.js';
export type { EnforcementMode, OfflinePolicy } from './enforcement.js';
export { createHookClient } from './client.js';
export type { HookClient } from './client.js';
export { handlePreToolUse } from './handlers/pre-tool-use.js';
export { handlePostToolUse } from './handlers/post-tool-use.js';
export { handleStop } from './handlers/stop.js';
export { handleEvent } from './handlers/event.js';
export {
  SUPPORTED_HOOK_COMMANDS,
  HOOK_COMMAND_TO_EVENT,
} from './types.js';
export type {
  HookCommand,
  PreToolUseInput,
  PostToolUseInput,
  StopInput,
  UserPromptSubmitInput,
  SessionStartInput,
  SessionEndInput,
  PreToolUseOutput,
  StopOutput,
  UserPromptSubmitOutput,
  HookPreToolUseRequest,
  HookPreToolUseResponse,
  HookStopRequest,
  HookStopResponse,
  HookUserPromptSubmitRequest,
  HookUserPromptSubmitResponse,
  HookEventRequest,
  HookEventResponse,
} from './types.js';
export { validateOutput, classifyOutputKind } from './validator.js';
export { reportHookHealth } from './health.js';
export type { HealthContext } from './health.js';
export { runHookCommand, isHookCommand } from './run.js';
export type { RunResult, RunOptions } from './run.js';
