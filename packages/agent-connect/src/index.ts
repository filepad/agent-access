// FILE MEMO: OAuth-backed remote Filepad MCP setup helpers shared by the CLI and tests.

import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { execFile, spawn } from 'node:child_process';
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
  transport: 'streamable_http';
  url: string;
  headers: Record<string, string>;
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
    enabled: false;
    configPath: string | null;
    credentialsPath: string | null;
    adapterPackage: string | null;
    adapterVersion: string | null;
    adapterBinary: string | null;
    adapterCommand: string | null;
    enforcementMode: null;
    offlinePolicy: null;
    events: string[];
  };
};

export type ConnectResponse = {
  status: 'connected';
  hostConfig: {
    runtime: AgentRuntime;
    configPath: string;
    server: FilepadRemoteMcpServerConfig;
    restartInstruction: string;
    requiresHostRestart: boolean;
    nativeToolsAvailable: boolean;
    afterRestartCommand: string;
    desiredState: AgentHostDesiredState;
  };
  handoff: {
    text: string;
    nextStep: {
      what: string;
      how: string;
      afterRestartCommand: string;
      requiresHostRestart: boolean;
      nativeToolsAvailable: boolean;
    };
  };
  oauth: {
    tokenType: 'Bearer';
    expiresIn: number;
    scope: string;
    resource: string;
  };
};

export type ConnectOptions = {
  runtime: AgentRuntime;
  baseUrl: string;
  label?: string | undefined;
  configPath?: string | undefined;
  outputPath?: string | undefined;
  dryRun?: boolean | undefined;
  redirectUri?: string | undefined;
  scopes?: string[] | undefined;
  fetchImpl?: typeof fetch | undefined;
  authorizationCodeProvider?: ((params: { authorizationUrl: string; state: string; redirectUri: string }) => Promise<string>) | undefined;
  onAuthorizeUrl?: ((authorizationUrl: string) => void) | undefined;
  openBrowser?: ((authorizationUrl: string) => Promise<void> | void) | undefined;
  mcpCommandRunner?: ((command: string, args: string[]) => Promise<void>) | undefined;
};

export type ConnectResult = {
  response: ConnectResponse;
  configPath: string;
  structuredOutputPath: string;
  wroteConfig: boolean;
  hooksInstalled: boolean;
  hooksCredentialsPath: string | null;
  hookEnforcementMode: null;
  hookOfflinePolicy: null;
  lifecycle: {
    connected: true;
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

const DEFAULT_SCOPES = [
  'env:read',
  'artifacts:read',
  'artifacts:write',
  'artifacts:direct_write',
  'files:propose',
  'memory:read',
  'events.write',
  'signals:write',
  'notifications:read',
  'actions:read',
  'actions:invoke',
  'a2a:invoke',
  'a2a:register',
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

function filesystemConfigPathForRuntime(runtime: AgentRuntime, configPath: string): string {
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
  await hardenSensitiveConfigFile(filesystemConfigPathForRuntime('claude-code', configPath));
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

  const mcpServers = isRecord(existing['mcpServers']) ? existing['mcpServers'] : {};
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
      const args = ['mcp', 'add-json', '-s', claudeScope, 'filepad', JSON.stringify(params.server)];
      if (params.mcpCommandRunner) {
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

  const fileConfigPath = filesystemConfigPathForRuntime(params.runtime, params.configPath);
  const existing = await readJsonFile(fileConfigPath);
  const updated = patchMcpConfig(params.runtime, existing, params.server);
  await mkdir(dirname(fileConfigPath), { recursive: true });
  await writeFile(fileConfigPath, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
  await hardenSensitiveConfigFile(fileConfigPath);
}

function runtimeConfigTarget(runtime: AgentRuntime): string {
  return runtime === 'openclaw' ? 'mcp.servers.filepad' : 'mcpServers.filepad';
}

function runtimeScope(runtime: AgentRuntime): 'project' | 'user' {
  return runtime === 'claude-code' ? 'project' : 'user';
}

function canonicalMcpUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/g, '')}/mcp`;
}

function assertCanonicalRemoteMcpServer(server: FilepadRemoteMcpServerConfig): void {
  if (server.transport !== 'streamable_http') {
    throw new Error('MCP_REMOTE_TRANSPORT_UNSUPPORTED: Filepad remote MCP requires streamable_http');
  }
  const url = new URL(server.url);
  const pathname = url.pathname.replace(/\/+$/g, '') || '/';
  if (pathname !== '/mcp') {
    throw new Error('MCP_REMOTE_URL_NOT_CANONICAL: Filepad remote MCP must use ' + url.origin + '/mcp, got ' + server.url);
  }
}

function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function makePkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier, 'ascii').digest());
  return { verifier, challenge };
}

async function jsonFetch<T>(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`HTTP_${response.status}: ${text}`);
  }
  if (!response.ok) {
    const err = isRecord(parsed) && isRecord(parsed['error']) ? parsed['error'] : parsed;
    const code = isRecord(err) && typeof err['code'] === 'string'
      ? err['code']
      : isRecord(err) && typeof err['error'] === 'string'
        ? err['error']
        : `HTTP_${response.status}`;
    const message = isRecord(err) && typeof err['message'] === 'string'
      ? err['message']
      : isRecord(err) && typeof err['error_description'] === 'string'
        ? err['error_description']
        : response.statusText;
    throw new Error(`${code}: ${message}`);
  }
  return parsed as T;
}

async function registerOAuthClient(params: {
  baseUrl: string;
  redirectUri: string;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const response = await jsonFetch<{ client_id?: unknown }>(params.fetchImpl, `${params.baseUrl}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [params.redirectUri] }),
  });
  if (typeof response.client_id !== 'string' || response.client_id.length === 0) {
    throw new Error('OAUTH_REGISTRATION_INVALID: missing client_id');
  }
  return response.client_id;
}

async function exchangeAuthorizationCode(params: {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  fetchImpl: typeof fetch;
}): Promise<{ accessToken: string; expiresIn: number; scope: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
  });
  const response = await jsonFetch<{
    access_token?: unknown;
    token_type?: unknown;
    expires_in?: unknown;
    scope?: unknown;
  }>(params.fetchImpl, `${params.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (response.token_type !== 'Bearer') {
    throw new Error('OAUTH_TOKEN_INVALID: token_type must be Bearer');
  }
  if (typeof response.access_token !== 'string' || response.access_token.length === 0) {
    throw new Error('OAUTH_TOKEN_INVALID: missing access_token');
  }
  return {
    accessToken: response.access_token,
    expiresIn: typeof response.expires_in === 'number' ? response.expires_in : 0,
    scope: typeof response.scope === 'string' ? response.scope : '',
  };
}

function defaultRestartInstruction(runtime: AgentRuntime): string {
  if (runtime === 'claude-code') return 'Reload Claude Code MCP servers.';
  return 'Restart or reload this agent host so it discovers the Filepad MCP server.';
}

function buildResponse(params: {
  runtime: AgentRuntime;
  baseUrl: string;
  configPath: string;
  token: string;
  expiresIn: number;
  scope: string;
}): ConnectResponse {
  const server: FilepadRemoteMcpServerConfig = {
    transport: 'streamable_http',
    url: canonicalMcpUrl(params.baseUrl),
    headers: { Authorization: `Bearer ${params.token}` },
  };
  assertCanonicalRemoteMcpServer(server);
  const desiredState: AgentHostDesiredState = {
    version: 1,
    runtime: params.runtime,
    scope: runtimeScope(params.runtime),
    mcp: {
      enabled: true,
      configPath: params.configPath,
      configTarget: runtimeConfigTarget(params.runtime),
    },
    hooks: {
      enabled: false,
      configPath: null,
      credentialsPath: null,
      adapterPackage: null,
      adapterVersion: null,
      adapterBinary: null,
      adapterCommand: null,
      enforcementMode: null,
      offlinePolicy: null,
      events: [],
    },
  };
  return {
    status: 'connected',
    hostConfig: {
      runtime: params.runtime,
      configPath: params.configPath,
      server,
      restartInstruction: defaultRestartInstruction(params.runtime),
      requiresHostRestart: true,
      nativeToolsAvailable: false,
      afterRestartCommand: 'filepad_bootstrap',
      desiredState,
    },
    handoff: {
      text: 'Connected Filepad remote MCP. Reload the agent host, then call filepad_bootstrap for workspace details.',
      nextStep: {
        what: 'Reload MCP',
        how: defaultRestartInstruction(params.runtime),
        afterRestartCommand: 'filepad_bootstrap',
        requiresHostRestart: true,
        nativeToolsAvailable: false,
      },
    },
    oauth: {
      tokenType: 'Bearer',
      expiresIn: params.expiresIn,
      scope: params.scope,
      resource: canonicalMcpUrl(params.baseUrl),
    },
  };
}

function openBrowserDefault(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.unref();
}

async function createLoopbackCodeProvider(): Promise<{
  redirectUri: string;
  waitForCode(params: { authorizationUrl: string; state: string }): Promise<string>;
  close(): Promise<void>;
}> {
  let server: Server | null = null;
  let resolveCode: ((code: string) => void) | null = null;
  let rejectCode: ((error: Error) => void) | null = null;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!code) throw new Error(url.searchParams.get('error_description') ?? 'OAuth callback did not include code');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>Filepad connected</title><p>Filepad connected. You can return to your terminal.</p>');
      resolveCode?.(`${code}\n${state ?? ''}`);
    } catch (error) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error instanceof Error ? error.message : 'OAuth callback failed');
      rejectCode?.(error instanceof Error ? error : new Error(String(error)));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('OAUTH_LOOPBACK_LISTEN_FAILED');
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;

  return {
    redirectUri,
    async waitForCode({ authorizationUrl, state }) {
      openBrowserDefault(authorizationUrl);
      const raw = await codePromise;
      const [code, returnedState] = raw.split('\n', 2);
      if (returnedState !== state) throw new Error('OAUTH_STATE_MISMATCH');
      return code ?? '';
    },
    async close() {
      if (!server) return;
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    },
  };
}

export async function connectAgent(options: ConnectOptions): Promise<ConnectResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/g, '');
  const configPath = expandHome(options.configPath ?? defaultConfigPath(options.runtime));
  const structuredOutputPath = options.outputPath ?? join(tmpdir(), `filepad-agent-connect-${process.pid}.json`);
  const loopback = options.authorizationCodeProvider || options.redirectUri
    ? null
    : await createLoopbackCodeProvider();
  const redirectUri = options.redirectUri ?? loopback?.redirectUri;
  if (!redirectUri) throw new Error('OAUTH_REDIRECT_URI_REQUIRED');

  try {
    const clientId = await registerOAuthClient({ baseUrl, redirectUri, fetchImpl });
    const pkce = makePkce();
    const state = base64Url(randomBytes(18));
    const scope = (options.scopes ?? DEFAULT_SCOPES).join(' ');
    const authorizationUrl = new URL(`${baseUrl}/oauth/authorize`);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('code_challenge', pkce.challenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('scope', scope);
    authorizationUrl.searchParams.set('resource', canonicalMcpUrl(baseUrl));

    options.onAuthorizeUrl?.(authorizationUrl.toString());
    if (options.openBrowser) await options.openBrowser(authorizationUrl.toString());

    const code = options.authorizationCodeProvider
      ? await options.authorizationCodeProvider({ authorizationUrl: authorizationUrl.toString(), state, redirectUri })
      : await loopback!.waitForCode({ authorizationUrl: authorizationUrl.toString(), state });

    const token = await exchangeAuthorizationCode({
      baseUrl,
      clientId,
      redirectUri,
      code,
      codeVerifier: pkce.verifier,
      fetchImpl,
    });
    const response = buildResponse({
      runtime: options.runtime,
      baseUrl,
      configPath,
      token: token.accessToken,
      expiresIn: token.expiresIn,
      scope: token.scope,
    });

    const result: ConnectResult = {
      response,
      configPath,
      structuredOutputPath,
      wroteConfig: false,
      hooksInstalled: false,
      hooksCredentialsPath: null,
      hookEnforcementMode: null,
      hookOfflinePolicy: null,
      lifecycle: {
        connected: true,
        configWritten: false,
        configTarget: response.hostConfig.desiredState.mcp.configTarget,
        nativeToolsAvailable: response.hostConfig.nativeToolsAvailable,
        requiresHostRestart: response.hostConfig.requiresHostRestart,
        afterRestartTool: response.hostConfig.afterRestartCommand,
        userMessage:
          `Filepad MCP OAuth succeeded. Filepad MCP is configured at ${response.hostConfig.desiredState.mcp.configTarget}. Reload this agent host, then call ${response.hostConfig.afterRestartCommand}.`,
      },
    };
    await writeFile(structuredOutputPath, `${JSON.stringify(result, null, 2)}\n`);

    if (!options.dryRun) {
      await writeRuntimeConfig({
        runtime: options.runtime,
        configPath,
        server: response.hostConfig.server,
        scope: response.hostConfig.desiredState.scope,
        mcpCommandRunner: options.mcpCommandRunner,
      });
      result.wroteConfig = true;
      result.lifecycle.configWritten = true;
      await writeFile(structuredOutputPath, `${JSON.stringify(result, null, 2)}\n`);
    }

    return result;
  } finally {
    await loopback?.close();
  }
}

export function renderConnectResult(result: ConnectResult): string {
  const restartWord = result.lifecycle.requiresHostRestart
    ? 'needs a host restart/reload'
    : 'is ready after your host refreshes its MCP tools';
  const mcpConfigLine = result.response.hostConfig.runtime === 'claude-code'
    ? `Remote MCP server ${result.wroteConfig ? 'registered' : 'prepared'}: ${result.lifecycle.configTarget}`
    : `MCP config ${result.wroteConfig ? 'written' : 'prepared'}: ${result.configPath}`;
  const baseUrl = new URL(result.response.hostConfig.server.url).origin;
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
    `Expected state: connected=${result.lifecycle.connected}, configWritten=${result.lifecycle.configWritten}, nativeToolsAvailable=${result.lifecycle.nativeToolsAvailable}, requiresHostRestart=${result.lifecycle.requiresHostRestart}.`,
    `This is not a failure: OAuth and MCP config succeeded, and this current agent session ${restartWord} before Filepad tools appear natively.`,
    `Next safe action: ${result.response.hostConfig.restartInstruction}`,
    `After the MCP reload, call ${result.lifecycle.afterRestartTool}.`,
    `Remote MCP URL: ${result.response.hostConfig.server.url}`,
    '',
    'Agent-facing checks:',
    `  Health: ${baseUrl}/agent-api/v1/health`,
    `  Discovery: ${baseUrl}/agent-api/v1/discovery`,
    `  OAuth protected resource: ${baseUrl}/.well-known/oauth-protected-resource/mcp`,
    `  Remote MCP transport: ${result.response.hostConfig.server.transport}`,
    `  Remote MCP endpoint: ${result.response.hostConfig.server.url}`,
    '',
    'Verify after restart/reload:',
    '  1. Confirm your host lists a Filepad MCP server.',
    `  2. Confirm native tools include ${result.lifecycle.afterRestartTool}.`,
    '  3. If native tools are missing, verify your host supports remote streamable HTTP MCP and that the bearer token has not expired.',
  ].join('\n');
}
