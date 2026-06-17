#!/usr/bin/env node
// FILE MEMO: CLI entrypoint for OAuth-backed Filepad remote MCP setup.

import {
  connectAgent,
  renderConnectResult,
  SUPPORTED_RUNTIMES,
  type AgentRuntime,
} from './index.js';

type ParsedArgs = {
  command: 'connect';
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
  const [command] = argv;
  if (command === 'pair') {
    throw new Error('The short-code pair command was removed. Use: filepad-agent-connect connect --runtime <runtime> [--base-url URL]');
  }
  if (command !== 'connect') {
    throw new Error(
      'Usage: filepad-agent-connect connect --runtime <runtime> [--base-url URL]\n' +
      '  [--output json]',
    );
  }
  const runtime = readFlag(argv, '--runtime');
  if (!isRuntime(runtime)) {
    throw new Error(`Missing or unsupported --runtime. Supported: ${SUPPORTED_RUNTIMES.join(', ')}`);
  }
  const output = readFlag(argv, '--output');

  return {
    command: 'connect',
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
  const result = await connectAgent({
    ...args,
    onAuthorizeUrl: (url) => {
      process.stderr.write(`Open this URL to authorize Filepad MCP:\n${url}\n`);
    },
  });
  if (args.output === 'json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderConnectResult(result)}\n`);
  }
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  process.stderr.write(`filepad-agent-connect failed: ${err.message}\n`);
  process.exitCode = 1;
});
