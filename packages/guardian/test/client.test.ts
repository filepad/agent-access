// TEST CATEGORY: unit
import { describe, expect, it, vi } from 'vitest';
import { buildEvidencePayload } from '../src/evidence.js';

// Test client types without requiring SDK import
describe('Guardian Evidence → Active Contract mapping', () => {
  it('provenance is stored as first-class field, not buried in data', () => {
    const payload = buildEvidencePayload({
      contractId: 'ac_test',
      exitCode: 0,
      expectedExitCode: 0,
      command: 'echo hi',
      cwd: '/tmp',
      startedAt: new Date('2026-05-11T00:00:00.000Z'),
      finishedAt: new Date('2026-05-11T00:00:01.000Z'),
      stdout: 'hi',
      stderr: '',
    });

    // Provenance must be a first-class top-level field
    expect(payload.provenance).toBeDefined();
    expect(payload.provenance.command).toBe('echo hi');
    expect(payload.provenance.exitCode).toBe(0);

    // There must NOT be a data.provenance pattern
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('"data":');
  });

  const startedAt = new Date('2026-05-11T00:00:00.000Z');
  const finishedAt = new Date('2026-05-11T00:00:01.000Z');

  it('command evidence maps to active contract evidence shape', () => {
    const payload = buildEvidencePayload({
      contractId: 'ac_test',
      checkId: 'check_cmd',
      exitCode: 0,
      expectedExitCode: 0,
      command: 'pnpm -C apps/backend typecheck',
      cwd: '/home/user/project',
      startedAt,
      finishedAt,
      stdout: 'Typecheck passed',
      stderr: '',
      gitSha: 'abc123def',
      gitBranch: 'main',
    });

    // Verify the payload matches the expected Active Contract evidence format
    expect(payload.contractId).toBe('ac_test');
    expect(payload.checkId).toBe('check_cmd');
    expect(payload.source).toBe('guardian');
    expect(payload.status).toBe('passing');

    // Provenance fields
    expect(payload.provenance.command).toBe('pnpm -C apps/backend typecheck');
    expect(payload.provenance.cwd).toBe('/home/user/project');
    expect(payload.provenance.exitCode).toBe(0);
    expect(payload.provenance.stdoutDigest).toBeDefined();
    expect(payload.provenance.stderrDigest).toBeDefined();
    expect(payload.provenance.gitSha).toBe('abc123def');
    expect(payload.provenance.gitBranch).toBe('main');
    expect(payload.provenance.durationMs).toBe(1000);
    expect(payload.provenance.startedAt).toBe('2026-05-11T00:00:00.000Z');
    expect(payload.provenance.finishedAt).toBe('2026-05-11T00:00:01.000Z');
  });

  it('failing evidence preserves full provenance', () => {
    const payload = buildEvidencePayload({
      contractId: 'ac_test',
      checkId: 'check_fail',
      exitCode: 2,
      expectedExitCode: 0,
      command: 'pnpm test',
      cwd: '/tmp',
      startedAt,
      finishedAt,
      stdout: '',
      stderr: '2 tests failed',
    });

    expect(payload.status).toBe('failing');
    expect(payload.provenance.exitCode).toBe(2);
    expect(payload.provenance.stderrDigest).toBeDefined();
  });

  it('payload does not contain huge raw outputs', () => {
    const hugeStdout = 'x'.repeat(200_000);
    const payload = buildEvidencePayload({
      contractId: 'ac_test',
      checkId: 'check_huge',
      exitCode: 0,
      command: 'generate-huge-output',
      cwd: '/tmp',
      startedAt,
      finishedAt,
      stdout: hugeStdout,
      stderr: '',
      maxPreviewChars: 500,
    });

    const serialized = JSON.stringify(payload);
    // Full output should not be in the payload
    expect(serialized).not.toContain(hugeStdout);
    // Serialized size should be small
    expect(serialized.length).toBeLessThan(5000);
  });
});
