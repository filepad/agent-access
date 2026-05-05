// FILE MEMO: Low-level typed HTTP wrappers for every Agent Access and MCP endpoint.

import { signRequest } from './auth.js';
import { fromResponse, FilepadAgentError } from './errors.js';
import type { FilepadAgentClientConfig, SignedRequest } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

export class FilepadAgentHttpClient {
  private readonly baseUrl: string;
  private readonly keyId: string;
  private readonly secret: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(config: FilepadAgentClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.keyId = config.keyId;
    this.secret = config.secret;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  private buildUrl(pathWithQuery: string): string {
    return `${this.baseUrl}${pathWithQuery}`;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async request<T>(
    method: string,
    pathWithQuery: string,
    body?: unknown,
  ): Promise<T> {
    const signed = signRequest(
      this.keyId,
      this.secret,
      method,
      pathWithQuery,
      body,
    );

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const init: RequestInit = {
          method: method.toUpperCase(),
          headers: signed.headers,
        };
        if (signed.rawBody.length > 0) {
          init.body = signed.rawBody;
        }
        const response = await this.fetchWithTimeout(
          this.buildUrl(pathWithQuery),
          init,
        );

        if (!response.ok) {
          const text = await response.text();
          let parsed: { error?: { code?: string; message?: string } } = {};
          try {
            parsed = JSON.parse(text);
          } catch {
            // raw text response
          }
          const code = parsed.error?.code ?? 'UNKNOWN';
          const message = (parsed.error?.message ?? text) || `HTTP ${response.status}`;
          const error = fromResponse(response.status, code, message);

          if (isRetryableStatus(response.status) && attempt < this.maxRetries) {
            lastError = error;
            const delay = this.retryDelayMs * 2 ** attempt;
            await sleep(delay);
            continue;
          }
          throw error;
        }

        if (response.status === 204) {
          return undefined as T;
        }
        return (await response.json()) as T;
      } catch (err) {
        if (err instanceof FilepadAgentError) throw err;
        if (err instanceof Error && err.name === 'AbortError') {
          throw new FilepadAgentError('TIMEOUT', `Request timed out after ${this.timeoutMs}ms`, 0);
        }
        if (attempt < this.maxRetries) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const delay = this.retryDelayMs * 2 ** attempt;
          await sleep(delay);
          continue;
        }
        throw lastError ?? err;
      }
    }
    throw lastError ?? new Error('Request failed after retries');
  }

  get<T>(pathWithQuery: string): Promise<T> {
    return this.request('GET', pathWithQuery);
  }

  post<T>(pathWithQuery: string, body?: unknown): Promise<T> {
    return this.request('POST', pathWithQuery, body);
  }
}
