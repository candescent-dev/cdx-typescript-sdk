/**
 * OAuth 2.0 token providers for V1 (legacy) and V2 (current) endpoints.
 *
 * Handles token acquisition, caching, automatic refresh, and revocation.
 * Supports client_credentials, password, refresh_token, and static token flows.
 */

import { CandescentError, errorForStatus } from "./errors.js";

function assertCandescentBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new CandescentError("Invalid API base URL");
  }
  if (parsed.protocol !== "https:") {
    throw new CandescentError("API base URL must use HTTPS");
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "api.candescent.com" && !host.endsWith(".candescent.com")) {
    throw new CandescentError(`Disallowed API base URL host: ${parsed.hostname}`);
  }
  return normalized;
}

export enum TokenEndpoint {
  V1_LEGACY = "/v1/oauth/token",
  V2_CURRENT = "/oauth2/v1/token",
}

export interface AccessToken {
  token: string;
  expiresAt: number;
  tokenType: string;
  refreshToken?: string;
  scope?: string;
}

export interface TokenProvider {
  getToken(): Promise<AccessToken>;
  refreshToken(): Promise<AccessToken>;
  revokeToken?(): Promise<void>;
  endpoint: TokenEndpoint;
}

export class ClientCredentialsProvider implements TokenProvider {
  private cached: AccessToken | null = null;
  private refreshing: Promise<AccessToken> | null = null;
  readonly endpoint: TokenEndpoint;
  protected readonly baseUrl: string;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    protected readonly institutionId: string,
    baseUrl: string,
    endpoint?: TokenEndpoint,
  ) {
    this.endpoint = endpoint ?? TokenEndpoint.V2_CURRENT;
    this.baseUrl = assertCandescentBaseUrl(baseUrl);
  }

  async getToken(): Promise<AccessToken> {
    if (this.cached && Date.now() < this.cached.expiresAt - 30_000) {
      return this.cached;
    }
    return this.refreshToken();
  }

  async refreshToken(): Promise<AccessToken> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.fetchToken("grant_type=client_credentials");
    try {
      this.cached = await this.refreshing;
      return this.cached;
    } finally {
      this.refreshing = null;
    }
  }

  async revokeToken(): Promise<void> {
    if (!this.cached || this.endpoint !== TokenEndpoint.V2_CURRENT) return;
    const safeBase = assertCandescentBaseUrl(this.baseUrl);
    try {
      await fetch(`${safeBase}/oauth2/v1/revoke`, {
        method: "DELETE",
        headers: {
          Authorization: this.basicAuth(),
          "Content-Type": "application/x-www-form-urlencoded",
          institutionId: this.institutionId,
          transactionid: crypto.randomUUID(),
        },
        body: `token=${encodeURIComponent(this.cached.token)}`,
      });
    } catch {
      // best-effort
    }
    this.cached = null;
  }

  protected fiHeader(): string {
    return this.endpoint === TokenEndpoint.V1_LEGACY ? "di_fiid" : "institutionId";
  }

  protected async fetchToken(body: string): Promise<AccessToken> {
    const safeBase = assertCandescentBaseUrl(this.baseUrl);
    const url = `${safeBase}${this.endpoint}`;
    const tidHeader = this.endpoint === TokenEndpoint.V1_LEGACY ? "di_tid" : "transactionid";
    const headers: Record<string, string> = {
      Authorization: this.basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
      [this.fiHeader()]: this.institutionId,
      [tidHeader]: crypto.randomUUID(),
    };
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 401 || resp.status === 403) {
        throw errorForStatus(resp.status, resp.headers, text, resp);
      }
      throw new CandescentError(`Token request failed (HTTP ${resp.status})`);
    }

    const text = await resp.text();
    const contentType = resp.headers.get("content-type") ?? "";

    if (contentType.includes("xml") || (this.endpoint === TokenEndpoint.V1_LEGACY && text.trimStart().startsWith("<"))) {
      return this.parseXmlToken(text);
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new CandescentError("Token response is not valid JSON");
    }
    if (!data.access_token) {
      throw new CandescentError("Token response missing access_token");
    }
    return {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in) || 1800) * 1000,
      tokenType: data.token_type ?? "Bearer",
      refreshToken: data.refresh_token,
      scope: data.scope,
    };
  }

  private parseXmlToken(xml: string): AccessToken {
    const extract = (tag: string): string | undefined => {
      const open = `<${tag}>`;
      const close = `</${tag}>`;
      const start = xml.indexOf(open);
      if (start === -1) return undefined;
      const valueStart = start + open.length;
      const end = xml.indexOf(close, valueStart);
      if (end === -1) return undefined;
      return xml.slice(valueStart, end);
    };
    const token = extract("access_token");
    if (!token) {
      throw new CandescentError("V1 token response missing <access_token>");
    }
    const expiresIn = Number.parseInt(extract("expires_in") ?? "1800", 10);
    return {
      token,
      expiresAt: Date.now() + expiresIn * 1000,
      tokenType: "Bearer",
    };
  }

  protected basicAuth(): string {
    return (
      "Basic " +
      Buffer.from(this.clientId + ":" + this.clientSecret, "utf8").toString("base64")
    );
  }
}

/**
 * OAuth 2.0 password (ROPC) grant for end-user authentication.
 *
 * Attempts refresh_token grant before falling back to a fresh password grant.
 *
 * @example
 * ```ts
 * const provider = new PasswordGrantProvider(
 *   "client-id", "secret", "user", "pass", "12345", baseUrl,
 * );
 * ```
 */
export class PasswordGrantProvider extends ClientCredentialsProvider {
  private pwCached: AccessToken | null = null;
  private pwRefreshing: Promise<AccessToken> | null = null;

  constructor(
    clientId: string,
    clientSecret: string,
    private readonly username: string,
    private readonly password: string,
    institutionId: string,
    baseUrl: string,
    endpoint?: TokenEndpoint,
  ) {
    super(clientId, clientSecret, institutionId, baseUrl, endpoint);
  }

  override async getToken(): Promise<AccessToken> {
    if (this.pwCached && Date.now() < this.pwCached.expiresAt - 30_000) {
      return this.pwCached;
    }
    return this.refreshToken();
  }

  override async refreshToken(): Promise<AccessToken> {
    if (this.pwRefreshing) return this.pwRefreshing;
    this.pwRefreshing = this.doRefresh();
    try {
      this.pwCached = await this.pwRefreshing;
      return this.pwCached;
    } finally {
      this.pwRefreshing = null;
    }
  }

  private async doRefresh(): Promise<AccessToken> {
    if (this.pwCached?.refreshToken) {
      try {
        return await this.fetchToken(
          `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.pwCached.refreshToken)}`,
        );
      } catch {
        // fall through to password grant
      }
    }
    return this.fetchToken(
      `grant_type=password&username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`,
    );
  }

  override async revokeToken(): Promise<void> {
    if (!this.pwCached || this.endpoint !== TokenEndpoint.V2_CURRENT) {
      this.pwCached = null;
      this.pwRefreshing = null;
      return;
    }
    const safeBase = assertCandescentBaseUrl(this.baseUrl);
    try {
      await fetch(`${safeBase}/oauth2/v1/revoke`, {
        method: "DELETE",
        headers: {
          Authorization: this.basicAuth(),
          "Content-Type": "application/x-www-form-urlencoded",
          institutionId: this.institutionId,
          transactionid: crypto.randomUUID(),
        },
        body: `token=${encodeURIComponent(this.pwCached.token)}`,
      });
    } catch {
      // best-effort
    }
    this.pwCached = null;
    this.pwRefreshing = null;
  }
}

/** Wraps a pre-obtained bearer token (e.g. from CANDESCENT_BEARER_TOKEN). */
export class StaticTokenProvider implements TokenProvider {
  readonly endpoint = TokenEndpoint.V2_CURRENT;
  private readonly token: AccessToken;

  constructor(bearerToken: string) {
    this.token = {
      token: bearerToken,
      expiresAt: Date.now() + 86_400_000,
      tokenType: "Bearer",
    };
  }

  async getToken(): Promise<AccessToken> {
    return this.token;
  }
  async refreshToken(): Promise<AccessToken> {
    return this.token;
  }
}
