import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildEvidencePayload, boundedPreview } from './evidence.js';
import { runCommand } from './command-runner.js';
import { deriveCommand, type GuardianCheckSpec } from './commands.js';

export type CheckVerificationResult = {
  checkId: string;
  checkType: string;
  executedCommand: string;
  exitCode: number | null;
  stdoutPreview: string;
  stderrPreview: string;
  stdoutDigest: string;
  matchedLines: string[];
  matchCount: number;
  filePath: string | null;
  verdict: 'passing' | 'failing' | 'error' | 'timeout';
  verdictReason: string;
  gitSha: string | null;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
};

export type SoundnessReport = {
  contractId: string;
  gitSha: string | null;
  gitBranch: string | null;
  treeHash: string | null;
  soundnessVerdict: 'sound' | 'suspicious' | 'unsound';
  baselineFailureRate: number;
  impossibleCheckIds: string[];
  trivialCheckIds: string[];
  checkResults: CheckVerificationResult[];
  capturedAt: string;
  staticAnalysis?: {
    checks: {
      checkId: string;
      confidence: 'code_symbol' | 'mixed' | 'natural_language' | 'unanalyzable';
      confidenceReason: string;
      resolvedCount: number;
      unresolvedCount: number;
      extractedIdentifiers: string[];
      resolvedSymbols: {
        identifier: string;
        filePath: string;
        line: number;
        kind: string;
      }[];
    }[];
    symbolGraphHash: string;
    sourceFileCount: number;
    analysisMs: number;
  } | null;
};

type CheckSpec = GuardianCheckSpec;

function fullSha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function gitValue(repoRoot: string, command: string): string | null {
  try {
    return execSync(command, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 })
      .toString()
      .trim() || null;
  } catch {
    return null;
  }
}

function gitPickaxeHasMatches(repoRoot: string, pattern: string): boolean {
  try {
    const gitResult = execSync(
      `git log -S ${JSON.stringify(pattern)} --all --oneline`,
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 },
    ).toString().trim();
    return gitResult.length > 0;
  } catch {
    return true;
  }
}

export function computeSoundnessVerdict(params: {
  baselineFailureRate: number;
  impossibleCheckIds: string[];
  totalChecks: number;
}): 'sound' | 'suspicious' | 'unsound' {
  if (params.impossibleCheckIds.length > params.totalChecks / 2) {
    return 'unsound';
  }
  if (params.baselineFailureRate === 1.0 && params.totalChecks > 0) {
    return 'unsound';
  }
  if (params.impossibleCheckIds.length > 0) {
    return 'suspicious';
  }
  if (params.baselineFailureRate > 0.8) {
    return 'suspicious';
  }
  return 'sound';
}

async function findImpossibleChecks(
  checks: CheckSpec[],
  results: CheckVerificationResult[],
  repoRoot: string,
): Promise<string[]> {
  const impossible: string[] = [];

  for (const result of results) {
    if (result.verdict !== 'failing') continue;
    const check = checks.find((candidate) => candidate.checkId === result.checkId);
    if (!check) continue;
    if (check.type !== 'search_present' && check.type !== 'file_exists') continue;

    const pattern = check.query ?? check.path;
    if (!pattern) continue;

    if (!gitPickaxeHasMatches(repoRoot, pattern)) {
      impossible.push(result.checkId);
    }
  }

  return impossible;
}

function findTrivialChecks(
  checks: CheckSpec[],
  results: CheckVerificationResult[],
  repoRoot: string,
): string[] {
  const trivial: string[] = [];

  for (const result of results) {
    if (result.verdict !== 'passing') continue;
    const check = checks.find((candidate) => candidate.checkId === result.checkId);
    if (!check) continue;
    if (check.type !== 'search_absent' && check.type !== 'file_absent') continue;

    const pattern = check.query ?? check.path;
    if (!pattern) continue;
    if (!gitPickaxeHasMatches(repoRoot, pattern)) {
      trivial.push(result.checkId);
    }
  }

  return trivial;
}

function resultVerdict(params: {
  exitCode: number | null;
  expectedExitCode: number;
  timedOut: boolean;
  signal: string | null;
}): { verdict: CheckVerificationResult['verdict']; reason: string } {
  if (params.timedOut) {
    return { verdict: 'timeout', reason: 'Command timed out before producing a definitive baseline.' };
  }
  if (params.exitCode === params.expectedExitCode) {
    return { verdict: 'passing', reason: `Exit code ${params.exitCode} matched expected ${params.expectedExitCode}.` };
  }
  if (params.exitCode === 0 || params.exitCode === 1) {
    return { verdict: 'failing', reason: `Exit code ${params.exitCode} did not match expected ${params.expectedExitCode}.` };
  }
  return {
    verdict: 'error',
    reason: params.signal
      ? `Command exited due to signal ${params.signal}.`
      : `Command exited with unexpected error code ${params.exitCode ?? 'null'}.`,
  };
}

export async function runSoundnessVerification(params: {
  contractId: string;
  checks: Array<{
    checkId: string;
    type: string | undefined;
    command: string | undefined;
    query: string | undefined;
    paths: string[] | undefined;
    path: string | undefined;
  }>;
  repoRoot: string;
  timeoutMs?: number;
}): Promise<SoundnessReport> {
  const timeoutMs = params.timeoutMs ?? 30_000;
  const gitSha = gitValue(params.repoRoot, 'git rev-parse HEAD');
  const gitBranch = gitValue(params.repoRoot, 'git rev-parse --abbrev-ref HEAD');
  const treeHash = gitValue(params.repoRoot, 'git rev-parse HEAD^{tree}');
  const results: CheckVerificationResult[] = [];

  for (const check of params.checks) {
    let derived;
    try {
      derived = deriveCommand(check);
    } catch (err) {
      const now = new Date().toISOString();
      results.push({
        checkId: check.checkId,
        checkType: check.type ?? 'unknown',
        executedCommand: '',
        exitCode: null,
        stdoutPreview: '',
        stderrPreview: boundedPreview((err as Error).message, 200) ?? '',
        stdoutDigest: fullSha256(''),
        matchedLines: [],
        matchCount: 0,
        filePath: check.path ?? null,
        verdict: 'error',
        verdictReason: (err as Error).message,
        gitSha,
        durationMs: 0,
        startedAt: now,
        finishedAt: now,
      });
      continue;
    }

    try {
      const commandResult = await runCommand({
        command: derived.command,
        cwd: params.repoRoot,
        timeoutMs,
      });
      const evidence = buildEvidencePayload({
        contractId: params.contractId,
        checkId: check.checkId,
        exitCode: commandResult.exitCode,
        expectedExitCode: derived.expectedExitCode,
        command: derived.commandStr,
        cwd: params.repoRoot,
        startedAt: commandResult.startedAt,
        finishedAt: commandResult.finishedAt,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        ...(gitSha ? { gitSha } : {}),
        ...(gitBranch ? { gitBranch } : {}),
      });
      const verdict = resultVerdict({
        exitCode: commandResult.exitCode,
        expectedExitCode: derived.expectedExitCode,
        timedOut: commandResult.timedOut,
        signal: commandResult.signal,
      });
      const matchedLines = derived.checkType === 'search_absent' || derived.checkType === 'search_present'
        ? commandResult.stdout.trim().split('\n').filter((line) => line.length > 0).slice(0, 50)
        : [];

      results.push({
        checkId: check.checkId,
        checkType: derived.checkType,
        executedCommand: derived.commandStr,
        exitCode: commandResult.exitCode,
        stdoutPreview: evidence.provenance.stdoutPreview ?? '',
        stderrPreview: boundedPreview(commandResult.stderr, 200) ?? '',
        stdoutDigest: fullSha256(commandResult.stdout),
        matchedLines,
        matchCount: matchedLines.length,
        filePath: derived.filePath ?? null,
        verdict: verdict.verdict,
        verdictReason: verdict.reason,
        gitSha,
        durationMs: commandResult.finishedAt.getTime() - commandResult.startedAt.getTime(),
        startedAt: commandResult.startedAt.toISOString(),
        finishedAt: commandResult.finishedAt.toISOString(),
      });
    } catch (err) {
      const now = new Date().toISOString();
      results.push({
        checkId: check.checkId,
        checkType: derived.checkType,
        executedCommand: derived.commandStr,
        exitCode: null,
        stdoutPreview: '',
        stderrPreview: boundedPreview((err as Error).message, 200) ?? '',
        stdoutDigest: fullSha256(''),
        matchedLines: [],
        matchCount: 0,
        filePath: derived.filePath ?? null,
        verdict: 'error',
        verdictReason: (err as Error).message,
        gitSha,
        durationMs: 0,
        startedAt: now,
        finishedAt: now,
      });
    }
  }

  const totalChecks = results.length;
  const failingCount = results.filter((result) => result.verdict === 'failing').length;
  const baselineFailureRate = totalChecks > 0 ? failingCount / totalChecks : 0;
  const impossibleCheckIds = await findImpossibleChecks(params.checks, results, params.repoRoot);
  const trivialCheckIds = findTrivialChecks(params.checks, results, params.repoRoot);
  const soundnessVerdict = computeSoundnessVerdict({
    baselineFailureRate,
    impossibleCheckIds,
    totalChecks,
  });

  return {
    contractId: params.contractId,
    gitSha,
    gitBranch,
    treeHash,
    soundnessVerdict,
    baselineFailureRate,
    impossibleCheckIds,
    trivialCheckIds,
    checkResults: results,
    capturedAt: new Date().toISOString(),
  };
}
