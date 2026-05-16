import { readFileSync } from 'node:fs';

export type GuardianConfig = {
  baseUrl: string;
  workspaceId: string;
  keyId: string;
  secret: string;
};

type CredentialsFile = {
  baseUrl?: unknown;
  workspaceId?: unknown;
  keyId?: unknown;
  secret?: unknown;
};

function readCredentialsFile(path: string | undefined): CredentialsFile | null {
  if (!path) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as CredentialsFile
      : null;
  } catch {
    return null;
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): GuardianConfig {
  const credentialsFile = readCredentialsFile(
    env['FILEPAD_GUARDIAN_CREDENTIALS_PATH'] ?? env['FILEPAD_HOOKS_CREDENTIALS_PATH'],
  );
  const baseUrl =
    env['FILEPAD_BASE_URL'] ??
    (typeof credentialsFile?.baseUrl === 'string' ? credentialsFile.baseUrl : undefined);
  const workspaceId =
    env['FILEPAD_WORKSPACE_ID'] ??
    (typeof credentialsFile?.workspaceId === 'string' ? credentialsFile.workspaceId : undefined);
  const keyId =
    env['FILEPAD_AGENT_KEY_ID'] ??
    (typeof credentialsFile?.keyId === 'string' ? credentialsFile.keyId : undefined);
  const secret =
    env['FILEPAD_AGENT_SECRET'] ??
    (typeof credentialsFile?.secret === 'string' ? credentialsFile.secret : undefined);

  const missing: string[] = [];
  if (!baseUrl) missing.push('FILEPAD_BASE_URL');
  if (!workspaceId) missing.push('FILEPAD_WORKSPACE_ID');
  if (!keyId) missing.push('FILEPAD_AGENT_KEY_ID');
  if (!secret) missing.push('FILEPAD_AGENT_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}.\n` +
      `Guardian uses Agent Access credentials (keyId + secret) to authenticate.\n` +
      `Run 'filepad-agent-connect' to create keys, then set:\n` +
      `  FILEPAD_BASE_URL=https://api.filepad.ai\n` +
      `  FILEPAD_WORKSPACE_ID=ws_...\n` +
      `  FILEPAD_AGENT_KEY_ID=ik_...\n` +
      `  FILEPAD_AGENT_SECRET=...\n` +
      `or set FILEPAD_GUARDIAN_CREDENTIALS_PATH to a Filepad runtime adapter credentials file.\n`,
    );
  }

  return {
    baseUrl: baseUrl as string,
    workspaceId: workspaceId as string,
    keyId: keyId as string,
    secret: secret as string,
  };
}
