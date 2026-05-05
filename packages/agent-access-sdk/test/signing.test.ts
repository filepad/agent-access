// TEST CATEGORY: unit
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  signRequest,
  buildCanonicalString,
  serializeBody,
  sha256Hex,
} from '../src/auth.js';

function expectedSignature(params: {
  secret: string;
  method: string;
  pathWithQuery: string;
  timestamp: string;
  nonce: string;
  rawBody: string;
}): string {
  const bodyHash = createHash('sha256')
    .update(Buffer.from(params.rawBody, 'utf8'))
    .digest('hex');
  const canonical = [
    params.method.toUpperCase(),
    params.pathWithQuery,
    params.timestamp,
    params.nonce,
    bodyHash,
  ].join('\n');
  return createHmac('sha256', params.secret)
    .update(canonical, 'utf8')
    .digest('base64');
}

describe('auth', () => {
  describe('serializeBody', () => {
    it('returns empty string for undefined', () => {
      expect(serializeBody(undefined)).toBe('');
    });

    it('returns empty string for null', () => {
      expect(serializeBody(null)).toBe('');
    });

    it('returns string as-is', () => {
      expect(serializeBody('raw body')).toBe('raw body');
    });

    it('serializes objects with standard JSON stringify', () => {
      expect(serializeBody({ a: 1, b: 'two' })).toBe('{"a":1,"b":"two"}');
    });

    it('serializes nested objects deterministically', () => {
      expect(serializeBody({ a: { c: 2 }, b: 1 })).toBe('{"a":{"c":2},"b":1}');
    });
  });

  describe('sha256Hex', () => {
    it('matches known sha256 values', () => {
      expect(sha256Hex('hello')).toBe(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      );
    });

    it('returns hex for empty string', () => {
      expect(sha256Hex('')).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });
  });

  describe('buildCanonicalString', () => {
    it('formats exactly 5 lines separated by newlines', () => {
      const canonical = buildCanonicalString({
        method: 'GET',
        pathWithQuery: '/agent-api/v1/capabilities',
        timestampSeconds: '1234567890',
        nonce: 'nonce-1',
        rawBody: '',
      });
      const lines = canonical.split('\n');
      expect(lines).toHaveLength(5);
      expect(lines[0]).toBe('GET');
      expect(lines[1]).toBe('/agent-api/v1/capabilities');
      expect(lines[2]).toBe('1234567890');
      expect(lines[3]).toBe('nonce-1');
      expect(lines[4]).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });

    it('uppercases the method', () => {
      const canonical = buildCanonicalString({
        method: 'post',
        pathWithQuery: '/path',
        timestampSeconds: '1',
        nonce: 'n',
        rawBody: '',
      });
      expect(canonical.startsWith('POST')).toBe(true);
    });

    it('includes query strings in pathWithQuery', () => {
      const canonical = buildCanonicalString({
        method: 'GET',
        pathWithQuery: '/path?a=1&b=2',
        timestampSeconds: '1',
        nonce: 'n',
        rawBody: '',
      });
      expect(canonical).toContain('/path?a=1&b=2');
    });
  });

  describe('signRequest', () => {
    it('produces all 4 required headers', () => {
      const { headers } = signRequest(
        'ik_test',
        'secret_test',
        'GET',
        '/agent-api/v1/capabilities',
      );
      expect(headers['x-integration-key-id']).toBe('ik_test');
      expect(headers['x-integration-timestamp']).toMatch(/^\d+$/);
      expect(headers['x-integration-nonce']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(headers['x-integration-signature']).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(headers['content-type']).toBe('application/json');
    });

    it('signs GET with empty body hash', () => {
      const { headers, rawBody } = signRequest(
        'ik_test',
        'secret_test',
        'GET',
        '/agent-api/v1/capabilities',
      );
      expect(rawBody).toBe('');
      expect(headers['x-integration-signature']).toBe(
        expectedSignature({
          secret: 'secret_test',
          method: 'GET',
          pathWithQuery: '/agent-api/v1/capabilities',
          timestamp: headers['x-integration-timestamp']!,
          nonce: headers['x-integration-nonce']!,
          rawBody: '',
        }),
      );
    });

    it('signs POST with exact JSON body bytes', () => {
      const body = { title: 'Agent note', text: '# Hello' };
      const { headers, rawBody } = signRequest(
        'ik_test',
        'secret_test',
        'POST',
        '/agent-api/v1/workspaces/ws_1/artifacts',
        body,
      );
      expect(rawBody).toBe('{"title":"Agent note","text":"# Hello"}');
      expect(headers['x-integration-signature']).toBe(
        expectedSignature({
          secret: 'secret_test',
          method: 'POST',
          pathWithQuery: '/agent-api/v1/workspaces/ws_1/artifacts',
          timestamp: headers['x-integration-timestamp']!,
          nonce: headers['x-integration-nonce']!,
          rawBody,
        }),
      );
    });

    it('generates unique nonces across calls', () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const { headers } = signRequest(
          'ik_test',
          'secret_test',
          'GET',
          '/path',
        );
        nonces.add(headers['x-integration-nonce']!);
      }
      expect(nonces.size).toBe(100);
    });

    it('generates timestamps within the last second', () => {
      const before = Math.floor(Date.now() / 1000);
      const { headers } = signRequest(
        'ik_test',
        'secret_test',
        'GET',
        '/path',
      );
      const after = Math.floor(Date.now() / 1000);
      const ts = Number(headers['x-integration-timestamp']);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });
});
