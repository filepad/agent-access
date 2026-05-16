// TEST CATEGORY: unit
import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/command-runner.js';

describe('runCommand', () => {
  it('runs a simple echo command and captures output', async () => {
    const result = await runCommand({ command: ['echo', 'hello', 'world'] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello world');
    expect(result.signal).toBeNull();
    expect(result.timedOut).toBe(false);
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.finishedAt).toBeInstanceOf(Date);
    expect(result.finishedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());
  });

  it('captures non-zero exit code', async () => {
    const result = await runCommand({ command: ['node', '-e', 'process.exit(42)'] });
    expect(result.exitCode).toBe(42);
  });

  it('captures stderr', async () => {
    const result = await runCommand({
      command: ['node', '-e', 'console.error("error output")'],
    });
    expect(result.stderr).toContain('error output');
    expect(result.exitCode).toBe(0);
  });

  it('handles timeout', async () => {
    const result = await runCommand({
      command: ['node', '-e', 'setTimeout(() => {}, 99999)'],
      timeoutMs: 1000,
    });
    // Timeout may result in exit code 128+SIGTERM or similar
    expect(typeof result.exitCode).toBe('number');
  }, 5000);

  it('trims output at maxOutputBytes', async () => {
    const result = await runCommand({
      command: ['node', '-e', 'console.log("x".repeat(5000))'],
      maxOutputBytes: 100,
    });
    expect(result.stdout.length).toBeLessThanOrEqual(200);
  });
});
