/**
 * Main Candescent DI TypeScript SDK client.
 *
 * Wraps OpenAPI-generated API classes with automatic auth injection,
 * tracing headers, and token lifecycle management. Generated API methods
 * have clean signatures with typed models — no raw JSON.
 *
 * @example Client credentials (server-to-server)
 * ```ts
 * import { CandescentClient, Environment } from "@cdx-forge/di-typescript-sdk";
 *
 * const client = new CandescentClient({
 *   clientId: "my-id",
 *   clientSecret: "my-secret",
 *   institutionId: "12345",
 *   environment: Environment.Stage,  // https://api.stage.candescent.com
 * });
 *
 * // Register a customer with typed models
 * const result = await client.registrationAndAccess.register({
 *   diFiid: "05523",
 *   fICustomer: { fiId: { value: "05523" }, memberNumber: "123456789", ... },
 * });
 *
 * // List accounts (hostUserId and loginId are mutually exclusive — pass one, not both)
 * const accounts = await client.accounts.list({ hostUserId: "HOST01" });
 *
 * await client.close();
 * ```
 *
 * @example From environment variables
 * ```ts
 * const client = CandescentClient.fromEnv();
 * ```
 */

import {
  ClientCredentialsProvider,
  PasswordGrantProvider,
  StaticTokenProvider,
  type TokenProvider,
  TokenEndpoint,
} from "./auth.js";
import { CandescentError, errorForStatus } from "./errors.js";
import { validateUrlParams } from "./validate.js";
import { DEFAULT_RETRY, withRetry } from "./retry.js";

import {
  Configuration,
  type Middleware,
  type ResponseContext,
} from "@cdx-forge/di-typescript-sdk/dist/generated/src/runtime.js";
import {
  AccountsApi,
  AudienceApi,
  BankingActivitiesApi,
  ContactInfoApi,
  DataApi,
  ElectronicStatementsApi,
  EntitlementsApi,
  ExperienceGroupsApi,
  HistoryAndEventsApi,
  ImagesApi,
  InstitutionAlertsApi,
  InstitutionDisclosuresApi,
  InstitutionPreferencesApi,
  JobsApi,
  NotificationChannelsApi,
  OAuthV1Api,
  OAuthV2Api,
  PaymentsApi,
  ProfileApi,
  ProfileAndStatusApi,
  PromotionsSuiteApi,
  RecipientsApi,
  RegistrationApi,
  RegistrationAndAccessApi,
  SystemAlertsApi,
  TemplatesApi,
  TransactionsApi,
  TransfersApi,
  UserDisclosuresApi,
  UserPreferencesApi,
  UsersApi,
  WidgetsApi,
} from "@cdx-forge/di-typescript-sdk/dist/generated/src/apis/index.js";

export { type RequestOptions } from "./transport.js";

export enum Environment {
  Sandbox = "https://api.sandbox.candescent.com",
  Stage = "https://api.stage.candescent.com",
  Production = "https://api.candescent.com",
}

export interface ClientConfig {
  clientId?: string;
  clientSecret?: string;
  institutionId: string;
  username?: string;
  password?: string;
  environment?: Environment;
  baseUrl?: string;
  bearerToken?: string;
  /** Provide a custom token provider; used for both V1 and V2 paths. */
  tokenProvider?: TokenProvider;
  debug?: boolean;
}

/**
 * URL path segments that require a V1 (legacy) OAuth token.
 * In spec 1.6.0, all V1 legacy paths contain `/fis/` (subscriptions,
 * notifications, registration, get-FI-customer, legacy accounts).
 * The V1 OAuth token endpoint path is also explicitly listed.
 * All other paths use V2 (current) tokens.
 */
const V1_PATH_SEGMENTS = [
  "/fis/",
  "/v1/oauth/token",
] as const;

function isV1Path(url: string): boolean {
  return V1_PATH_SEGMENTS.some((seg) => url.includes(seg));
}

// ── XML → JSON transparent conversion ───────────────────────────────
// Several Candescent endpoints (registration, bankingservices) return
// XML regardless of the Accept header. The generated runtime assumes
// JSON, so we intercept XML responses in a `post` middleware and
// convert them to JSON transparently.

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&apos;": "'",
  "&quot;": '"',
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;|&lt;|&gt;|&apos;|&quot;/g, (m) => XML_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function stripCdata(s: string): string {
  let result = "";
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("<![CDATA[", i)) {
      const start = i + 9;
      const end = s.indexOf("]]>", start);
      if (end === -1) break;
      result += s.slice(start, end);
      i = end + 3;
      continue;
    }
    result += s[i++];
  }
  return result;
}

function stripXmlComments(s: string): string {
  let result = "";
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("<!--", i)) {
      const end = s.indexOf("-->", i + 4);
      i = end === -1 ? s.length : end + 3;
      continue;
    }
    result += s[i++];
  }
  return result;
}

function stripXmlDeclaration(s: string): string {
  if (!s.startsWith("<?xml")) return s;
  const end = s.indexOf("?>");
  if (end === -1) return s;
  let i = end + 2;
  while (i < s.length && /\s/.test(s[i]!)) i++;
  return s.slice(i);
}

/**
 * Check if a parent element name is the plural/collection form of a
 * child name, meaning the child should always be an array.
 * Handles: channelInfos→channelInfo, destinations→destination,
 * postalAddresses→postalAddress, phoneNumbers→phoneNumber, etc.
 */
function isCollectionParent(parentKey: string, childKey: string): boolean {
  const p = parentKey.toLowerCase();
  const c = childKey.toLowerCase();
  return (
    p === c + "s" ||
    p === c + "es" ||
    (c.endsWith("y") && p === c.slice(0, -1) + "ies") ||
    (p.endsWith("s") && p.startsWith(c))
  );
}

function normalizeArrays(obj: any, parentKey?: string): any {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => normalizeArrays(item));

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    let normalized = normalizeArrays(value, key);
    if (parentKey && isCollectionParent(parentKey, key) && !Array.isArray(normalized)) {
      normalized = [normalized];
    }
    result[key] = normalized;
  }
  return result;
}

type XmlNode = { tag: string; children: Record<string, any>; text: string };

type XmlParseState = {
  stack: XmlNode[];
  root: Record<string, any>;
  current: XmlNode | null;
};

function localXmlTagName(tag: string): string {
  return tag.includes(":") ? tag.split(":").pop()! : tag;
}

function setChildValue(parent: XmlNode, key: string, value: any): void {
  if (key in parent.children) {
    const existing = parent.children[key];
    parent.children[key] = Array.isArray(existing)
      ? [...existing, value]
      : [existing, value];
  } else {
    parent.children[key] = value;
  }
}

function handleXmlText(state: XmlParseState, text: string): void {
  if (state.current) {
    state.current.text += decodeXmlEntities(text.trim());
  }
}

function handleXmlCloseTag(state: XmlParseState): void {
  if (!state.current) return;

  const key = localXmlTagName(state.current.tag);
  const hasChildren = Object.keys(state.current.children).length > 0;
  const value: any = hasChildren ? state.current.children : (state.current.text || null);

  const parent = state.stack.pop();
  if (parent) {
    setChildValue(parent, key, value);
    state.current = parent;
  } else {
    state.root[key] = value;
    state.current = null;
  }
}

function handleXmlOpenTag(state: XmlParseState, tag: string): void {
  const node: XmlNode = { tag, children: {}, text: "" };
  if (state.current) state.stack.push(state.current);
  state.current = node;
}

function handleXmlSelfClosingTag(state: XmlParseState, tag: string): void {
  const key = localXmlTagName(tag);
  if (state.current) {
    state.current.children[key] = null;
  } else {
    state.root[key] = null;
  }
}

function parseXmlTagName(tag: string): string | undefined {
  const nameStart = tag.startsWith("</") ? 2 : 1;
  let i = nameStart;
  while (i < tag.length && tag[i] !== " " && tag[i] !== ">" && tag[i] !== "/") i++;
  const name = tag.slice(nameStart, i);
  return name.length > 0 ? name : undefined;
}

function readXmlTag(processed: string, start: number): { end: number; full: string } | null {
  const close = processed.indexOf(">", start + 1);
  if (close === -1) return null;
  return { end: close + 1, full: processed.slice(start, close + 1) };
}

function processXmlTagToken(state: XmlParseState, full: string): void {
  if (full.startsWith("<!--") || full.startsWith("<![")) return;
  const tagName = parseXmlTagName(full);
  if (!tagName) return;
  if (full.startsWith("</")) {
    handleXmlCloseTag(state);
  } else if (full.endsWith("/>")) {
    handleXmlSelfClosingTag(state, tagName);
  } else {
    handleXmlOpenTag(state, tagName);
  }
}

function parseXmlToJson(xml: string): Record<string, any> {
  const processed = stripXmlDeclaration(stripXmlComments(stripCdata(xml)));
  const state: XmlParseState = { stack: [], root: {}, current: null };
  let i = 0;

  while (i < processed.length) {
    if (processed[i] === "<") {
      const tag = readXmlTag(processed, i);
      if (!tag) break;
      i = tag.end;
      processXmlTagToken(state, tag.full);
      continue;
    }

    const nextTag = processed.indexOf("<", i);
    const textEnd = nextTag === -1 ? processed.length : nextTag;
    handleXmlText(state, processed.slice(i, textEnd));
    i = textEnd;
  }

  return normalizeArrays(state.root);
}

/**
 * Middleware that converts XML responses into JSON transparently.
 * If a response has an XML content-type, the body is parsed and a new
 * Response with `application/json` is returned so the generated
 * `JSONApiResponse.value()` works correctly.
 *
 * When the XML has a single root element, the converted JSON includes
 * BOTH the wrapped form (root key → children) and the unwrapped children
 * at the top level. This ensures compatibility with both transformer
 * styles: some expect `{FICustomer: {...}}` while others expect the
 * inner fields directly.
 */
const xmlToJsonMiddleware: Pick<Middleware, "post"> = {
  async post(context: ResponseContext): Promise<Response | void> {
    const ct = context.response.headers.get("content-type") ?? "";
    if (!ct.includes("xml")) return;

    const text = await context.response.text();
    let json: any;
    try {
      json = parseXmlToJson(text);
    } catch {
      return new Response(text, {
        status: context.response.status,
        statusText: context.response.statusText,
        headers: context.response.headers,
      });
    }

    // If the XML had a single root element, merge its children at the
    // top level so both wrapped and unwrapped transformers can find data.
    const keys = Object.keys(json);
    if (keys.length === 1 && typeof json[keys[0]] === "object" && json[keys[0]] !== null) {
      json = { ...json[keys[0]], ...json };
    }

    return new Response(JSON.stringify(json), {
      status: context.response.status,
      statusText: context.response.statusText,
      headers: {
        ...Object.fromEntries(context.response.headers.entries()),
        "content-type": "application/json",
        "x-original-content-type": ct,
      },
    });
  },
};

/**
 * Middleware that intercepts non-2xx responses and throws a rich ApiError
 * (with status, body, headers) instead of the generated ResponseError
 * which only says "Response returned an error code".
 */
const errorBodyMiddleware: Pick<Middleware, "post"> = {
  async post(context: ResponseContext): Promise<Response | void> {
    const { response } = context;
    if (response.ok) return;

    const body = await response.text();
    let message = `${response.status} ${response.statusText}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed.message) message = `${message}: ${parsed.message}`;
      if (parsed.code) message = `[${parsed.code}] ${message}`;
    } catch {
      if (body) message = `${message}\n${body}`;
    }

    throw errorForStatus(
      response.status,
      response.headers,
      body,
      new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    );
  },
};

export class CandescentClient {
  private readonly v2TokenProvider: TokenProvider;
  private readonly v1TokenProvider: TokenProvider;

  readonly accounts: AccountsApi;
  readonly audience: AudienceApi;
  readonly bankingActivities: BankingActivitiesApi;
  readonly contactInfo: ContactInfoApi;
  readonly data: DataApi;
  readonly electronicStatements: ElectronicStatementsApi;
  readonly entitlements: EntitlementsApi;
  readonly experienceGroups: ExperienceGroupsApi;
  readonly historyAndEvents: HistoryAndEventsApi;
  readonly images: ImagesApi;
  readonly institutionAlerts: InstitutionAlertsApi;
  readonly institutionDisclosures: InstitutionDisclosuresApi;
  readonly institutionPreferences: InstitutionPreferencesApi;
  readonly jobs: JobsApi;
  readonly notificationChannels: NotificationChannelsApi;
  readonly oAuthV1: OAuthV1Api;
  readonly oAuthV2: OAuthV2Api;
  readonly payments: PaymentsApi;
  readonly profile: ProfileApi;
  readonly profileAndStatus: ProfileAndStatusApi;
  readonly promotionsSuite: PromotionsSuiteApi;
  readonly recipients: RecipientsApi;
  readonly registration: RegistrationApi;
  readonly registrationAndAccess: RegistrationAndAccessApi;
  readonly systemAlerts: SystemAlertsApi;
  readonly templates: TemplatesApi;
  readonly transactions: TransactionsApi;
  readonly transfers: TransfersApi;
  readonly userDisclosures: UserDisclosuresApi;
  readonly userPreferences: UserPreferencesApi;
  readonly users: UsersApi;
  readonly widgets: WidgetsApi;

  constructor(config: ClientConfig) {
    const baseUrl = config.baseUrl ?? config.environment ?? Environment.Stage;
    const institutionId = config.institutionId;

    if (config.tokenProvider) {
      this.v2TokenProvider = config.tokenProvider;
      this.v1TokenProvider = config.tokenProvider;
    } else if (config.bearerToken) {
      const staticProvider = new StaticTokenProvider(config.bearerToken);
      this.v2TokenProvider = staticProvider;
      this.v1TokenProvider = staticProvider;
    } else if (config.clientId && config.clientSecret && config.username && config.password) {
      this.v2TokenProvider = new PasswordGrantProvider(
        config.clientId, config.clientSecret,
        config.username, config.password,
        institutionId, baseUrl, TokenEndpoint.V2_CURRENT,
      );
      this.v1TokenProvider = new PasswordGrantProvider(
        config.clientId, config.clientSecret,
        config.username, config.password,
        institutionId, baseUrl, TokenEndpoint.V1_LEGACY,
      );
    } else if (config.clientId && config.clientSecret) {
      this.v2TokenProvider = new ClientCredentialsProvider(
        config.clientId, config.clientSecret,
        institutionId, baseUrl, TokenEndpoint.V2_CURRENT,
      );
      this.v1TokenProvider = new ClientCredentialsProvider(
        config.clientId, config.clientSecret,
        institutionId, baseUrl, TokenEndpoint.V1_LEGACY,
      );
    } else {
      throw new CandescentError(
        "Provide clientId+clientSecret, bearerToken, or a custom tokenProvider",
      );
    }

    const v2tp = this.v2TokenProvider;
    const v1tp = this.v1TokenProvider;
    const debugMode = config.debug ?? false;

    const dualTokenMiddleware: Middleware = {
      async pre(context) {
        const isV1 = isV1Path(context.url);
        const tp = isV1 ? v1tp : v2tp;
        const token = await tp.getToken();
        const uuid = crypto.randomUUID();
        const tidKey = isV1 ? "di_tid" : "transactionId";
        const headers: Record<string, string> = {
          Accept: "application/json",
          ...(context.init.headers as Record<string, string>),
          Authorization: `${token.tokenType} ${token.token}`,
          [tidKey]: uuid,
          correlationId: uuid,
          institutionId,
        };
        if (debugMode) {
          const method = context.init.method ?? "GET";
          const safeHeaders = { ...headers };
          delete safeHeaders["Authorization"];
          console.debug(`[candescent] ${method} ${context.url}`, safeHeaders);
        }
        return { url: context.url, init: { ...context.init, headers } };
      },
      async post(context) {
        if (debugMode) {
          const { response } = context;
          console.debug(`[candescent] ${response.status} ${response.statusText} ${context.url}`);
        }
        return undefined;
      },
    };

    const paramValidationMiddleware: Pick<Middleware, "pre"> = {
      async pre(context) {
        validateUrlParams(context.url);
        return undefined;
      },
    };

    const generatedConfig = new Configuration({
      basePath: baseUrl,
      fetchApi: (url: string, init: RequestInit) =>
        withRetry(() => fetch(url, init), DEFAULT_RETRY),
      middleware: [
        paramValidationMiddleware as Middleware,
        dualTokenMiddleware,
        xmlToJsonMiddleware as Middleware,
        errorBodyMiddleware as Middleware,
      ],
    });

    this.accounts = new AccountsApi(generatedConfig);
    this.audience = new AudienceApi(generatedConfig);
    this.bankingActivities = new BankingActivitiesApi(generatedConfig);
    this.contactInfo = new ContactInfoApi(generatedConfig);
    this.data = new DataApi(generatedConfig);
    this.electronicStatements = new ElectronicStatementsApi(generatedConfig);
    this.entitlements = new EntitlementsApi(generatedConfig);
    this.experienceGroups = new ExperienceGroupsApi(generatedConfig);
    this.historyAndEvents = new HistoryAndEventsApi(generatedConfig);
    this.images = new ImagesApi(generatedConfig);
    this.institutionAlerts = new InstitutionAlertsApi(generatedConfig);
    this.institutionDisclosures = new InstitutionDisclosuresApi(generatedConfig);
    this.institutionPreferences = new InstitutionPreferencesApi(generatedConfig);
    this.jobs = new JobsApi(generatedConfig);
    this.notificationChannels = new NotificationChannelsApi(generatedConfig);
    this.oAuthV1 = new OAuthV1Api(generatedConfig);
    this.oAuthV2 = new OAuthV2Api(generatedConfig);
    this.payments = new PaymentsApi(generatedConfig);
    this.profile = new ProfileApi(generatedConfig);
    this.profileAndStatus = new ProfileAndStatusApi(generatedConfig);
    this.promotionsSuite = new PromotionsSuiteApi(generatedConfig);
    this.recipients = new RecipientsApi(generatedConfig);
    this.registration = new RegistrationApi(generatedConfig);
    this.registrationAndAccess = new RegistrationAndAccessApi(generatedConfig);
    this.systemAlerts = new SystemAlertsApi(generatedConfig);
    this.templates = new TemplatesApi(generatedConfig);
    this.transactions = new TransactionsApi(generatedConfig);
    this.transfers = new TransfersApi(generatedConfig);
    this.userDisclosures = new UserDisclosuresApi(generatedConfig);
    this.userPreferences = new UserPreferencesApi(generatedConfig);
    this.users = new UsersApi(generatedConfig);
    this.widgets = new WidgetsApi(generatedConfig);
  }

  async close(): Promise<void> {
    for (const tp of [this.v2TokenProvider, this.v1TokenProvider]) {
      if (tp.revokeToken) {
        try { await tp.revokeToken(); } catch { /* best-effort */ }
      }
    }
  }

  /**
   * Build a client from environment variables (zero hardcoded secrets).
   *
   * Reads:
   * - `CANDESCENT_CLIENT_ID`
   * - `CANDESCENT_CLIENT_SECRET`
   * - `CANDESCENT_INSTITUTION_ID`
   * - `CANDESCENT_BEARER_TOKEN` (skip OAuth entirely)
   * - `CANDESCENT_ENVIRONMENT` ("sandbox" | "stage" | "production"; defaults to stage)
   * - `CANDESCENT_USERNAME` (optional, for password grant)
   * - `CANDESCENT_PASSWORD` (optional, for password grant)
   */
  static fromEnv(): CandescentClient {
    const env = (k: string) => process.env[k];
    const clientId = env("CANDESCENT_CLIENT_ID");
    const clientSecret = env("CANDESCENT_CLIENT_SECRET");
    const institutionId = env("CANDESCENT_INSTITUTION_ID");
    const bearerToken = env("CANDESCENT_BEARER_TOKEN");
    const envName = env("CANDESCENT_ENVIRONMENT")?.toLowerCase();
    const username = env("CANDESCENT_USERNAME");
    const password = env("CANDESCENT_PASSWORD");

    if (!institutionId) {
      throw new CandescentError("CANDESCENT_INSTITUTION_ID is required");
    }
    if (!bearerToken && !(clientId && clientSecret)) {
      throw new CandescentError(
        "Set CANDESCENT_BEARER_TOKEN or both CANDESCENT_CLIENT_ID and CANDESCENT_CLIENT_SECRET",
      );
    }

    const environment =
      envName === "production"
        ? Environment.Production
        : envName === "sandbox"
          ? Environment.Sandbox
          : Environment.Stage;

    return new CandescentClient({
      clientId,
      clientSecret,
      institutionId,
      bearerToken,
      username,
      password,
      environment,
    });
  }
}
