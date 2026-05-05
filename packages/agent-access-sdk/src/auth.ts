// FILE MEMO: HMAC-SHA256 request signing for Filepad Agent Access.
// Canonical string: METHOD\npathWithQuery\ntimestampSeconds\nnonce\nsha256(rawBody)

import { createHash, createHmac, randomUUID } from 'node:crypto';

/**
 * Serialize a request body into the canonical string representation.
 * - undefined/null → ''
 * - string → used as-is
 * - object → JSON.stringify with standard compact formatting
 */
export function serializeBody(body: unknown): string {
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  return JSON.stringify(body);
}

/**
 * Compute SHA-256 hex digest of a string.
 */
export function sha256Hex(data: string): string {
  return createHash('sha256').update(Buffer.from(data, 'utf8')).digest('hex');
}

/**
 * Build the canonical signing string.
 */
export function buildCanonicalString(params: {
  method: string;
  pathWithQuery: string;
  timestampSeconds: string;
  nonce: string;
  rawBody: string;
}): string {
  const bodyHash = sha256Hex(params.rawBody);
  return [
    params.method.toUpperCase(),
    params.pathWithQuery,
    params.timestampSeconds,
    params.nonce,
    bodyHash,
  ].join('\n');
}

/**
 * Sign a Filepad Agent Access request.
 *
 * @param keyId     The integration key id (ik_...)
 * @param secret    The plaintext secret
 * @param method    HTTP method in any case
 * @param pathWithQuery Full path including query string, exactly as sent
 * @param body      Optional request body
 * @returns Headers and raw body to send
 */
export function signRequest(
  keyId: string,
  secret: string,
  method: string,
  pathWithQuery: string,
  body?: unknown,
): { headers: Record<string, string>; rawBody: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const rawBody = serializeBody(body);

  const canonical = buildCanonicalString({
    method,
    pathWithQuery,
    timestampSeconds: timestamp,
    nonce,
    rawBody,
  });

  const signature = createHmac('sha256', secret)
    .update(canonical, 'utf8')
    .digest('base64');

  return {
    rawBody,
    headers: {
      'content-type': 'application/json',
      'x-integration-key-id': keyId,
      'x-integration-timestamp': timestamp,
      'x-integration-nonce': nonce,
      'x-integration-signature': signature,
    },
  };
}
