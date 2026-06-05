import { join, resolve } from 'node:path';

import { CLAUDE_CODE_HOOK_EVENTS, mergeClaudeCodeHooks } from './claude-settings.js';
import { expandHome, looksLikeGitRepo, resolveFrom, writeJsonFile } from './files.js';
import type {
  InstallFromPairingCodeOptions,
  InstallOptions,
  InstallResult,
  RuntimeManifest,
} from './types.js';

const DEFAULT_HOOKS_VERSION = '0.1.3';
const DEFAULT_GUARDIAN_VERSION = '0.1.1';

export function defaultSettingsPath(repoRoot: string): string {
  return join(repoRoot, '.claude', 'settings.local.json');
}

export function manifestPath(repoRoot: string): string {
  return join(repoRoot, '.filepad', 'runtime', 'claude-code.json');
}

export function defaultCredentialsPath(params: {
  workspaceId: string;
  agentKeyId: string;
}): string {
  const home = process.env['HOME'] ?? '.';
  return join(
    home,
    '.config',
    'filepad',
    'connections',
    'claude-code',
    params.workspaceId,
    `${params.agentKeyId}.json`,
  );
}

function validateInstallOptions(options: InstallOptions): void {
  const missing: string[] = [];
  if (!options.baseUrl) missing.push('baseUrl');
  if (!options.workspaceId) missing.push('workspaceId');
  if (!options.agentKeyId) missing.push('agentKeyId');
  if (!options.agentSecret) missing.push('agentSecret');
  if (!options.contractId) missing.push('contractId');
  if (missing.length > 0) {
    throw new Error(`Missing required install options: ${missing.join(', ')}`);
  }
  if (!looksLikeGitRepo(options.repoRoot)) {
    throw new Error(
      `Refusing to install Claude Code contract verification outside an explicit git repo: ${options.repoRoot}`,
    );
  }
}

export function createManifest(params: {
  options: InstallOptions;
  settingsPath: string;
  credentialsPath: string;
  hookCommand: string;
  guardianCommand: string;
}): RuntimeManifest {
  return {
    schemaVersion: 1,
    runtime: 'claude-code',
    contractId: params.options.contractId,
    repoRoot: params.options.repoRoot,
    settingsPath: params.settingsPath,
    credentialsPath: params.credentialsPath,
    hookCommand: params.hookCommand,
    guardianCommand: params.guardianCommand,
    enforcementMode: params.options.enforcementMode,
    offlinePolicy: params.options.offlinePolicy,
    packages: {
      hooks: `@filepad/claude-code-hooks@${params.options.hookPackageVersion}`,
      guardian: `@filepad/guardian@${params.options.guardianPackageVersion}`,
    },
    installedAt: (params.options.now ?? new Date()).toISOString(),
  };
}

export async function installClaudeCodeRuntime(options: InstallOptions): Promise<InstallResult> {
  const normalizedOptions = {
    ...options,
    repoRoot: resolve(options.repoRoot),
    hookPackageVersion: options.hookPackageVersion || DEFAULT_HOOKS_VERSION,
    guardianPackageVersion: options.guardianPackageVersion || DEFAULT_GUARDIAN_VERSION,
  };
  validateInstallOptions(normalizedOptions);

  const settingsPath = options.settingsPath
    ? resolveFrom(normalizedOptions.repoRoot, options.settingsPath)
    : defaultSettingsPath(normalizedOptions.repoRoot);
  const credentialsPath = expandHome(
    options.credentialsPath ??
      defaultCredentialsPath({
        workspaceId: normalizedOptions.workspaceId,
        agentKeyId: normalizedOptions.agentKeyId,
      }),
  );
  const hookCommand = `npx -y @filepad/claude-code-hooks@${normalizedOptions.hookPackageVersion}`;
  const guardianCommand = `npx -y @filepad/guardian@${normalizedOptions.guardianPackageVersion}`;

  await writeJsonFile(
    credentialsPath,
    {
      baseUrl: normalizedOptions.baseUrl.replace(/\/+$/g, ''),
      workspaceId: normalizedOptions.workspaceId,
      keyId: normalizedOptions.agentKeyId,
      secret: normalizedOptions.agentSecret,
      activeContractId: normalizedOptions.contractId,
      enforcementMode: normalizedOptions.enforcementMode,
      offlinePolicy: normalizedOptions.offlinePolicy,
    },
    0o600,
  );

  const settings = await mergeClaudeCodeHooks({
    settingsPath,
    hookCommand,
    env: {
      FILEPAD_HOOK_ENFORCEMENT_MODE: normalizedOptions.enforcementMode,
      FILEPAD_HOOK_OFFLINE_POLICY: normalizedOptions.offlinePolicy,
      FILEPAD_HOOKS_CREDENTIALS_PATH: credentialsPath,
      FILEPAD_GUARDIAN_CREDENTIALS_PATH: credentialsPath,
      FILEPAD_ACTIVE_CONTRACT_ID: normalizedOptions.contractId,
    },
  });
  await writeJsonFile(settingsPath, settings);

  const manifest = createManifest({
    options: normalizedOptions,
    settingsPath,
    credentialsPath,
    hookCommand,
    guardianCommand,
  });
  const targetManifestPath = manifestPath(normalizedOptions.repoRoot);
  await writeJsonFile(targetManifestPath, manifest);

  return {
    manifestPath: targetManifestPath,
    settingsPath,
    credentialsPath,
    hookEvents: [...CLAUDE_CODE_HOOK_EVENTS],
    guardianCommand,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function exchangePairingCode(params: {
  baseUrl: string;
  pairCode: string;
  label?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}): Promise<{
  workspaceId: string;
  agentKeyId: string;
  agentSecret: string;
}> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const baseUrl = params.baseUrl.replace(/\/+$/g, '');
  const response = await fetchImpl(`${baseUrl}/agent-api/v1/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: params.pairCode,
      runtime: 'claude-code',
      ...(params.label ? { label: params.label } : {}),
    }),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Pairing failed with HTTP ${response.status}: ${text}`);
  }
  if (!response.ok) {
    const err = isRecord(parsed) && isRecord(parsed['error']) ? parsed['error'] : undefined;
    const code = typeof err?.['code'] === 'string' ? err['code'] : `HTTP_${response.status}`;
    const message = typeof err?.['message'] === 'string'
      ? err['message']
      : `Filepad pairing failed with HTTP ${response.status}`;
    throw new Error(`${code}: ${message}`);
  }
  if (!isRecord(parsed) || !isRecord(parsed['workspace']) || !isRecord(parsed['credentials'])) {
    throw new Error('Pairing response missing workspace or credentials');
  }
  const workspaceId = parsed['workspace']['id'];
  const agentKeyId = parsed['credentials']['agentKeyId'];
  const agentSecret = parsed['credentials']['agentSecret'];
  if (
    typeof workspaceId !== 'string' ||
    typeof agentKeyId !== 'string' ||
    typeof agentSecret !== 'string'
  ) {
    throw new Error('Pairing response contains invalid Claude Code runtime credentials');
  }
  return { workspaceId, agentKeyId, agentSecret };
}

export async function installClaudeCodeRuntimeFromPairingCode(
  options: InstallFromPairingCodeOptions,
): Promise<InstallResult> {
  if (!options.pairCode) throw new Error('Missing pairCode');
  const credentials = await exchangePairingCode({
    baseUrl: options.baseUrl,
    pairCode: options.pairCode,
    label: options.label,
    fetchImpl: options.fetchImpl,
  });
  return installClaudeCodeRuntime({
    ...options,
    workspaceId: credentials.workspaceId,
    agentKeyId: credentials.agentKeyId,
    agentSecret: credentials.agentSecret,
  });
}

export function defaultInstallOptions(input: {
  baseUrl: string;
  workspaceId: string;
  agentKeyId: string;
  agentSecret: string;
  contractId: string;
  repoRoot?: string | undefined;
  settingsPath?: string | undefined;
  credentialsPath?: string | undefined;
  enforcementMode?: InstallOptions['enforcementMode'] | undefined;
  offlinePolicy?: InstallOptions['offlinePolicy'] | undefined;
  hookPackageVersion?: string | undefined;
  guardianPackageVersion?: string | undefined;
}): InstallOptions {
  return {
    baseUrl: input.baseUrl,
    workspaceId: input.workspaceId,
    agentKeyId: input.agentKeyId,
    agentSecret: input.agentSecret,
    contractId: input.contractId,
    repoRoot: input.repoRoot ?? process.cwd(),
    settingsPath: input.settingsPath,
    credentialsPath: input.credentialsPath,
    enforcementMode: input.enforcementMode ?? 'block',
    offlinePolicy: input.offlinePolicy ?? 'allow',
    hookPackageVersion: input.hookPackageVersion ?? DEFAULT_HOOKS_VERSION,
    guardianPackageVersion: input.guardianPackageVersion ?? DEFAULT_GUARDIAN_VERSION,
  };
}

export function defaultInstallFromPairingCodeOptions(input: {
  baseUrl: string;
  pairCode: string;
  label?: string | undefined;
  contractId: string;
  repoRoot?: string | undefined;
  settingsPath?: string | undefined;
  credentialsPath?: string | undefined;
  enforcementMode?: InstallOptions['enforcementMode'] | undefined;
  offlinePolicy?: InstallOptions['offlinePolicy'] | undefined;
  hookPackageVersion?: string | undefined;
  guardianPackageVersion?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}): InstallFromPairingCodeOptions {
  return {
    baseUrl: input.baseUrl,
    pairCode: input.pairCode,
    label: input.label,
    contractId: input.contractId,
    repoRoot: input.repoRoot ?? process.cwd(),
    settingsPath: input.settingsPath,
    credentialsPath: input.credentialsPath,
    enforcementMode: input.enforcementMode ?? 'block',
    offlinePolicy: input.offlinePolicy ?? 'allow',
    hookPackageVersion: input.hookPackageVersion ?? DEFAULT_HOOKS_VERSION,
    guardianPackageVersion: input.guardianPackageVersion ?? DEFAULT_GUARDIAN_VERSION,
    fetchImpl: input.fetchImpl,
  };
}
