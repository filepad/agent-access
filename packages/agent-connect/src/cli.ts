#!/usr/bin/env node
// FILE MEMO: CLI entrypoint for Filepad pre-MCP runtime pairing.

import {
  pairAgent,
  renderPairResult,
  SUPPORTED_RUNTIMES,
  type AgentRuntime,
} from './index.js';

type ParsedArgs = {
  command: 'pair';
  code: string;
  runtime: AgentRuntime;
  baseUrl: string;
  label?: string | undefined;
  configPath?: string | undefined;
  outputPath?: string | undefined;
  output: 'text' | 'json';
  dryRun: boolean;
  installHooks: boolean;
  hookCommand?: string | undefined;
  hookEnforcementMode?: 'off' | 'observe' | 'warn' | 'block' | undefined;
  hookOfflinePolicy?: 'allow' | 'deny' | undefined;
};

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function isRuntime(value: string | undefined): value is AgentRuntime {
  return Boolean(value) && SUPPORTED_RUNTIMES.includes(value as AgentRuntime);
}

function parseEnforcementMode(
  raw: string | undefined,
): 'off' | 'observe' | 'warn' | 'block' | undefined {
  if (raw === 'off' || raw === 'observe' || raw === 'warn' || raw === 'block') return raw;
  return undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, code] = argv;
  if (command !== 'pair' || !code) {
    throw new Error(
      'Usage: filepad-agent-connect pair <CODE> --runtime <runtime> [--base-url URL]\n' +
      '  [--install-hooks] [--enforce] [--hook-command CMD] [--enforcement-mode off|observe|warn|block]\n' +
      '  [--offline-policy allow|deny] [--output json]',
    );
  }
  const runtime = readFlag(argv, '--runtime');
  if (!isRuntime(runtime)) {
    throw new Error(`Missing or unsupported --runtime. Supported: ${SUPPORTED_RUNTIMES.join(', ')}`);
  }
  const output = readFlag(argv, '--output');

  // --enforce is shorthand for --enforcement-mode block --offline-policy deny
  const enforce = hasFlag(argv, '--enforce');
  const rawMode = readFlag(argv, '--enforcement-mode');
  const enforcementMode = parseEnforcementMode(rawMode) ?? (enforce ? 'block' : undefined);
  const offlinePolicyRaw = readFlag(argv, '--offline-policy');
  const offlinePolicy: 'allow' | 'deny' | undefined =
    offlinePolicyRaw === 'deny' ? 'deny' : offlinePolicyRaw === 'allow' ? 'allow' :
    enforce ? 'deny' : undefined;

  return {
    command: 'pair',
    code,
    runtime,
    baseUrl:
      readFlag(argv, '--base-url') ??
      process.env['FILEPAD_BASE_URL'] ??
      'https://api.filepad.ai',
    label: readFlag(argv, '--label'),
    configPath: readFlag(argv, '--config-path'),
    outputPath: readFlag(argv, '--output-path'),
    output: output === 'json' ? 'json' : 'text',
    dryRun: hasFlag(argv, '--dry-run'),
    installHooks: hasFlag(argv, '--install-hooks') || enforce,
    hookCommand: readFlag(argv, '--hook-command'),
    hookEnforcementMode: enforcementMode,
    hookOfflinePolicy: offlinePolicy,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await pairAgent(args);
  if (args.output === 'json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderPairResult(result)}\n`);
  }
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  process.stderr.write(`filepad-agent-connect failed: ${err.message}\n`);
  process.exitCode = 1;
});
