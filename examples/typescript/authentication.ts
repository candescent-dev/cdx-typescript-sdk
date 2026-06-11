/**
 * Authentication operations example: V1 legacy token → auth-code flow → revoke.
 *
 * Matches the Postman/curl sequence:
 *   1. POST /v1/oauth/token (Basic + di_fiid/di_tid)
 *   2. POST /auth-code/v1/client-authorization (Bearer from step 1)
 *   3. POST /auth-code/v1/auth-code (Bearer from step 1; requires scopes,
 *      requested_scopes, client_id, username, institution_user_id, nonce)
 *   4. DELETE /oauth2/v1/revoke (Basic, revokes step 1 token)
 *
 * Step 3: `scopes` from step 2 ClientAuth; `requested_scopes` uses DEFAULT_REQUESTED_SCOPES.
 *
 * Complements the high-level token lifecycle in authentication-lifecycle.ts.
 *
 * Prerequisites:
 *   CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET, CANDESCENT_INSTITUTION_ID
 *   CANDESCENT_OIDC_CLIENT_ID — auth-code body `client_id` (differs from Basic auth client)
 *   CANDESCENT_HOST_USER_ID, CANDESCENT_INSTITUTION_USER_ID
 * Optional:
 *   CANDESCENT_APIGEE_BASE_URL (default: https://api.candescent.com/digitalbanking/stage)
 *   CANDESCENT_ENVIRONMENT ("stage" | "production") — used when APIGEE_BASE_URL unset
 *   CANDESCENT_AUTH_NONCE (default: candescent1234)
 *
 * Run: node --experimental-strip-types examples/typescript/authentication.ts
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENDPOINTS,
  assertCandescentHttpsBase,
  logEndpoint,
  maskSensitive,
  pretty,
  requireEnvVars,
  runExampleStep,
} from "./_helpers.ts";
import { loadRepoDotEnv } from "../../scripts/load-dotenv.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
Object.assign(process.env, loadRepoDotEnv(REPO_ROOT));

/** OIDC `requested_scopes` for POST /auth-code/v1/auth-code. */
const DEFAULT_REQUESTED_SCOPES = "openid,profile,offline_access";

interface V1Token {
  accessToken: string;
  expiresAt: number;
}

interface ClientAuth {
  scopes?: string;
  appId?: string;
  additional_info?: Record<string, unknown>;
}

interface AuthCode {
  code?: string;
  redirect_uri?: string;
}

function resolveApigeeBase(): string {
  const fromEnv = process.env.CANDESCENT_APIGEE_BASE_URL?.replace(/\/$/, "");
  const candidate =
    fromEnv ??
    (process.env.CANDESCENT_ENVIRONMENT?.toLowerCase() === "production"
      ? "https://api.candescent.com/digitalbanking"
      : "https://api.candescent.com/digitalbanking/stage");
  return assertCandescentHttpsBase(candidate);
}

function basicAuth(clientId: string, clientSecret: string): string {
  return (
    "Basic " +
    Buffer.from(clientId + ":" + clientSecret, "utf8").toString("base64")
  );
}

function extractXmlTag(xml: string, tag: string): string | undefined {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open);
  if (start === -1) return undefined;
  const valueStart = start + open.length;
  const end = xml.indexOf(close, valueStart);
  if (end === -1) return undefined;
  return xml.slice(valueStart, end);
}

function parseV1TokenResponse(text: string): V1Token {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) {
    const token = extractXmlTag(text, "access_token");
    if (!token) {
      throw new Error("V1 token response missing <access_token>");
    }
    const expiresIn = Number.parseInt(extractXmlTag(text, "expires_in") ?? "1800", 10);
    return { accessToken: token, expiresAt: Date.now() + expiresIn * 1000 };
  }
  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("V1 token response missing access_token");
  }
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 1800) * 1000,
  };
}

/** Always fetch a fresh V1 token (no caching). */
async function createV1AccessToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
  institutionId: string,
): Promise<V1Token> {
  const safeBase = assertCandescentHttpsBase(baseUrl);
  const resp = await fetch(`${safeBase}/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      di_fiid: institutionId,
      di_tid: crypto.randomUUID(),
    },
    body: "grant_type=client_credentials",
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`V1 token request failed (HTTP ${resp.status})`);
  }
  return parseV1TokenResponse(text);
}

async function authorizeClient(
  baseUrl: string,
  institutionId: string,
  bearerToken: string,
  authCodeClientId: string,
): Promise<ClientAuth> {
  const safeBase = assertCandescentHttpsBase(baseUrl);
  const resp = await fetch(`${safeBase}/auth-code/v1/client-authorization`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      institutionId,
      transactionId: crypto.randomUUID(),
    },
    body: `client_id=${encodeURIComponent(authCodeClientId)}`,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`BadRequestError (HTTP ${resp.status})`);
  }
  return JSON.parse(text) as ClientAuth;
}

async function getAuthorizationCode(
  baseUrl: string,
  institutionId: string,
  bearerToken: string,
  params: {
    scopes: string;
    requestedScopes: string;
    clientId: string;
    username: string;
    institutionUserId: string;
    nonce: string;
  },
): Promise<AuthCode> {
  const body = new URLSearchParams({
    scopes: params.scopes,
    requested_scopes: params.requestedScopes,
    client_id: params.clientId,
    username: params.username,
    institution_user_id: params.institutionUserId,
    nonce: params.nonce,
  });
  const safeBase = assertCandescentHttpsBase(baseUrl);
  const resp = await fetch(`${safeBase}/auth-code/v1/auth-code`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      institutionId,
      transactionId: crypto.randomUUID(),
    },
    body: body.toString(),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`BadRequestError (HTTP ${resp.status})`);
  }
  return JSON.parse(text) as AuthCode;
}

async function revokeTokenBasic(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
  token: string,
): Promise<void> {
  const safeBase = assertCandescentHttpsBase(baseUrl);
  const resp = await fetch(`${safeBase}/oauth2/v1/revoke`, {
    method: "DELETE",
    headers: {
      Authorization: basicAuth(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      transactionId: crypto.randomUUID(),
    },
    body: `token=${encodeURIComponent(token)}`,
  });
  if (!resp.ok) {
    await resp.text();
    throw new Error(`Revoke failed (HTTP ${resp.status})`);
  }
}

/** Auth-code body client_id values to try (OIDC client first, then Basic client). */
function authCodeClientIdCandidates(basicClientId: string, oidcClientId?: string): string[] {
  const candidates: string[] = [];
  if (oidcClientId) candidates.push(oidcClientId);
  if (!candidates.includes(basicClientId)) candidates.push(basicClientId);
  return candidates;
}

async function authorizeClientWithFallback(
  baseUrl: string,
  institutionId: string,
  bearerToken: string,
  candidates: string[],
): Promise<{ authCodeClientId: string; clientAuth: ClientAuth } | undefined> {
  let lastError: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const authCodeClientId = candidates[i]!;
    if (i > 0) {
      console.log("  Retrying with alternate client_id...");
    }
    try {
      const clientAuth = await authorizeClient(
        baseUrl,
        institutionId,
        bearerToken,
        authCodeClientId,
      );
      return { authCodeClientId, clientAuth };
    } catch (e: unknown) {
      lastError = e;
    }
  }
  if (lastError) {
    console.log(`  ${lastError}`);
  }
  return undefined;
}

interface AuthEnv {
  clientId: string;
  clientSecret: string;
  institutionId: string;
  oidcClientId: string;
  hostUserId: string;
  institutionUserId: string;
  nonce: string;
  baseUrl: string;
}

function loadAuthEnv(): AuthEnv {
  const clientId = process.env.CANDESCENT_CLIENT_ID;
  const clientSecret = process.env.CANDESCENT_CLIENT_SECRET;
  const institutionId = process.env.CANDESCENT_INSTITUTION_ID;
  const oidcClientId = process.env.CANDESCENT_OIDC_CLIENT_ID;
  const hostUserId = process.env.CANDESCENT_HOST_USER_ID;
  const institutionUserId = process.env.CANDESCENT_INSTITUTION_USER_ID;

  requireEnvVars([
    {
      value: clientId && clientSecret && institutionId ? "ok" : undefined,
      message:
        "ERROR: Set CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET, and CANDESCENT_INSTITUTION_ID",
    },
    {
      value: oidcClientId,
      message:
        "ERROR: Set CANDESCENT_OIDC_CLIENT_ID (auth-code client_id; differs from Basic auth client)",
    },
    { value: hostUserId, message: "ERROR: Set CANDESCENT_HOST_USER_ID" },
    { value: institutionUserId, message: "ERROR: Set CANDESCENT_INSTITUTION_USER_ID" },
  ]);

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    institutionId: institutionId!,
    oidcClientId: oidcClientId!,
    hostUserId: hostUserId!,
    institutionUserId: institutionUserId!,
    nonce: process.env.CANDESCENT_AUTH_NONCE ?? "candescent1234",
    baseUrl: resolveApigeeBase(),
  };
}

async function runStep1CreateV1Token(env: AuthEnv): Promise<string | undefined> {
  console.log("=== Step 1: Create Legacy Token (V1) ===");
  logEndpoint(ENDPOINTS.oauthV1CreateLegacyToken);
  try {
    const v1Token = await createV1AccessToken(
      env.baseUrl,
      env.clientId,
      env.clientSecret,
      env.institutionId,
    );
    pretty("V1 Token", {
      accessToken: maskSensitive(v1Token.accessToken),
      expiresAt: v1Token.expiresAt,
    });
    console.log("  SUCCESS");
    return v1Token.accessToken;
  } catch (e: unknown) {
    console.log("  Failed (V1 legacy token requires /v1/oauth/token enabled for your FI):");
    console.log(`  ${e}`);
    console.log("\nDone (cannot continue without a V1 token).");
    return undefined;
  }
}

async function runStep2AuthorizeClient(
  env: AuthEnv,
  legacyAccessToken: string,
): Promise<{ authCodeClientId: string; clientAuth: ClientAuth } | undefined> {
  console.log("\n=== Step 2: Authorize Client ===");
  logEndpoint(ENDPOINTS.oauthV2AuthorizeClient);
  const authCodeClientIds = authCodeClientIdCandidates(env.clientId, env.oidcClientId);
  const authorized = await authorizeClientWithFallback(
    env.baseUrl,
    env.institutionId,
    legacyAccessToken,
    authCodeClientIds,
  );
  if (authorized) {
    pretty("ClientAuth response", authorized.clientAuth);
    console.log("  SUCCESS");
  } else {
    console.log(
      "  Failed (client app must be registered for client-authorization). " +
        "Verify CANDESCENT_OIDC_CLIENT_ID matches your auth-code client registration.",
    );
  }
  return authorized;
}

async function runStep3GetAuthCode(
  env: AuthEnv,
  legacyAccessToken: string,
  authorized: { authCodeClientId: string; clientAuth: ClientAuth } | undefined,
): Promise<void> {
  console.log("\n=== Step 3: Get Authorization Code ===");
  logEndpoint(ENDPOINTS.oauthV2GetAuthorizationCode);
  if (!authorized) {
    console.log("  Skipped (step 2 did not succeed).");
    return;
  }
  const apiScopes = authorized.clientAuth.scopes;
  if (!apiScopes) {
    console.log("  Skipped (step 2 response did not include scopes).");
    return;
  }
  await runExampleStep(
    "",
    async () => {
      console.log("  scopes: from step 2 ClientAuth");
      console.log(`  requested_scopes: ${DEFAULT_REQUESTED_SCOPES}`);
      const authCode = await getAuthorizationCode(env.baseUrl, env.institutionId, legacyAccessToken, {
        scopes: apiScopes,
        requestedScopes: DEFAULT_REQUESTED_SCOPES,
        clientId: authorized.authCodeClientId,
        username: env.hostUserId,
        institutionUserId: env.institutionUserId,
        nonce: env.nonce,
      });
      pretty("AuthCode response", authCode);
      console.log("  SUCCESS");
    },
    "Failed (authorization-code requires OIDC config and valid user mapping)",
  );
}

async function runStep4RevokeToken(env: AuthEnv, legacyAccessToken: string): Promise<void> {
  console.log("\n=== Step 4: Revoke Token ===");
  logEndpoint(ENDPOINTS.oauthV2RevokeToken);
  await runExampleStep(
    "",
    async () => {
      await revokeTokenBasic(env.baseUrl, env.clientId, env.clientSecret, legacyAccessToken);
      console.log("  Token revoked successfully");
    },
    "Failed (token revocation may not be enabled for all grant types)",
  );
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const env = loadAuthEnv();
  const legacyAccessToken = await runStep1CreateV1Token(env);
  if (!legacyAccessToken) return;

  const authorized = await runStep2AuthorizeClient(env, legacyAccessToken);
  await runStep3GetAuthCode(env, legacyAccessToken, authorized);
  await runStep4RevokeToken(env, legacyAccessToken);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
