// TEST CATEGORY: runtime-adapter
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { doctorClaudeCodeRuntime, installClaudeCodeRuntime } from '../src/index.js';

describe('doctorClaudeCodeRuntime', () => {
  it('fails closed when the runtime manifest is missing', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'filepad-runtime-adapter-doctor-'));
    await mkdir(join(repoRoot, '.git'), { recursive: true });
    try {
      await expect(doctorClaudeCodeRuntime(repoRoot)).resolves.toMatchObject({
        ok: false,
        checks: [{ id: 'manifest', ok: false }],
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('fails closed when an expected Claude Code hook event is missing', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'filepad-runtime-adapter-doctor-'));
    const home = await mkdtemp(join(tmpdir(), 'filepad-runtime-adapter-home-'));
    const originalHome = process.env['HOME'];
    process.env['HOME'] = home;
    await mkdir(join(repoRoot, '.git'), { recursive: true });

    try {
      const result = await installClaudeCodeRuntime({
        baseUrl: 'https://api.filepad.ai',
        workspaceId: 'ws_test',
        agentKeyId: 'ik_test',
        agentSecret: 'secret_once',
        contractId: 'ac_reference',
        repoRoot,
        enforcementMode: 'block',
        offlinePolicy: 'allow',
        hookPackageVersion: '0.1.3',
        guardianPackageVersion: '0.1.1',
      });

      const settings = JSON.parse(await readFile(result.settingsPath, 'utf8')) as {
        hooks: Record<string, unknown>;
      };
      delete settings.hooks['Stop'];
      await writeFile(result.settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

      const doctor = await doctorClaudeCodeRuntime(repoRoot);
      expect(doctor.ok).toBe(false);
      expect(doctor.checks).toContainEqual({
        id: 'hooks',
        ok: false,
        message: 'Claude Code Filepad hooks cover all supported hook events',
      });
    } finally {
      if (originalHome !== undefined) process.env['HOME'] = originalHome;
      else delete process.env['HOME'];
      await rm(repoRoot, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  });
});
