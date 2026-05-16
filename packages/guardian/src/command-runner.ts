import { spawn } from 'node:child_process';

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: Date;
  finishedAt: Date;
  signal: string | null;
  timedOut: boolean;
};

export async function runCommand(params: {
  command: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}): Promise<CommandResult> {
  const { command, cwd = process.cwd(), timeoutMs = 120_000, maxOutputBytes = 256_000 } = params;
  const [bin, ...args] = command;
  if (!bin) throw new Error('Command must not be empty');

  const startedAt = new Date();
  let stdout = '';
  let stderr = '';

  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < maxOutputBytes) {
        stdout += chunk.toString('utf-8');
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOutputBytes) {
        stderr += chunk.toString('utf-8');
      }
    });

    child.on('close', (code, signal) => {
      const finishedAt = new Date();
      resolve({
        exitCode: code ?? (signal ? 128 : 0),
        stdout: stdout.slice(0, maxOutputBytes),
        stderr: stderr.slice(0, maxOutputBytes),
        startedAt,
        finishedAt,
        signal,
        timedOut: signal === 'SIGTERM' || signal === 'SIGKILL',
      });
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
