// TEST CATEGORY: unit
import { describe, expect, it } from 'vitest';
import { deriveCommand } from '../src/commands.js';
import { runCommand } from '../src/command-runner.js';

describe('deriveCommand', () => {
  it('runs contract command checks through a shell so operators are honored', async () => {
    const derived = deriveCommand({
      checkId: 'shell_command',
      type: 'command',
      command: 'test ! -e definitely_missing_file && printf ok',
      query: undefined,
      paths: undefined,
      path: undefined,
      expect_exit_code: 0,
    });

    expect(derived.command).toEqual(['sh', '-lc', 'test ! -e definitely_missing_file && printf ok']);
    expect(derived.commandStr).toBe('test ! -e definitely_missing_file && printf ok');

    const result = await runCommand({ command: derived.command });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('ok');
  });

  it('preserves factual command failures instead of shell parse failures', async () => {
    const derived = deriveCommand({
      checkId: 'existing_file_absent',
      type: 'command',
      command: 'test ! -e package.json && test ! -e pnpm-lock.yaml',
      query: undefined,
      paths: undefined,
      path: undefined,
      expect_exit_code: 0,
    });

    const result = await runCommand({ command: derived.command });
    expect(result.exitCode).toBe(1);
  });

  it('ignores deleted search paths so hard-cut contracts can pass', async () => {
    const derived = deriveCommand({
      checkId: 'deleted_paths_absent',
      type: 'search_absent',
      command: undefined,
      query: 'legacy-system',
      paths: ['definitely_missing_dir', 'definitely_missing_file.ts'],
      path: undefined,
      expect_exit_code: undefined,
    });

    expect(derived.command).toEqual(['sh', '-lc', 'exit 1']);
    expect(derived.expectedExitCode).toBe(1);

    const result = await runCommand({ command: derived.command });
    expect(result.exitCode).toBe(1);
  });
});
