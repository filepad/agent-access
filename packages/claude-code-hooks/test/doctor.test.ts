// TEST CATEGORY: unit
import { describe, expect, it, vi } from 'vitest';
import { runDoctor } from '../src/doctor.js';
import type { HookCredentials } from '../src/config.js';

const FAKE_CREDS: HookCredentials = {
  baseUrl: 'https://api.filepad.ai',
  workspaceId: 'ws_test',
  keyId: 'ik_abc123',
  secret: 'super_secret_value',
};

describe('runDoctor', () => {
  it('succeeds with valid credentials and reachable backend', async () => {
    const pingBackend = vi.fn().mockResolvedValue(true);
    const result = await runDoctor({
      resolveCredentials: vi.fn().mockResolvedValue(FAKE_CREDS),
      pingBackend,
    });
    expect(result.exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.stringContaining('OK'),
      expect.stringContaining('baseUrl'),
      expect.stringContaining('backend: reachable'),
    ]));
    expect(pingBackend).toHaveBeenCalledWith(FAKE_CREDS);
  });

  it('fails clearly when credentials are missing', async () => {
    const result = await runDoctor({
      resolveCredentials: vi.fn().mockRejectedValue(new Error('Filepad hook credentials not found.')),
    });
    expect(result.exitCode).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.stringContaining('FAIL credentials'),
      expect.stringContaining('credentials not found'),
    ]));
  });

  it('redacts the secret value — never prints it in output', async () => {
    const result = await runDoctor({
      resolveCredentials: vi.fn().mockResolvedValue(FAKE_CREDS),
    });
    expect(result.exitCode).toBe(0);
    const outputText = result.lines.join('\n');
    expect(outputText).not.toContain('super_secret_value');
    expect(outputText).toContain('********');
  });

  it('reports unreachable backend without failing overall', async () => {
    const pingBackend = vi.fn().mockResolvedValue(false);
    const result = await runDoctor({
      resolveCredentials: vi.fn().mockResolvedValue(FAKE_CREDS),
      pingBackend,
    });
    expect(result.exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.stringContaining('WARN backend: unreachable'),
    ]));
  });

  it('reports ping failure as WARN without throwing', async () => {
    const pingBackend = vi.fn().mockRejectedValue(new Error('timeout'));
    const result = await runDoctor({
      resolveCredentials: vi.fn().mockResolvedValue(FAKE_CREDS),
      pingBackend,
    });
    expect(result.exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.stringContaining('WARN backend: ping failed'),
    ]));
  });

  it('prints baseUrl, workspaceId, keyId — but not full secret', async () => {
    const result = await runDoctor({
      resolveCredentials: vi.fn().mockResolvedValue(FAKE_CREDS),
    });
    const outputText = result.lines.join('\n');
    expect(outputText).toContain('https://api.filepad.ai');
    expect(outputText).toContain('ws_test');
    expect(outputText).toContain('ik_abc123');
    expect(outputText).not.toContain('super_secret_value');
  });
});
