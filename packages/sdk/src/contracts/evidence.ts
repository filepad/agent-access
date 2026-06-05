import { createHash } from 'node:crypto';

// ── Guardian Evidence Types ──

export type GuardianEvidenceStatus = 'passing' | 'failing' | 'blocked' | 'unverified';

export type GuardianEvidenceSource = 'guardian';

export type GuardianCommandProvenance = {
  command: string;
  cwd: string;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stdoutDigest: string;
  stderrDigest: string;
  stdoutPreview?: string | undefined;
  stderrPreview?: string | undefined;
  gitSha?: string | undefined;
  gitBranch?: string | undefined;
};

export type GuardianEvidencePayload = {
  contractId: string;
  checkId?: string | undefined;
  source: GuardianEvidenceSource;
  status: GuardianEvidenceStatus;
  summary: string;
  provenance: GuardianCommandProvenance;
};

// ── Digest helpers ──

export function sha256Digest(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 24);
}

export function boundedPreview(text: string, maxChars: number): string | undefined {
  if (!text || text.length === 0) return undefined;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '...[truncated]';
}

// ── Payload builder ──

export function buildEvidencePayload(params: {
  contractId: string;
  checkId?: string;
  exitCode: number;
  expectedExitCode?: number;
  command: string;
  cwd: string;
  startedAt: Date;
  finishedAt: Date;
  stdout: string;
  stderr: string;
  gitSha?: string;
  gitBranch?: string;
  maxPreviewChars?: number;
}): GuardianEvidencePayload {
  const { maxPreviewChars = 500 } = params;
  const status: GuardianEvidenceStatus =
    params.expectedExitCode !== undefined && params.exitCode === params.expectedExitCode
      ? 'passing'
      : params.expectedExitCode === undefined && params.exitCode === 0
        ? 'passing'
        : 'failing';

  return {
    contractId: params.contractId,
    checkId: params.checkId,
    source: 'guardian',
    status,
    summary: status === 'passing'
      ? `Command exited 0: ${params.command}`
      : `Command exited ${params.exitCode}: ${params.command}`,
    provenance: {
      command: params.command,
      cwd: params.cwd,
      exitCode: params.exitCode,
      startedAt: params.startedAt.toISOString(),
      finishedAt: params.finishedAt.toISOString(),
      durationMs: params.finishedAt.getTime() - params.startedAt.getTime(),
      stdoutDigest: sha256Digest(params.stdout),
      stderrDigest: sha256Digest(params.stderr),
      stdoutPreview: boundedPreview(params.stdout, maxPreviewChars),
      stderrPreview: boundedPreview(params.stderr, maxPreviewChars),
      gitSha: params.gitSha,
      gitBranch: params.gitBranch,
    },
  };
}
