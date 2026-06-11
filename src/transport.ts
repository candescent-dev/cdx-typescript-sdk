/**
 * HTTP transport — wires auth injection, retry, headers, and debug logging
 * on top of the native Fetch API.
 */

import type { TokenProvider } from "./auth.js";
import { CandescentError, errorForStatus, ConnectionError, RequestTimeoutError } from "./errors.js";
import { withRetry, type RetryConfig, DEFAULT_RETRY } from "./retry.js";

export interface RequestOptions {
  /** Override the default timeout for this request (ms). */
  timeout?: number;
  /** Override the default max retries for this request. */
  maxRetries?: number;
  /** Extra headers to send with this request. */
  headers?: Record<string, string>;
  /** Signal for aborting the request. */
  signal?: AbortSignal;
  /**
   * Institution customer ID — required for Business Banking endpoints
   * when acting on behalf of a specific business location.
   */
  institutionCustomerId?: string;
  /**
   * User context for client_credentials grant.
   * Many endpoints require either hostUserId or loginId when the token
   * was obtained via client_credentials (server-to-server) to identify
   * which end-user the operation is on behalf of.
   * With password grant tokens this is embedded in the token itself.
   */
  hostUserId?: string;
  /** Alternative to hostUserId — cannot use both simultaneously. */
  loginId?: string;
}

export interface TransportConfig {
  baseUrl: string;
  institutionId: string;
  tokenProvider: TokenProvider;
  retry?: Partial<RetryConfig>;
  timeout?: number;
  userAgent?: string;
  debug?: boolean;
  fetch?: typeof globalThis.fetch;
  interceptors?: Array<(headers: Record<string, string>) => Record<string, string>>;
}

export class Transport {
  private readonly config: Required<
    Pick<TransportConfig, "baseUrl" | "institutionId" | "timeout" | "userAgent" | "debug">
  > & {
    tokenProvider: TokenProvider;
    retry: RetryConfig;
    fetch: typeof globalThis.fetch;
    interceptors: Array<(headers: Record<string, string>) => Record<string, string>>;
  };

  constructor(cfg: TransportConfig) {
    this.config = {
      baseUrl: cfg.baseUrl.replace(/\/$/, ""),
      institutionId: cfg.institutionId,
      tokenProvider: cfg.tokenProvider,
      retry: { ...DEFAULT_RETRY, ...cfg.retry },
      timeout: cfg.timeout ?? 30_000,
      userAgent: cfg.userAgent ?? "@cdx-forge/di-typescript-sdk/1.0.0",
      debug: cfg.debug ?? false,
      fetch: cfg.fetch ?? globalThis.fetch.bind(globalThis),
      interceptors: cfg.interceptors ?? [],
    };
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      query?: Record<string, unknown>;
      options?: RequestOptions;
    },
  ): Promise<T> {
    const { body, query, options = {} } = opts ?? {};

    const mergedQuery = { ...query };
    if (options.hostUserId) mergedQuery.hostUserId = options.hostUserId;
    if (options.loginId) mergedQuery.loginId = options.loginId;

    let url = this.config.baseUrl + path;
    if (mergedQuery) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(mergedQuery)) {
        if (v != null) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += "?" + qs;
    }

    const headers = await this.buildHeaders(options);

    const effectiveTimeout = options.timeout ?? this.config.timeout;
    const effectiveRetry: RetryConfig = {
      ...this.config.retry,
      ...(options.maxRetries != null ? { maxRetries: options.maxRetries } : {}),
    };

    const doFetch = async (): Promise<Response> => {
      const controller = new AbortController();
      const signal = options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;
      const timer = setTimeout(() => controller.abort(), effectiveTimeout);

      const init: RequestInit = { method, headers, signal };
      if (body !== undefined) {
        init.body = typeof body === "string" ? body : JSON.stringify(body);
      }

      if (this.config.debug) {
        const safeHeaders = { ...headers };
        delete safeHeaders["Authorization"];
        console.debug(`[candescent] ${method} ${url}`, safeHeaders);
      }

      try {
        const start = performance.now();
        const resp = await this.config.fetch(url, init);
        if (this.config.debug) {
          console.debug(
            `[candescent] ${method} ${url} -> ${resp.status} (${Math.round(performance.now() - start)}ms)`,
          );
        }
        return resp;
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") {
          throw new RequestTimeoutError(`Request timed out after ${effectiveTimeout}ms`);
        }
        throw new ConnectionError(e instanceof Error ? e.message : String(e));
      } finally {
        clearTimeout(timer);
      }
    };

    const response = await withRetry(doFetch, effectiveRetry);
    if (!response.ok) {
      const text = await response.text();
      throw errorForStatus(response.status, response.headers, text, response);
    }

    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new CandescentError(`Response is not valid JSON: ${text.slice(0, 300)}`);
    }
  }

  /** Build merged headers (defaults + auth + interceptors + per-op). */
  private async buildHeaders(options: RequestOptions): Promise<Record<string, string>> {
    const token = await this.config.tokenProvider.getToken();
    let headers: Record<string, string> = {
      "User-Agent": this.config.userAgent,
      Accept: "application/json",
      "Content-Type": "application/json",
      institutionId: this.config.institutionId,
      transactionid: crypto.randomUUID(),
      Authorization: `${token.tokenType} ${token.token}`,
    };
    if (options.institutionCustomerId) {
      headers["institutionCustomerId"] = options.institutionCustomerId;
    }
    for (const interceptor of this.config.interceptors) {
      headers = interceptor(headers);
    }
    if (options.headers) Object.assign(headers, options.headers);
    return headers;
  }
}
