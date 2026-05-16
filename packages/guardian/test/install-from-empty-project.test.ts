import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, '..');

function run(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        err.stdout ? `stdout:\n${err.stdout}` : null,
        err.stderr ? `stderr:\n${err.stderr}` : null,
        err.message ? `message:\n${err.message}` : null,
      ].filter(Boolean).join('\n\n'),
    );
  }
}

describe('empty-project install', () => {
  it(
    'installs the packed package and exposes the filepad-guardian binary',
    () => {
      const tmp = mkdtempSync(join(tmpdir(), 'filepad-guardian-install-'));

      try {
        run('pnpm', ['build'], packageRoot);
        run('pnpm', ['pack', '--pack-destination', tmp], packageRoot);

        const tarball = readdirSync(tmp).find((entry) => entry.endsWith('.tgz'));
        expect(tarball).toBeTruthy();

        run('npm', ['init', '-y'], tmp);
        run(
          'npm',
          ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(tmp, tarball as string)],
          tmp,
        );

        const bin = join(tmp, 'node_modules', '.bin', 'filepad-guardian');
        expect(existsSync(bin)).toBe(true);

        const help = run(bin, ['--help'], tmp);
        expect(help).toContain('Filepad Guardian');
        expect(help).toContain('filepad-guardian run');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
