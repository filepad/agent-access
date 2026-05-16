import { readFile } from 'node:fs/promises';

import { hasExpectedFilepadHooks } from './claude-settings.js';
import { manifestPath } from './install.js';
import { pathExists, readJsonFile, resolveFrom } from './files.js';
import type { DoctorCheck, DoctorResult, RuntimeManifest } from './types.js';

function isManifest(value: Record<string, unknown>): value is RuntimeManifest {
  return value['schemaVersion'] === 1 &&
    value['runtime'] === 'claude-code' &&
    typeof value['contractId'] === 'string' &&
    typeof value['repoRoot'] === 'string' &&
    typeof value['settingsPath'] === 'string' &&
    typeof value['credentialsPath'] === 'string' &&
    typeof value['hookCommand'] === 'string' &&
    typeof value['guardianCommand'] === 'string';
}

async function checkCredentials(path: string): Promise<boolean> {
  try {
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    return typeof record['baseUrl'] === 'string' &&
      typeof record['workspaceId'] === 'string' &&
      typeof record['keyId'] === 'string' &&
      typeof record['secret'] === 'string';
  } catch {
    return false;
  }
}

function check(id: string, ok: boolean, message: string): DoctorCheck {
  return { id, ok, message };
}

export async function doctorClaudeCodeRuntime(repoRoot: string = process.cwd()): Promise<DoctorResult> {
  const targetManifestPath = manifestPath(repoRoot);
  const checks: DoctorCheck[] = [];
  const rawManifest = await readJsonFile(targetManifestPath);

  if (!isManifest(rawManifest)) {
    return {
      ok: false,
      manifestPath: targetManifestPath,
      checks: [check('manifest', false, 'Runtime manifest missing or invalid')],
    };
  }

  const manifest = rawManifest;
  const settingsPath = resolveFrom(repoRoot, manifest.settingsPath);
  const credentialsPath = resolveFrom(repoRoot, manifest.credentialsPath);
  checks.push(check('manifest', true, 'Runtime manifest is valid'));
  checks.push(check('contract', manifest.contractId.length > 0, `Contract: ${manifest.contractId}`));
  checks.push(check('settings-file', await pathExists(settingsPath), `Claude settings: ${settingsPath}`));
  checks.push(check('credentials-file', await checkCredentials(credentialsPath), `Credentials: ${credentialsPath}`));
  checks.push(check(
    'hooks',
    await hasExpectedFilepadHooks(settingsPath, credentialsPath),
    'Claude Code Filepad hooks cover all supported hook events',
  ));
  checks.push(check(
    'guardian-command',
    manifest.guardianCommand.includes('@filepad/guardian@'),
    `Guardian command: ${manifest.guardianCommand}`,
  ));
  checks.push(check(
    'hook-command',
    manifest.hookCommand.includes('@filepad/claude-code-hooks@'),
    `Hook command: ${manifest.hookCommand}`,
  ));

  return {
    ok: checks.every((item) => item.ok),
    manifestPath: targetManifestPath,
    checks,
  };
}
