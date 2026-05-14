// FILE MEMO: Pre-MCP Filepad pairing helpers shared by the CLI and tests.

import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type AgentRuntime =
  | 'openclaw'
  | 'claude-code'
  | 'cursor'
  | 'windsurf'
  | 'codex'
  | 'generic-mcp';

export type FilepadMcpServerConfig = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

export type AgentHostDesiredState = {
  version: 1;
  runtime: AgentRuntime;
  scope: 'project' | 'user';
  mcp: {
    enabled: boolean;
    configPath: string;
    configTarget: string;
  };
  hooks: {
    enabled: boolean;
    configPath: string;
    credentialsPath: string | null;
    adapterPackage: string | null;
    adapterVersion: string | null;
    adapterBinary: string | null;
    adapterCommand: string | null;
    enforcementMode: 'off' | 'observe' | 'warn' | 'block' | null;
    offlinePolicy: 'allow' | 'deny' | null;
    events: string[];
  };
};

export type PairResponse = {
  status: 'paired';
  workspace: { id: string; name: string; owner: string };
  credentials: {
    agentKeyId: string;
    agentSecret: string;
    expiresAt: string;
  };
  hostConfig: {
    runtime: AgentRuntime;
    configPath: string;
    server: FilepadMcpServerConfig;
    restartInstruction: string;
    requiresHostRestart?: boolean;
    nativeToolsAvailable?: boolean;
    afterRestartCommand?: string;
    desiredState?: AgentHostDesiredState | undefined;
  };
  handoff: {
    sessionToken: string;
    text: string;
    nextStep: {
      what: string;
      how: string;
      afterRestartCommand: string;
      requiresHostRestart?: boolean;
      nativeToolsAvailable?: boolean;
    };
  } & Record<string, unknown>;
};

export type PairOptions = {
  code: string;
  runtime: AgentRuntime;
  baseUrl: string;
  label?: string | undefined;
  configPath?: string | undefined;
  outputPath?: string | undefined;
  dryRun?: boolean | undefined;
  fetchImpl?: typeof fetch | undefined;
  /** Force Claude Code hook installation. Normally driven by backend desiredState. */
  installHooks?: boolean | undefined;
  /**
   * Command used in runtime hook config.
   * Defaults to the backend desiredState hook adapter command for the selected runtime.
   * Override with a local path for development, e.g. "node /path/to/adapter/dist/cli.js".
   */
  hookCommand?: string | undefined;
  /**
   * Enforcement mode written to hook credentials.
   * Defaults to 'block' when hooks are installed.
   * Use 'block' to actively deny dangerous/out-of-contract actions.
   */
  hookEnforcementMode?: 'off' | 'observe' | 'warn' | 'block' | undefined;
  /**
   * Offline policy: what to do when Filepad backend is unreachable.
   * Defaults to 'allow' (fail open). Use 'deny' with 'block' mode for strict enforcement.
   */
  hookOfflinePolicy?: 'allow' | 'deny' | undefined;
  /**
   * Test seam for host-native MCP registration. Production uses the runtime CLI
   * where required, e.g. `claude mcp add-json` for Claude Code.
   */
  mcpCommandRunner?: ((command: string, args: string[]) => Promise<void>) | undefined;
};

export type PairResult = {
  response: PairResponse;
  configPath: string;
  structuredOutputPath: string;
  wroteConfig: boolean;
  hooksInstalled: boolean;
  hooksCredentialsPath: string | null;
  hookEnforcementMode: 'off' | 'observe' | 'warn' | 'block' | null;
  hookOfflinePolicy: 'allow' | 'deny' | null;
  lifecycle: {
    paired: true;
    configWritten: boolean;
    configTarget: string;
    nativeToolsAvailable: boolean;
    requiresHostRestart: boolean;
    afterRestartTool: string;
    userMessage: string;
  };
};

export const SUPPORTED_RUNTIMES: readonly AgentRuntime[] = [
  'openclaw',
  'claude-code',
  'cursor',
  'windsurf',
  'codex',
  'generic-mcp',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function expandHome(path: string): string {
  if (path === '~') return process.env['HOME'] ?? path;
  if (path.startsWith('~/')) {
    const home = process.env['HOME'];
    return home ? join(home, path.slice(2)) : path;
  }
  return path;
}

function isFilepadHookCommand(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return (
    value.includes('filepad-claude-code-hook') ||
    value.includes('filepad-hook') ||
    value.includes('@filepad/agent-hooks') ||
    value.includes('@filepad/claude-code-hooks') ||
    value.includes('/packages/agent-hooks/') ||
    value.includes('\\packages\\agent-hooks\\')
  );
}

function hookCommandFromDesiredState(
  hooks: AgentHostDesiredState['hooks'] | undefined,
): string | null {
  if (!hooks?.enabled) return null;
  if (hooks.adapterCommand) return hooks.adapterCommand;
  if (!hooks.adapterPackage) return null;

  const packageSpecifier = hooks.adapterVersion
    ? `${hooks.adapterPackage}@${hooks.adapterVersion}`
    : hooks.adapterPackage;
  return `npx -y ${packageSpecifier}`;
}

function defaultConfigPath(runtime: AgentRuntime): string {
  const home = process.env['HOME'];
  const base = home ?? '.';
  switch (runtime) {
    case 'openclaw':
      return join(base, '.openclaw', 'openclaw.json');
    case 'claude-code':
      return join(base, '.claude', 'settings.json');
    case 'cursor':
      return join(base, '.cursor', 'mcp.json');
    case 'windsurf':
      return join(base, '.codeium', 'windsurf', 'mcp_config.json');
    case 'codex':
      return join(base, '.codex', 'mcp.json');
    case 'generic-mcp':
      return join(process.cwd(), 'mcp.json');
  }
}

function isClaudeCodeNativeMcpTarget(path: string): boolean {
  return path.startsWith('claude-code://');
}

function filesystemConfigPathForRuntime(
  runtime: AgentRuntime,
  configPath: string,
): string {
  if (runtime === 'claude-code' && isClaudeCodeNativeMcpTarget(configPath)) {
    return defaultConfigPath(runtime);
  }
  return configPath;
}

async function chmodIfExists(path: string, mode: number): Promise<void> {
  try {
    await chmod(path, mode);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return;
    throw error;
  }
}

async function hardenSensitiveConfigFile(path: string): Promise<void> {
  await chmodIfExists(path, 0o600);
}

async function hardenClaudeCodeConfigFiles(configPath: string): Promise<void> {
  await hardenSensitiveConfigFile(expandHome('~/.claude.json'));
  await hardenSensitiveConfigFile(
    filesystemConfigPathForRuntime('claude-code', configPath),
  );
}

async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  try {
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return {};
    throw error;
  }
}

function patchMcpConfig(
  runtime: AgentRuntime,
  existing: Record<string, unknown>,
  server: FilepadMcpServerConfig,
): Record<string, unknown> {
  if (runtime === 'openclaw') {
    const mcp = isRecord(existing['mcp']) ? existing['mcp'] : {};
    const servers = isRecord(mcp['servers']) ? mcp['servers'] : {};
    const updated = { ...existing };
    delete updated['mcpServers'];
    return {
      ...updated,
      mcp: {
        ...mcp,
        servers: {
          ...servers,
          filepad: server,
        },
      },
    };
  }

  const mcpServers = isRecord(existing['mcpServers'])
    ? existing['mcpServers']
    : {};
  return {
    ...existing,
    mcpServers: {
      ...mcpServers,
      filepad: server,
    },
  };
}

async function writeRuntimeConfig(params: {
  runtime: AgentRuntime;
  configPath: string;
  server: FilepadMcpServerConfig;
  mcpCommandRunner?: ((command: string, args: string[]) => Promise<void>) | undefined;
}): Promise<void> {
  if (params.runtime === 'claude-code') {
    try {
      const args = [
        'mcp', 'add-json', '-s', 'local', 'filepad', JSON.stringify(params.server),
      ];
      if (params.mcpCommandRunner) {
        // Test seam — use provided runner
        await params.mcpCommandRunner('claude', args);
      } else {
        await execFileAsync('claude', args);
      }
      await hardenClaudeCodeConfigFiles(params.configPath);
      return;
    } catch {
      // claude CLI unavailable/not in PATH, or native registration failed.
      // Fall through to direct JSON patch using a real filesystem path.
    }
  }

  const fileConfigPath = filesystemConfigPathForRuntime(
    params.runtime,
    params.configPath,
  );
  const existing = await readJsonFile(fileConfigPath);
  const updated = patchMcpConfig(params.runtime, existing, params.server);
  await mkdir(dirname(fileConfigPath), { recursive: true });
  await writeFile(fileConfigPath, `${JSON.stringify(updated, null, 2)}\n`, {
    mode: 0o600,
  });
  await hardenSensitiveConfigFile(fileConfigPath);
}

function runtimeConfigTarget(runtime: AgentRuntime): string {
  return runtime === 'openclaw'
    ? 'mcp.servers.filepad'
    : 'mcpServers.filepad';
}

function defaultHooksCredentialsPath(credentials: {
  workspaceId: string;
  keyId: string;
}): string {
  const home = process.env['HOME'] ?? '.';
  return join(
    home,
    '.config',
    'filepad',
    'connections',
    'claude-code',
    credentials.workspaceId,
    `${credentials.keyId}.json`,
  );
}

function stripFilepadHooks(settings: Record<string, unknown>): {
  settings: Record<string, unknown>;
  removedCount: number;
} {
  const hooks = isRecord(settings['hooks']) ? settings['hooks'] : null;
  if (!hooks) return { settings, removedCount: 0 };

  let removedCount = 0;
  const nextHooks: Record<string, unknown> = { ...hooks };
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const kept = entries.filter((entry) => {
      if (!isRecord(entry)) return true;
      const hookItems = Array.isArray(entry['hooks']) ? entry['hooks'] : [];
      const shouldRemove = hookItems.some((hook) =>
        isRecord(hook) && isFilepadHookCommand(hook['command']),
      );
      if (shouldRemove) removedCount += 1;
      return !shouldRemove;
    });
    if (kept.length > 0) nextHooks[event] = kept;
    else delete nextHooks[event];
  }

  if (removedCount === 0) return { settings, removedCount };
  const nextSettings = { ...settings };
  if (Object.keys(nextHooks).length > 0) nextSettings['hooks'] = nextHooks;
  else delete nextSettings['hooks'];
  return { settings: nextSettings, removedCount };
}

async function cleanupLegacyClaudeCodeGlobalHooks(
  activeConfigPath: string,
): Promise<void> {
  const legacyPath = expandHome('~/.claude/settings.json');
  if (legacyPath === activeConfigPath) return;
  const existing = await readJsonFile(legacyPath);
  const stripped = stripFilepadHooks(existing);
  if (stripped.removedCount === 0) return;
  await mkdir(dirname(legacyPath), { recursive: true });
  await writeFile(legacyPath, `${JSON.stringify(stripped.settings, null, 2)}\n`);
}

/**
 * Build the full Claude Code hooks config for Filepad enforcement.
 * Uses matcher "*" for tool events so Filepad sees every tool (not only Bash).
 * Covers all supported Claude Code hook events.
 */
function buildClaudeCodeHooksConfig(
  hookCmd: string,
  env: Record<string, string>,
): Record<string, unknown> {
  // Tool events — require a matcher. "*" covers all tool names including mcp__...
  const toolHookEntry = (event: string) => ({
    matcher: '*',
    hooks: [{ type: 'command', command: `${hookCmd} ${event}`, env }],
  });
  // Non-tool lifecycle events — no matcher field
  const lifecycleHookEntry = (event: string) => ({
    hooks: [{ type: 'command', command: `${hookCmd} ${event}`, env }],
  });

  return {
    // ── Decision/control hooks ────────────────────────────────────────────────
    PreToolUse:    [toolHookEntry('pre-tool-use')],
    Stop:          [lifecycleHookEntry('stop')],

    // ── Tool lifecycle hooks ──────────────────────────────────────────────────
    PostToolUse:        [toolHookEntry('post-tool-use')],
    PostToolUseFailure: [toolHookEntry('post-tool-use-failure')],
    PostToolBatch:      [toolHookEntry('post-tool-batch')],
    PermissionDenied:   [toolHookEntry('permission-denied')],

    // ── Session lifecycle hooks ───────────────────────────────────────────────
    SessionStart:   [lifecycleHookEntry('session-start')],
    UserPromptSubmit: [lifecycleHookEntry('user-prompt-submit')],
    SessionEnd:     [lifecycleHookEntry('session-end')],

    // ── Task lifecycle hooks ──────────────────────────────────────────────────
    TaskCreated:    [lifecycleHookEntry('task-created')],
    TaskCompleted:  [lifecycleHookEntry('task-completed')],

    // ── Subagent lifecycle hooks ──────────────────────────────────────────────
    SubagentStart:  [lifecycleHookEntry('subagent-start')],
    SubagentStop:   [lifecycleHookEntry('subagent-stop')],
  };
}

async function installClaudeCodeHooks(params: {
  configPath: string;
  hookCommand: string;
  enforcementMode: 'off' | 'observe' | 'warn' | 'block';
  offlinePolicy: 'allow' | 'deny';
  credentialsPath?: string | undefined;
  credentials: {
    baseUrl: string;
    workspaceId: string;
    keyId: string;
    secret: string;
  };
}): Promise<{ credentialsPath: string }> {
  const credentialsPath = expandHome(
    params.credentialsPath ?? defaultHooksCredentialsPath({
      workspaceId: params.credentials.workspaceId,
      keyId: params.credentials.keyId,
    }),
  );
  await mkdir(dirname(credentialsPath), { recursive: true });
  await writeFile(
    credentialsPath,
    `${JSON.stringify({
      ...params.credentials,
      enforcementMode: params.enforcementMode,
      offlinePolicy: params.offlinePolicy,
    }, null, 2)}\n`,
    { mode: 0o600 },
  );

  // Patch the configured Claude Code settings file to add hook commands.
  const existing = await readJsonFile(params.configPath);
  const existingHooks = isRecord(existing['hooks']) ? existing['hooks'] : {};
  const hookEnv = {
    FILEPAD_HOOK_ENFORCEMENT_MODE: params.enforcementMode,
    FILEPAD_HOOK_OFFLINE_POLICY: params.offlinePolicy,
    FILEPAD_HOOKS_CREDENTIALS_PATH: credentialsPath,
  };
  const newHooks = buildClaudeCodeHooksConfig(params.hookCommand, hookEnv);

  // Merge: filepad hooks take precedence; preserve any other runtime hooks
  const mergedHooks: Record<string, unknown> = { ...existingHooks };
  for (const [event, hookList] of Object.entries(newHooks)) {
    const existing_ = Array.isArray(mergedHooks[event]) ? (mergedHooks[event] as unknown[]) : [];
    // Remove any previous filepad hook entries for this event, then prepend new ones
    const filtered = existing_.filter((entry) => {
      if (!isRecord(entry)) return true;
      const hooks = Array.isArray(entry['hooks']) ? entry['hooks'] : [];
      return !hooks.some((h) =>
        isRecord(h) && isFilepadHookCommand(h['command']),
      );
    });
    mergedHooks[event] = [...(hookList as unknown[]), ...filtered];
  }

  const updated = { ...existing, hooks: mergedHooks };
  await mkdir(dirname(params.configPath), { recursive: true });
  await writeFile(params.configPath, `${JSON.stringify(updated, null, 2)}\n`);
  await cleanupLegacyClaudeCodeGlobalHooks(params.configPath);

  return { credentialsPath };
}

async function postPair(params: PairOptions): Promise<PairResponse> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const baseUrl = params.baseUrl.replace(/\/+$/g, '');
  const response = await fetchImpl(`${baseUrl}/agent-api/v1/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: params.code,
      runtime: params.runtime,
      ...(params.label ? { label: params.label } : {}),
    }),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`PAIR_FAILED HTTP ${response.status}: ${text}`);
  }
  if (!response.ok) {
    const err = isRecord(parsed) && isRecord(parsed['error'])
      ? parsed['error']
      : undefined;
    const code = typeof err?.['code'] === 'string' ? err['code'] : `HTTP_${response.status}`;
    const message = typeof err?.['message'] === 'string'
      ? err['message']
      : `Filepad pairing failed with HTTP ${response.status}`;
    // Surface ZodError details so agents can diagnose schema mismatches
    const detailStr = err?.['details']
      ? `\n  details: ${JSON.stringify(err['details'])}`
      : '';
    throw new Error(`${code}: ${message}${detailStr}`);
  }
  return parsed as PairResponse;
}

export async function pairAgent(options: PairOptions): Promise<PairResult> {
  const response = await postPair(options);
  const desiredState = response.hostConfig.desiredState;
  const configPath = expandHome(
    options.configPath ??
    desiredState?.mcp.configPath ??
    response.hostConfig.configPath ??
    defaultConfigPath(options.runtime),
  );
  const structuredOutputPath =
    options.outputPath ??
    join(tmpdir(), `filepad-agent-connect-${process.pid}.json`);
  const afterRestartTool =
    response.hostConfig.afterRestartCommand ??
    response.handoff.nextStep.afterRestartCommand ??
    'filepad_bootstrap';
  const requiresHostRestart =
    response.hostConfig.requiresHostRestart ??
    response.handoff.nextStep.requiresHostRestart ??
    true;
  const nativeToolsAvailable =
    response.hostConfig.nativeToolsAvailable ??
    response.handoff.nextStep.nativeToolsAvailable ??
    false;
  const configTarget = desiredState?.mcp.configTarget ?? runtimeConfigTarget(options.runtime);

  const result: PairResult = {
    response,
    configPath,
    structuredOutputPath,
    wroteConfig: false,
    hooksInstalled: false,
    hooksCredentialsPath: null,
    hookEnforcementMode: null,
    hookOfflinePolicy: null,
    lifecycle: {
      paired: true,
      configWritten: false,
      configTarget,
      nativeToolsAvailable,
      requiresHostRestart,
      afterRestartTool,
      userMessage:
        `Pairing succeeded. Filepad MCP is configured at ${configTarget}. Restart or reload this agent host so it can discover Filepad MCP tools, then call ${afterRestartTool}.`,
    },
  };
  await writeFile(structuredOutputPath, `${JSON.stringify(result, null, 2)}\n`);

  if (!options.dryRun) {
    await writeRuntimeConfig({
      runtime: options.runtime,
      configPath,
      server: response.hostConfig.server,
      mcpCommandRunner: options.mcpCommandRunner,
    });
    result.wroteConfig = true;
    result.lifecycle.configWritten = true;

    const hooksDesired = desiredState?.hooks.enabled === true;
    if ((options.installHooks || hooksDesired) && options.runtime === 'claude-code') {
      const hookCommand =
        options.hookCommand ?? hookCommandFromDesiredState(desiredState?.hooks);
      if (!hookCommand) {
        throw new Error(
          'HOOK_ADAPTER_MISSING: Claude Code hooks were requested, but Filepad did not provide a hook adapter command.',
        );
      }
      const mcpEnv = response.hostConfig.server.env;
      const hookCredentials = {
        baseUrl: mcpEnv['FILEPAD_BASE_URL'] ?? options.baseUrl,
        workspaceId: mcpEnv['FILEPAD_WORKSPACE_ID'] ?? response.workspace.id,
        keyId: mcpEnv['FILEPAD_AGENT_KEY_ID'] ?? response.credentials.agentKeyId,
        secret: mcpEnv['FILEPAD_AGENT_SECRET'] ?? response.credentials.agentSecret,
      };
      const hookResult = await installClaudeCodeHooks({
        configPath: expandHome(desiredState?.hooks.configPath ?? configPath),
        hookCommand,
        enforcementMode: options.hookEnforcementMode ?? desiredState?.hooks.enforcementMode ?? 'block',
        offlinePolicy: options.hookOfflinePolicy ?? desiredState?.hooks.offlinePolicy ?? 'allow',
        credentialsPath: desiredState?.hooks.credentialsPath ?? undefined,
        credentials: hookCredentials,
      });
      result.hooksInstalled = true;
      result.hooksCredentialsPath = hookResult.credentialsPath;
      result.hookEnforcementMode = options.hookEnforcementMode ?? desiredState?.hooks.enforcementMode ?? 'block';
      result.hookOfflinePolicy = options.hookOfflinePolicy ?? desiredState?.hooks.offlinePolicy ?? 'allow';
    }

    await writeFile(structuredOutputPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  return result;
}

export function renderPairResult(result: PairResult): string {
  const restartWord = result.lifecycle.requiresHostRestart
    ? 'needs a host restart/reload'
    : 'is ready after your host refreshes its MCP tools';
  const mcpConfigLine = result.response.hostConfig.runtime === 'claude-code'
    ? `MCP server ${result.wroteConfig ? 'registered' : 'prepared'}: ${result.lifecycle.configTarget}`
    : `MCP config ${result.wroteConfig ? 'written' : 'prepared'}: ${result.configPath}`;
  const baseUrl = result.response.hostConfig.server.env['FILEPAD_BASE_URL'];
  const workspaceId =
    result.response.hostConfig.server.env['FILEPAD_WORKSPACE_ID'] ??
    result.response.workspace.id;
  return [
    result.response.handoff.text,
    '',
    mcpConfigLine,
    `MCP config target: ${result.lifecycle.configTarget}`,
    ...(result.hooksInstalled
      ? [
          `Hooks installed: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PostToolBatch, PermissionDenied, SubagentStart, SubagentStop, TaskCreated, TaskCompleted, Stop, SessionEnd`,
          `Hook enforcement mode: ${result.hookEnforcementMode ?? 'block'}`,
          `Hook offline policy: ${result.hookOfflinePolicy ?? 'allow'}`,
          `Hook credentials: ${result.hooksCredentialsPath ?? 'stored'}`,
        ]
      : ['Hooks: not requested by backend desired host state for this runtime']),
    `Machine-readable result: ${result.structuredOutputPath}`,
    '',
    'Great, Filepad is connected.',
    `Expected state: paired=${result.lifecycle.paired}, configWritten=${result.lifecycle.configWritten}, nativeToolsAvailable=${result.lifecycle.nativeToolsAvailable}, requiresHostRestart=${result.lifecycle.requiresHostRestart}.`,
    `This is not a failure: the pairing worked, and this current agent session ${restartWord} before Filepad tools appear natively.`,
    `Next safe action: ${result.response.hostConfig.restartInstruction}`,
    `After the MCP reload, call ${result.lifecycle.afterRestartTool}.`,
    '',
    'Agent-facing checks:',
    baseUrl
      ? `  Health: ${baseUrl.replace(/\/+$/g, '')}/agent-api/v1/health`
      : '  Health: /agent-api/v1/health',
    baseUrl
      ? `  Discovery: ${baseUrl.replace(/\/+$/g, '')}/agent-api/v1/discovery`
      : '  Discovery: /agent-api/v1/discovery',
    baseUrl
      ? `  HTTP bootstrap fallback: ${baseUrl.replace(/\/+$/g, '')}/agent-api/v1/workspaces/${workspaceId}/bootstrap (HMAC auth, or Authorization: Bearer <handoff.sessionToken> during setup)`
      : `  HTTP bootstrap fallback: /agent-api/v1/workspaces/${workspaceId}/bootstrap (HMAC auth, or Authorization: Bearer <handoff.sessionToken> during setup)`,
    '  MCP CLI fallback: filepad-mcp-server --health | --bootstrap | --tools --with-schemas',
    '  Direct tool fallback: filepad-mcp-server --call filepad_list_tree --args \'{}\'',
    '',
    'Verify after restart/reload:',
    '  1. Confirm your host lists a Filepad MCP server.',
    `  2. Confirm native tools include ${result.lifecycle.afterRestartTool}.`,
    '  3. If native tools are missing, run the MCP CLI fallback commands above before debugging the runtime.',
  ].join('\n');
}
