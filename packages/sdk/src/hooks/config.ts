// FILE MEMO: Credentials resolution for Filepad Claude Code hook scripts.
// Priority: env vars → scoped credentials path → legacy singleton credentials.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type HookCredentials = {
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

function defaultCredentialsPath(): string {
  const home = process.env['HOME'] ?? '.';
  return join(home, '.config', 'filepad', 'hooks-credentials.json');
}

async function readCredentialsFile(path: string): Promise<CredentialsFile | null> {
  try {
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CredentialsFile;
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveCredentials(): Promise<HookCredentials> {
  const fromEnv = {
    baseUrl: process.env['FILEPAD_BASE_URL'],
    workspaceId: process.env['FILEPAD_WORKSPACE_ID'],
    keyId: process.env['FILEPAD_AGENT_KEY_ID'],
    secret: process.env['FILEPAD_AGENT_SECRET'],
  };

  if (fromEnv.baseUrl && fromEnv.workspaceId && fromEnv.keyId && fromEnv.secret) {
    return fromEnv as HookCredentials;
  }

  const filePath = process.env['FILEPAD_HOOKS_CREDENTIALS_PATH'] ?? defaultCredentialsPath();
  const file = await readCredentialsFile(filePath);

  const baseUrl =
    fromEnv.baseUrl ??
    (typeof file?.baseUrl === 'string' ? file.baseUrl : undefined);
  const workspaceId =
    fromEnv.workspaceId ??
    (typeof file?.workspaceId === 'string' ? file.workspaceId : undefined);
  const keyId =
    fromEnv.keyId ??
    (typeof file?.keyId === 'string' ? file.keyId : undefined);
  const secret =
    fromEnv.secret ??
    (typeof file?.secret === 'string' ? file.secret : undefined);

  if (!baseUrl || !workspaceId || !keyId || !secret) {
    throw new Error(
      `Filepad hook credentials not found.\n` +
      `Set FILEPAD_BASE_URL, FILEPAD_WORKSPACE_ID, FILEPAD_AGENT_KEY_ID, FILEPAD_AGENT_SECRET\n` +
      `or pair with: npx -y @filepad/agent-connect@latest pair <CODE> --runtime claude-code`,
    );
  }

  return { baseUrl, workspaceId, keyId, secret };
}

export async function writeCredentialsFile(
  credentials: HookCredentials,
  path?: string,
): Promise<string> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  const target = path ?? defaultCredentialsPath();
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  return target;
}
