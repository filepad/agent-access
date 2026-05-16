// TEST CATEGORY: unit
import { describe, expect, it } from 'vitest';
import { buildEvidencePayload, sha256Digest, boundedPreview } from '../src/evidence.js';

describe('sha256Digest', () => {
  it('produces 24-char hex digest', () => {
    const d = sha256Digest('hello');
    expect(d).toHaveLength(24);
    expect(/^[a-f0-9]+$/.test(d)).toBe(true);
  });

  it('is deterministic', () => {
    expect(sha256Digest('hello')).toBe(sha256Digest('hello'));
  });
});

describe('boundedPreview', () => {
  it('returns undefined for empty input', () => {
    expect(boundedPreview('', 100)).toBeUndefined();
  });

  it('returns full text when within bounds', () => {
    expect(boundedPreview('short', 100)).toBe('short');
  });

  it('truncates with suffix when too long', () => {
    const long = 'x'.repeat(200);
    const preview = boundedPreview(long, 50);
    expect(preview).toContain('...[truncated]');
    expect(preview!.length).toBeLessThanOrEqual(50 + '...[truncated]'.length);
  });
});

describe('buildEvidencePayload', () => {
  const startedAt = new Date('2026-05-11T00:00:00.000Z');
  const finishedAt = new Date('2026-05-11T00:00:01.500Z');

  it('reports passing evidence for exit code 0', () => {
    const payload = buildEvidencePayload({
      contractId: 'ac_test',
      checkId: 'check_typecheck',
      exitCode: 0,
      expectedExitCode: 0,
      command: 'pnpm typecheck',
      cwd: '/project',
      startedAt,
      finishedAt,
      stdout: 'Success',
      stderr: '',
    });

    expect(payload.status).toBe('passing');
    expect(payload.summary).toContain('exited 0');
    expect(payload.provenance.exitCode).toBe(0);
    expect(payload.provenance.durationMs).toBe(1500);
  });

  it('reports failing evidence for non-zero exit code', () => {
    const payload = buildEvidencePayload({
      contractId: 'ac_test',
      checkId: 'check_test',
      exitCode: 1,
      expectedExitCode: 0,
      command: 'pnpm test',
      cwd: '/project',
      startedAt,
      finishedAt,
      stdout: '',
      stderr: 'FAIL: 2 tests failed',
    });

    expect(payload.status).toBe('failing');
    expect(payload.summary).toContain('exited 1');
  });

  it('includes provenance digests', () => {
    const payload = buildEvidencePayload({
      contractId: 'ac_test',
      exitCode: 0,
      command: 'echo ok',
      cwd: '/tmp',
      startedAt,
      finishedAt,
      stdout: 'ok',
      stderr: '',
    });

    expect(payload.provenance.stdoutDigest).toBeDefined();
    expect(payload.provenance.stderrDigest).toBeDefined();
  });

  it('does not store huge stdout in full', () => {
    const huge = 'x'.repeat(100_000);
    const payload = buildEvidencePayload({
      contractId: 'ac_test',
      exitCode: 0,
      command: 'cat huge',
      cwd: '/tmp',
      startedAt,
      finishedAt,
      stdout: huge,
      stderr: '',
      maxPreviewChars: 500,
    });

    // Digest is always computed on full output
    expect(payload.provenance.stdoutDigest).toBe(sha256Digest(huge));
    // But preview is truncated
    expect(payload.provenance.stdoutPreview!.length).toBeLessThan(1000);
    // Full stdout is NOT in the payload
    expect(JSON.stringify(payload).length).toBeLessThan(3000);
  });
});
