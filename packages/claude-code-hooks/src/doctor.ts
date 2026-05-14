// FILE MEMO: Doctor diagnostic command for the Filepad Claude Code hook adapter.
// Checks credential availability, reports config health, optionally pings backend.
// Designed to be injectable for testing — all side effects come from passed functions.

import type { HookCredentials } from './config.js';

export type DoctorResult = {
  ok: boolean;
  lines: string[];
  exitCode: 0 | 1;
};

export async function runDoctor(options: {
  resolveCredentials: () => Promise<HookCredentials>;
  pingBackend?: (credentials: HookCredentials) => Promise<boolean>;
}): Promise<DoctorResult> {
  const lines: string[] = ['filepad-claude-code-hook doctor'];

  let credentials: HookCredentials;
  try {
    credentials = await options.resolveCredentials();
  } catch (err) {
    lines.push(`FAIL credentials: ${String(err)}`);
    return { ok: false, lines, exitCode: 1 };
  }

  lines.push(`OK   baseUrl: ${credentials.baseUrl}`);
  lines.push(`OK   workspaceId: ${credentials.workspaceId}`);
  lines.push(`OK   keyId: ${credentials.keyId}`);
  lines.push(`OK   secret: ${'*'.repeat(8)}`);

  if (options.pingBackend) {
    try {
      const reachable = await options.pingBackend(credentials);
      if (reachable) {
        lines.push('OK   backend: reachable');
      } else {
        lines.push('WARN backend: unreachable (offline policy applies)');
      }
    } catch {
      lines.push('WARN backend: ping failed');
    }
  }

  return { ok: true, lines, exitCode: 0 };
}
