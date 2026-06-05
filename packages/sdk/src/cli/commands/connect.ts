import {
  pairAgent,
  renderPairResult,
  SUPPORTED_RUNTIMES,
  type AgentRuntime,
} from './connect-impl.js';

function readFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

export async function runConnect(args: string[]): Promise<void> {
  const [code] = args;
  if (!code) {
    throw new Error(
      'Usage: filepad connect <CODE> --runtime <runtime> [--base-url URL] [--output json]',
    );
  }
  const runtimeRaw = readFlag(args, '--runtime');
  if (!runtimeRaw || !SUPPORTED_RUNTIMES.includes(runtimeRaw as AgentRuntime)) {
    throw new Error(
      `Missing or unsupported --runtime. Supported: ${SUPPORTED_RUNTIMES.join(', ')}`,
    );
  }
  const result = await pairAgent({
    code,
    runtime: runtimeRaw as AgentRuntime,
    baseUrl: readFlag(args, '--base-url') ?? process.env['FILEPAD_BASE_URL'] ?? 'https://app.filepad.com',
    label: readFlag(args, '--label'),
    configPath: readFlag(args, '--config-path'),
    outputPath: readFlag(args, '--output-path'),
    dryRun: args.includes('--dry-run'),
  });
  const output = readFlag(args, '--output');
  process.stdout.write(
    output === 'json' ? `${JSON.stringify(result, null, 2)}\n` : `${renderPairResult(result)}\n`,
  );
}
