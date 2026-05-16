// FILE MEMO: Remote Filepad MCP pairing helpers shared by the CLI and tests.

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

export type FilepadRemoteMcpServerConfig = {
  transport: 'streamable_http' | 'sse';
  url: string;
  headers?: Record<string, string> | undefined;
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
    server: FilepadRemoteMcpServerConfig;
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
  server: FilepadRemoteMcpServerConfig,
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
  server: FilepadRemoteMcpServerConfig;
  scope?: 'project' | 'user' | undefined;
  mcpCommandRunner?: ((command: string, args: string[]) => Promise<void>) | undefined;
}): Promise<void> {
  if (params.runtime === 'claude-code') {
    try {
      const claudeScope = params.scope === 'project' ? 'local' : 'user';
      const args = [
        'mcp', 'add-json', '-s', claudeScope, 'filepad', JSON.stringify(params.server),
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
      scope: desiredState?.scope,
      mcpCommandRunner: options.mcpCommandRunner,
    });
    result.wroteConfig = true;
    result.lifecycle.configWritten = true;

    await writeFile(structuredOutputPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  return result;
}

export function renderPairResult(result: PairResult): string {
  const restartWord = result.lifecycle.requiresHostRestart
    ? 'needs a host restart/reload'
    : 'is ready after your host refreshes its MCP tools';
  const mcpConfigLine = result.response.hostConfig.runtime === 'claude-code'
    ? `Remote MCP server ${result.wroteConfig ? 'registered' : 'prepared'}: ${result.lifecycle.configTarget}`
    : `MCP config ${result.wroteConfig ? 'written' : 'prepared'}: ${result.configPath}`;
  const baseUrl = baseUrlFromRemoteUrl(result.response.hostConfig.server.url);
  const workspaceId = result.response.workspace.id;
  return [
    result.response.handoff.text,
    '',
    mcpConfigLine,
    `MCP config target: ${result.lifecycle.configTarget}`,
    'Contract verification hooks: not installed by agent-connect.',
    'Install Claude Code contract verification with @filepad/runtime-adapter-claude-code.',
    `Machine-readable result: ${result.structuredOutputPath}`,
    '',
    'Great, Filepad is connected.',
    `Expected state: paired=${result.lifecycle.paired}, configWritten=${result.lifecycle.configWritten}, nativeToolsAvailable=${result.lifecycle.nativeToolsAvailable}, requiresHostRestart=${result.lifecycle.requiresHostRestart}.`,
    `This is not a failure: the pairing worked, and this current agent session ${restartWord} before Filepad tools appear natively.`,
    `Next safe action: ${result.response.hostConfig.restartInstruction}`,
    `After the MCP reload, call ${result.lifecycle.afterRestartTool}.`,
    `Remote MCP URL: ${result.response.hostConfig.server.url}`,
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
    `  Remote MCP transport: ${result.response.hostConfig.server.transport}`,
    `  Remote MCP endpoint: ${result.response.hostConfig.server.url}`,
    '',
    'Verify after restart/reload:',
    '  1. Confirm your host lists a Filepad MCP server.',
    `  2. Confirm native tools include ${result.lifecycle.afterRestartTool}.`,
    '  3. If native tools are missing, verify your host supports remote streamable HTTP MCP and that the bearer token has not expired.',
  ].join('\n');
}

function baseUrlFromRemoteUrl(remoteUrl: string): string | undefined {
  try {
    return new URL(remoteUrl).origin;
  } catch {
    return undefined;
  }
}
