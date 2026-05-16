import { readJsonFile } from './files.js';

export const CLAUDE_CODE_HOOK_EVENTS = [
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'PermissionDenied',
  'SessionStart',
  'UserPromptSubmit',
  'SessionEnd',
  'TaskCreated',
  'TaskCompleted',
  'SubagentStart',
  'SubagentStop',
  'Stop',
] as const;

const EVENT_COMMANDS: Record<typeof CLAUDE_CODE_HOOK_EVENTS[number], string> = {
  PreToolUse: 'pre-tool-use',
  PermissionRequest: 'permission-request',
  PostToolUse: 'post-tool-use',
  PostToolUseFailure: 'post-tool-use-failure',
  PostToolBatch: 'post-tool-batch',
  PermissionDenied: 'permission-denied',
  SessionStart: 'session-start',
  UserPromptSubmit: 'user-prompt-submit',
  SessionEnd: 'session-end',
  TaskCreated: 'task-created',
  TaskCompleted: 'task-completed',
  SubagentStart: 'subagent-start',
  SubagentStop: 'subagent-stop',
  Stop: 'stop',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isFilepadHookCommand(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return (
    value.includes('filepad-claude-code-hook') ||
    value.includes('@filepad/claude-code-hooks') ||
    value.includes('filepad-hook') ||
    value.includes('@filepad/agent-hooks') ||
    value.includes('/packages/agent-hooks/') ||
    value.includes('\\packages\\agent-hooks\\')
  );
}

function toolHookEntry(command: string, eventCommand: string, env: Record<string, string>) {
  return {
    matcher: '*',
    hooks: [{ type: 'command', command: `${command} ${eventCommand}`, env }],
  };
}

function lifecycleHookEntry(command: string, eventCommand: string, env: Record<string, string>) {
  return {
    hooks: [{ type: 'command', command: `${command} ${eventCommand}`, env }],
  };
}

export function buildClaudeCodeHooksConfig(
  command: string,
  env: Record<string, string>,
): Record<string, unknown[]> {
  const config: Record<string, unknown[]> = {};
  for (const event of CLAUDE_CODE_HOOK_EVENTS) {
    const eventCommand = EVENT_COMMANDS[event];
    config[event] = event === 'PreToolUse' ||
      event === 'PermissionRequest' ||
      event === 'PostToolUse' ||
      event === 'PostToolUseFailure' ||
      event === 'PostToolBatch' ||
      event === 'PermissionDenied'
      ? [toolHookEntry(command, eventCommand, env)]
      : [lifecycleHookEntry(command, eventCommand, env)];
  }
  return config;
}

export async function mergeClaudeCodeHooks(params: {
  settingsPath: string;
  hookCommand: string;
  env: Record<string, string>;
}): Promise<Record<string, unknown>> {
  const existing = await readJsonFile(params.settingsPath);
  const existingHooks = isRecord(existing['hooks']) ? existing['hooks'] : {};
  const filepadHooks = buildClaudeCodeHooksConfig(params.hookCommand, params.env);
  const mergedHooks: Record<string, unknown> = { ...existingHooks };

  for (const [event, hookList] of Object.entries(filepadHooks)) {
    const current = Array.isArray(mergedHooks[event]) ? mergedHooks[event] : [];
    const filtered = current.filter((entry) => {
      if (!isRecord(entry)) return true;
      const hooks = Array.isArray(entry['hooks']) ? entry['hooks'] : [];
      return !hooks.some((hook) => isRecord(hook) && isFilepadHookCommand(hook['command']));
    });
    mergedHooks[event] = [...hookList, ...filtered];
  }

  return { ...existing, hooks: mergedHooks };
}

export async function hasExpectedFilepadHooks(
  settingsPath: string,
  credentialsPath: string,
): Promise<boolean> {
  const settings = await readJsonFile(settingsPath);
  const hooks = isRecord(settings['hooks']) ? settings['hooks'] : {};
  for (const event of CLAUDE_CODE_HOOK_EVENTS) {
    const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
    const hasEvent = entries.some((entry) => {
      if (!isRecord(entry)) return false;
      const items = Array.isArray(entry['hooks']) ? entry['hooks'] : [];
      return items.some((hook) => {
        if (!isRecord(hook)) return false;
        const env = isRecord(hook['env']) ? hook['env'] : {};
        return isFilepadHookCommand(hook['command']) &&
          env['FILEPAD_HOOKS_CREDENTIALS_PATH'] === credentialsPath;
      });
    });
    if (!hasEvent) return false;
  }
  return true;
}
