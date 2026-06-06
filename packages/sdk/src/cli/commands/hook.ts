import { resolveCredentials } from '../../hooks/config.js';
import { createHookClient } from '../../hooks/client.js';
import { resolveEnforcementMode, resolveOfflinePolicy } from '../../hooks/enforcement.js';
import { runHookCommand } from '../../hooks/run.js';
import { runDoctor } from '../../hooks/doctor.js';
import { reportHookHealth } from '../../hooks/health.js';

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

export async function runHook(args: string[]): Promise<void> {
  const [event] = args;
  if (!event) {
    throw new Error('Usage: filepad hook <event-name>\n  Reads hook payload from stdin.');
  }

  if (event === 'doctor') {
    const result = await runDoctor({ resolveCredentials });
    for (const line of result.lines) process.stdout.write(`${line}\n`);
    process.exitCode = result.exitCode;
    return;
  }

  const mode = resolveEnforcementMode();
  const offlinePolicy = resolveOfflinePolicy();
  let inputJson: string;
  try {
    inputJson = await readStdin();
  } catch (err) {
    process.stderr.write(`filepad hook: failed to read stdin: ${String(err)}\n`);
    process.exitCode = 0;
    return;
  }

  const result = await runHookCommand({
    command: event,
    inputJson,
    mode,
    offlinePolicy,
    resolveCredentials,
    clientFactory: createHookClient,
    reportHealth: reportHookHealth,
  });

  for (const line of result.stderr) {
    process.stderr.write(`filepad hook: ${line}\n`);
  }
  if (result.stdout !== null) process.stdout.write(`${result.stdout}\n`);
  process.exitCode = result.exitCode;
}
