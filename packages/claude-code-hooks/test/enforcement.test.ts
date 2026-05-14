// TEST CATEGORY: unit
import { describe, expect, it } from 'vitest';
import { resolveEnforcementMode, resolveOfflinePolicy } from '../src/enforcement.js';

describe('resolveEnforcementMode', () => {
  it('returns block by default when env is unset', () => {
    expect(resolveEnforcementMode({})).toBe('block');
  });

  it('returns block when env is set to block', () => {
    expect(resolveEnforcementMode({ FILEPAD_HOOK_ENFORCEMENT_MODE: 'block' })).toBe('block');
  });

  it('returns observe when env is set to observe', () => {
    expect(resolveEnforcementMode({ FILEPAD_HOOK_ENFORCEMENT_MODE: 'observe' })).toBe('observe');
  });

  it('returns off when env is set to off', () => {
    expect(resolveEnforcementMode({ FILEPAD_HOOK_ENFORCEMENT_MODE: 'off' })).toBe('off');
  });

  it('falls back to block for invalid values', () => {
    expect(resolveEnforcementMode({ FILEPAD_HOOK_ENFORCEMENT_MODE: 'invalid' })).toBe('block');
  });
});

describe('resolveOfflinePolicy', () => {
  it('returns allow by default', () => {
    expect(resolveOfflinePolicy({})).toBe('allow');
  });

  it('returns deny when set', () => {
    expect(resolveOfflinePolicy({ FILEPAD_HOOK_OFFLINE_POLICY: 'deny' })).toBe('deny');
  });

  it('returns allow for unknown values', () => {
    expect(resolveOfflinePolicy({ FILEPAD_HOOK_OFFLINE_POLICY: 'something' })).toBe('allow');
  });
});
