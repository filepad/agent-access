import { installClaudeCodeRuntime, installClaudeCodeRuntimeFromPairingCode } from '../../install/install.js';

function readFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

export async function runInstall(args: string[]): Promise<void> {
  const pairCode = readFlag(args, '--pairing-code') ?? readFlag(args, '--pair-code');
  const baseUrl = readFlag(args, '--base-url') ?? process.env['FILEPAD_BASE_URL'] ?? 'https://app.filepad.com';
  const contractId = readFlag(args, '--contract-id') ?? '';
  const repoRoot = readFlag(args, '--repo-root') ?? process.cwd();
  const enforcementMode = (readFlag(args, '--enforcement-mode') as 'off' | 'observe' | 'warn' | 'block') ?? 'observe';
  const offlinePolicy = (readFlag(args, '--offline-policy') as 'allow' | 'deny') ?? 'allow';

  if (pairCode) {
    const result = await installClaudeCodeRuntimeFromPairingCode({
      pairCode, baseUrl, contractId, repoRoot, enforcementMode, offlinePolicy,
      hookPackageVersion: 'latest',
      guardianPackageVersion: 'latest',
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const agentKeyId = readFlag(args, '--key-id') ?? process.env['FILEPAD_AGENT_KEY_ID'];
  const agentSecret = readFlag(args, '--secret') ?? process.env['FILEPAD_AGENT_SECRET'];
  const workspaceId = readFlag(args, '--workspace-id') ?? process.env['FILEPAD_WORKSPACE_ID'];

  if (!agentKeyId || !agentSecret || !workspaceId) {
    throw new Error(
      'Missing credentials. Provide --pairing-code, or --key-id, --secret, --workspace-id (or set env vars).',
    );
  }

  const result = await installClaudeCodeRuntime({
    agentKeyId, agentSecret, workspaceId, baseUrl, contractId, repoRoot,
    enforcementMode, offlinePolicy,
    hookPackageVersion: 'latest',
    guardianPackageVersion: 'latest',
  });
  console.log(JSON.stringify(result, null, 2));
}
