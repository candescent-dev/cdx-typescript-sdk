/**
 * Retry with jittered exponential backoff.
 *
 * Supports per-operation override via RequestOptions.maxRetries.
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
};

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function jitterMs(maxMs: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] / 0x1_0000_0000) * maxMs;
}

function exponentialBackoffDelay(attempt: number, config: RetryConfig): number {
  return Math.min(
    config.baseDelayMs * 2 ** attempt + jitterMs(config.baseDelayMs),
    config.maxDelayMs,
  );
}

function delayFromRetryAfter(
  retryAfter: string | null,
  attempt: number,
  config: RetryConfig,
): number {
  if (!retryAfter) return exponentialBackoffDelay(attempt, config);
  const seconds = Number.parseFloat(retryAfter);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, config.maxDelayMs);
  }
  return exponentialBackoffDelay(attempt, config);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function withRetry(
  fn: () => Promise<Response>,
  config: RetryConfig,
): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fn();
    } catch (err) {
      lastError = err;
      if (attempt < config.maxRetries) {
        await sleep(exponentialBackoffDelay(attempt, config));
        continue;
      }
      throw lastError;
    }

    if (!RETRYABLE_STATUS.has(response.status)) return response;

    lastResponse = response;
    if (attempt < config.maxRetries) {
      const delay = delayFromRetryAfter(
        response.headers.get("Retry-After"),
        attempt,
        config,
      );
      await sleep(delay);
    }
  }
  return lastResponse!;
}
