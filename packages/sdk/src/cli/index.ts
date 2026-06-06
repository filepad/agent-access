#!/usr/bin/env node
// Unified `filepad` CLI — replaces filepad-agent-connect, filepad-claude-code-hook,
// filepad-guardian, filepad-runtime-adapter-claude-code.

import { runConnect } from './commands/connect.js';
import { runHook } from './commands/hook.js';
import { runGuardian } from './commands/guardian.js';
import { runInstall } from './commands/install.js';
import { runDoctor } from './commands/doctor.js';

const [, , command, ...rest] = process.argv;

async function main(): Promise<void> {
  switch (command) {
    case 'connect':
      return runConnect(rest);
    case 'hook':
      return runHook(rest);
    case 'guardian':
      return runGuardian(rest);
    case 'install':
      return runInstall(rest);
    case 'doctor':
      return runDoctor(rest);
    case undefined:
    case '--help':
    case '-h':
      printHelp();
      return;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n`);
      printHelp();
      process.exitCode = 1;
  }
}

function printHelp(): void {
  process.stdout.write(
    `filepad — Filepad agent SDK CLI

Commands:
  connect <CODE> --runtime <runtime>   Pair this agent with a Filepad workspace
  hook <event>                          Process a Claude Code hook event
  guardian <status|run|report|watch>   Contract verification and evidence reporting
  install                               Install contract enforcement hooks for this repo
  doctor                                Verify the Filepad installation in this repo

Options:
  --help, -h    Show this help

Environment variables:
  FILEPAD_BASE_URL         Filepad server URL (default: https://app.filepad.com)
  FILEPAD_WORKSPACE_ID     Workspace ID
  FILEPAD_AGENT_KEY_ID     Agent key ID
  FILEPAD_AGENT_SECRET     Agent secret

Examples:
  filepad connect ABC123 --runtime claude-code
  filepad doctor
  filepad guardian status
  filepad guardian run --contract-id ctr_xxx
`,
  );
}

main().catch((err) => {
  const error = err instanceof Error ? err : new Error(String(err));
  process.stderr.write(`filepad: ${error.message}\n`);
  process.exitCode = 1;
});
