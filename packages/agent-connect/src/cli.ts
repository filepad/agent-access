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
};

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function isRuntime(value: string | undefined): value is AgentRuntime {
  return Boolean(value) && SUPPORTED_RUNTIMES.includes(value as AgentRuntime);
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, code] = argv;
  if (command !== 'pair' || !code) {
    throw new Error(
      'Usage: filepad-agent-connect pair <CODE> --runtime <runtime> [--base-url URL]\n' +
      '  [--output json]',
    );
  }
  const runtime = readFlag(argv, '--runtime');
  if (!isRuntime(runtime)) {
    throw new Error(`Missing or unsupported --runtime. Supported: ${SUPPORTED_RUNTIMES.join(', ')}`);
  }
  const output = readFlag(argv, '--output');

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
    dryRun: argv.includes('--dry-run'),
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
