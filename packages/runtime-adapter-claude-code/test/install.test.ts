// TEST CATEGORY: runtime-adapter
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  CLAUDE_CODE_HOOK_EVENTS,
  doctorClaudeCodeRuntime,
  installClaudeCodeRuntimeFromPairingCode,
  installClaudeCodeRuntime,
  type RuntimeManifest,
} from '../src/index.js';

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'filepad-runtime-adapter-claude-code-'));
  await mkdir(join(dir, '.git'), { recursive: true });
  return dir;
}

describe('installClaudeCodeRuntime', () => {
  it('installs Claude Code hooks, non-secret manifest, and user-scoped credentials', async () => {
    const repoRoot = await makeRepo();
    const home = await mkdtemp(join(tmpdir(), 'filepad-runtime-adapter-home-'));
    const originalHome = process.env['HOME'];
    process.env['HOME'] = home;

    try {
      const result = await installClaudeCodeRuntime({
        baseUrl: 'https://api.filepad.ai/',
        workspaceId: 'ws_test',
        agentKeyId: 'ik_test',
        agentSecret: 'secret_once',
        contractId: 'ac_reference',
        repoRoot,
        enforcementMode: 'block',
        offlinePolicy: 'deny',
        hookPackageVersion: '0.1.3',
        guardianPackageVersion: '0.1.1',
        now: new Date('2026-05-16T12:00:00.000Z'),
      });

      const settings = JSON.parse(await readFile(result.settingsPath, 'utf8')) as {
        hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; env?: Record<string, string> }> }>>;
      };
      expect(settings.hooks['PreToolUse']?.[0]?.matcher).toBe('*');
      expect(settings.hooks['PermissionRequest']?.[0]?.matcher).toBe('*');
      expect(settings.hooks['Stop']?.[0]?.matcher).toBeUndefined();
      for (const event of CLAUDE_CODE_HOOK_EVENTS) {
        const entries = settings.hooks[event];
        expect(entries, `missing ${event}`).toHaveLength(1);
        expect(entries?.[0]?.hooks).toHaveLength(1);
        expect(entries?.[0]?.hooks[0]?.command).toContain('@filepad/claude-code-hooks@0.1.3');
        expect(entries?.[0]?.hooks[0]?.env).toMatchObject({
          FILEPAD_HOOKS_CREDENTIALS_PATH: result.credentialsPath,
          FILEPAD_GUARDIAN_CREDENTIALS_PATH: result.credentialsPath,
          FILEPAD_ACTIVE_CONTRACT_ID: 'ac_reference',
        });
      }
      expect(settings.hooks['PreToolUse']?.[0]?.hooks[0]?.command).toBe(
        'npx -y @filepad/claude-code-hooks@0.1.3 pre-tool-use',
      );
      expect(settings.hooks['PreToolUse']?.[0]?.hooks[0]?.env).toMatchObject({
        FILEPAD_HOOK_ENFORCEMENT_MODE: 'block',
        FILEPAD_HOOK_OFFLINE_POLICY: 'deny',
        FILEPAD_HOOKS_CREDENTIALS_PATH: result.credentialsPath,
        FILEPAD_GUARDIAN_CREDENTIALS_PATH: result.credentialsPath,
        FILEPAD_ACTIVE_CONTRACT_ID: 'ac_reference',
      });

      const credentials = JSON.parse(await readFile(result.credentialsPath, 'utf8')) as {
        baseUrl: string;
        workspaceId: string;
        keyId: string;
        secret: string;
        activeContractId: string;
      };
      expect(credentials).toMatchObject({
        baseUrl: 'https://api.filepad.ai',
        workspaceId: 'ws_test',
        keyId: 'ik_test',
        secret: 'secret_once',
        activeContractId: 'ac_reference',
      });
      expect((await stat(result.credentialsPath)).mode & 0o777).toBe(0o600);

      const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8')) as RuntimeManifest;
      expect(manifest).toMatchObject({
        runtime: 'claude-code',
        contractId: 'ac_reference',
        repoRoot,
        credentialsPath: result.credentialsPath,
        hookCommand: 'npx -y @filepad/claude-code-hooks@0.1.3',
        guardianCommand: 'npx -y @filepad/guardian@0.1.1',
      });
      expect(JSON.stringify(manifest)).not.toContain('secret_once');
      expect(await readFile(result.settingsPath, 'utf8')).not.toContain('secret_once');

      await expect(doctorClaudeCodeRuntime(repoRoot)).resolves.toMatchObject({ ok: true });
    } finally {
      if (originalHome !== undefined) process.env['HOME'] = originalHome;
      else delete process.env['HOME'];
      await rm(repoRoot, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  });

  it('preserves non-Filepad hooks and replaces stale Filepad hooks', async () => {
    const repoRoot = await makeRepo();
    const settingsPath = join(repoRoot, '.claude', 'settings.local.json');
    await mkdir(join(repoRoot, '.claude'), { recursive: true });
    await writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: '*', hooks: [{ type: 'command', command: 'filepad-hook pre-tool-use' }] },
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'other-tool check' }] },
          ],
        },
      }),
    );

    try {
      await installClaudeCodeRuntime({
        baseUrl: 'https://api.filepad.ai',
        workspaceId: 'ws_test',
        agentKeyId: 'ik_test',
        agentSecret: 'secret_once',
        contractId: 'ac_reference',
        repoRoot,
        settingsPath,
        enforcementMode: 'block',
        offlinePolicy: 'allow',
        hookPackageVersion: '0.1.3',
        guardianPackageVersion: '0.1.1',
      });

      const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as {
        hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };
      const preToolUse = settings.hooks['PreToolUse']!;
      expect(preToolUse.filter((entry) =>
        entry.hooks.some((hook) => hook.command.includes('@filepad/claude-code-hooks')),
      )).toHaveLength(1);
      expect(preToolUse.some((entry) =>
        entry.hooks.some((hook) => hook.command === 'other-tool check'),
      )).toBe(true);
      expect(preToolUse.some((entry) =>
        entry.hooks.some((hook) => hook.command.includes('filepad-hook')),
      )).toBe(false);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('refuses implicit non-repo execution targets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filepad-runtime-adapter-no-repo-'));
    try {
      await expect(installClaudeCodeRuntime({
        baseUrl: 'https://api.filepad.ai',
        workspaceId: 'ws_test',
        agentKeyId: 'ik_test',
        agentSecret: 'secret_once',
        contractId: 'ac_reference',
        repoRoot: dir,
        enforcementMode: 'block',
        offlinePolicy: 'allow',
        hookPackageVersion: '0.1.3',
        guardianPackageVersion: '0.1.1',
      })).rejects.toThrow('Refusing to install Claude Code contract verification outside an explicit git repo');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('can exchange a pairing code and install without exposing a manual secret flag', async () => {
    const repoRoot = await makeRepo();
    const home = await mkdtemp(join(tmpdir(), 'filepad-runtime-adapter-home-'));
    const originalHome = process.env['HOME'];
    process.env['HOME'] = home;
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          status: 'paired',
          workspace: { id: 'ws_pair', name: 'Workspace', owner: 'Owner' },
          credentials: {
            agentKeyId: 'ik_pair',
            agentSecret: 'secret_from_pair',
            expiresAt: '2026-05-16T12:00:00.000Z',
          },
          hostConfig: {},
          handoff: {},
        }),
      } as Response;
    }) as typeof fetch;

    try {
      const result = await installClaudeCodeRuntimeFromPairingCode({
        baseUrl: 'https://api.filepad.ai/',
        pairCode: 'PAIR1234',
        label: 'Claude Code contract verifier',
        contractId: 'ac_pair',
        repoRoot,
        enforcementMode: 'block',
        offlinePolicy: 'allow',
        hookPackageVersion: '0.1.3',
        guardianPackageVersion: '0.1.1',
        fetchImpl,
      });

      expect(requests).toEqual([{
        url: 'https://api.filepad.ai/agent-api/v1/pair',
        body: {
          code: 'PAIR1234',
          runtime: 'claude-code',
          label: 'Claude Code contract verifier',
        },
      }]);
      const credentials = JSON.parse(await readFile(result.credentialsPath, 'utf8')) as {
        workspaceId: string;
        keyId: string;
        secret: string;
        activeContractId: string;
      };
      expect(credentials).toMatchObject({
        workspaceId: 'ws_pair',
        keyId: 'ik_pair',
        secret: 'secret_from_pair',
        activeContractId: 'ac_pair',
      });
      await expect(doctorClaudeCodeRuntime(repoRoot)).resolves.toMatchObject({ ok: true });
    } finally {
      if (originalHome !== undefined) process.env['HOME'] = originalHome;
      else delete process.env['HOME'];
      await rm(repoRoot, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  });
});
