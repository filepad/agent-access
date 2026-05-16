#!/usr/bin/env node
import {
  defaultInstallFromPairingCodeOptions,
  defaultInstallOptions,
  installClaudeCodeRuntime,
  installClaudeCodeRuntimeFromPairingCode,
} from './install.js';
import { doctorClaudeCodeRuntime } from './doctor.js';
import type { EnforcementMode, OfflinePolicy } from './types.js';

type ParsedArgs =
  | {
      command: 'install';
      baseUrl: string;
      workspaceId?: string | undefined;
      agentKeyId?: string | undefined;
      agentSecret?: string | undefined;
      pairCode?: string | undefined;
      label?: string | undefined;
      contractId: string;
      repoRoot?: string | undefined;
      settingsPath?: string | undefined;
      credentialsPath?: string | undefined;
      enforcementMode?: EnforcementMode | undefined;
      offlinePolicy?: OfflinePolicy | undefined;
      output: 'text' | 'json';
    }
  | {
      command: 'doctor';
      repoRoot?: string | undefined;
      output: 'text' | 'json';
    };

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  return args[index + 1];
}

function parseOptionalEnforcementMode(raw: string | undefined): EnforcementMode | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'off' || raw === 'observe' || raw === 'warn' || raw === 'block') return raw;
  throw new Error(`Invalid --enforcement-mode: ${raw}`);
}

function parseOptionalOfflinePolicy(raw: string | undefined): OfflinePolicy | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'allow' || raw === 'deny') return raw;
  throw new Error(`Invalid --offline-policy: ${raw}`);
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function usage(): string {
  return [
    'Usage:',
    '  filepad-runtime-adapter-claude-code install --pair-code <code> --contract-id <id> --base-url <url>',
    '  filepad-runtime-adapter-claude-code install --contract-id <id> --workspace-id <id> --agent-key-id <id> --base-url <url>',
    '    FILEPAD_AGENT_SECRET must be set when --pair-code is not used.',
    '  filepad-runtime-adapter-claude-code doctor [--repo-root <path>] [--output json]',
  ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command] = argv;
  const output = readFlag(argv, '--output') === 'json' ? 'json' : 'text';
  if (command === 'install') {
    const pairCode = readFlag(argv, '--pair-code');
    return {
      command,
      baseUrl: required(readFlag(argv, '--base-url') ?? process.env['FILEPAD_BASE_URL'], '--base-url'),
      pairCode,
      label: readFlag(argv, '--label'),
      workspaceId: pairCode
        ? readFlag(argv, '--workspace-id') ?? process.env['FILEPAD_WORKSPACE_ID']
        : required(readFlag(argv, '--workspace-id') ?? process.env['FILEPAD_WORKSPACE_ID'], '--workspace-id'),
      agentKeyId: pairCode
        ? readFlag(argv, '--agent-key-id') ?? process.env['FILEPAD_AGENT_KEY_ID']
        : required(readFlag(argv, '--agent-key-id') ?? process.env['FILEPAD_AGENT_KEY_ID'], '--agent-key-id'),
      agentSecret: pairCode
        ? process.env['FILEPAD_AGENT_SECRET']
        : required(process.env['FILEPAD_AGENT_SECRET'], 'FILEPAD_AGENT_SECRET'),
      contractId: required(readFlag(argv, '--contract-id') ?? process.env['FILEPAD_ACTIVE_CONTRACT_ID'], '--contract-id'),
      repoRoot: readFlag(argv, '--repo-root'),
      settingsPath: readFlag(argv, '--settings-path'),
      credentialsPath: readFlag(argv, '--credentials-path'),
      enforcementMode: parseOptionalEnforcementMode(readFlag(argv, '--enforcement-mode')),
      offlinePolicy: parseOptionalOfflinePolicy(readFlag(argv, '--offline-policy')),
      output,
    };
  }
  if (command === 'doctor') {
    return {
      command,
      repoRoot: readFlag(argv, '--repo-root'),
      output,
    };
  }
  throw new Error(usage());
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'install') {
    const result = args.pairCode
      ? await installClaudeCodeRuntimeFromPairingCode(defaultInstallFromPairingCodeOptions({
        ...args,
        pairCode: args.pairCode,
      }))
      : await installClaudeCodeRuntime(defaultInstallOptions({
        ...args,
        workspaceId: required(args.workspaceId, '--workspace-id'),
        agentKeyId: required(args.agentKeyId, '--agent-key-id'),
        agentSecret: required(args.agentSecret, 'FILEPAD_AGENT_SECRET'),
      }));
    if (args.output === 'json') {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    process.stdout.write([
      'Claude Code contract verification installed.',
      `Manifest: ${result.manifestPath}`,
      `Claude settings: ${result.settingsPath}`,
      `Credentials: ${result.credentialsPath}`,
      `Guardian: ${result.guardianCommand}`,
      `Hook events: ${result.hookEvents.join(', ')}`,
    ].join('\n') + '\n');
    return;
  }

  const result = await doctorClaudeCodeRuntime(args.repoRoot);
  if (args.output === 'json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`Claude Code runtime adapter doctor: ${result.ok ? 'ok' : 'failed'}\n`);
    for (const item of result.checks) {
      process.stdout.write(`${item.ok ? 'PASS' : 'FAIL'} ${item.id}: ${item.message}\n`);
    }
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  process.stderr.write(`filepad-runtime-adapter-claude-code failed: ${err.message}\n`);
  process.exitCode = 1;
});
