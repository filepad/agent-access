// TEST CATEGORY: unit
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('loads all required env vars', () => {
    const config = loadConfig({
      FILEPAD_BASE_URL: 'https://api.filepad.ai',
      FILEPAD_WORKSPACE_ID: 'ws_test',
      FILEPAD_AGENT_KEY_ID: 'ik_test',
      FILEPAD_AGENT_SECRET: 'secret123',
    });
    expect(config.baseUrl).toBe('https://api.filepad.ai');
    expect(config.workspaceId).toBe('ws_test');
    expect(config.keyId).toBe('ik_test');
    expect(config.secret).toBe('secret123');
  });

  it('throws with missing env vars', () => {
    expect(() => loadConfig({})).toThrow(/Missing required environment variables/);
    expect(() => loadConfig({ FILEPAD_BASE_URL: 'x' })).toThrow(/FILEPAD_WORKSPACE_ID/);
  });
});
