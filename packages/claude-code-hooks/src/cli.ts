#!/usr/bin/env node
// FILE MEMO: CLI entrypoint for Filepad Claude Code hook adapter.
// Usage: filepad-claude-code-hook <event-name> [options]
//        filepad-claude-code-hook doctor
//
// All hook event names are kebab-case matching Claude Code hook event names.
// Reads JSON payload from stdin. Writes decision/context to stdout when applicable.
// Never emits invalid JSON on stdout. Falls back gracefully when backend unavailable.
//
// Exit codes:
//   0 — success (allow or deny via structured JSON)
//   1 — fatal parse/config error (non-blocking for most events)
//   2 — hard block (not used; prefer structured JSON deny)

import { resolveCredentials } from './config.js';
import { createHookClient } from './client.js';
import { resolveEnforcementMode, resolveOfflinePolicy } from './enforcement.js';
import { runHookCommand } from './run.js';
import { runDoctor } from './doctor.js';
import { reportHookHealth } from './health.js';

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main(): Promise<void> {
  const command = process.argv[2];

  // Doctor command: not a hook event — diagnose config health and exit.
  if (command === 'doctor') {
    const result = await runDoctor({ resolveCredentials });
    for (const line of result.lines) {
      process.stdout.write(`${line}\n`);
    }
    process.exitCode = result.exitCode;
    return;
  }

  const mode = resolveEnforcementMode();
  const offlinePolicy = resolveOfflinePolicy();

  let inputJson: string;
  try {
    inputJson = await readStdin();
  } catch (err) {
    process.stderr.write(`filepad-claude-code-hook: failed to read stdin: ${String(err)}\n`);
    process.exitCode = 0;
    return;
  }

  const result = await runHookCommand({
    command: command ?? '',
    inputJson,
    mode,
    offlinePolicy,
    resolveCredentials,
    clientFactory: createHookClient,
    reportHealth: reportHookHealth,
  });

  for (const line of result.stderr) {
    process.stderr.write(`filepad-claude-code-hook: ${line}\n`);
  }
  if (result.stdout !== null) {
    process.stdout.write(`${result.stdout}\n`);
  }
  process.exitCode = result.exitCode;
}

main().catch((err: unknown) => {
  process.stderr.write(`filepad-claude-code-hook: fatal — ${String(err)}\n`);
  process.exitCode = 1;
});
