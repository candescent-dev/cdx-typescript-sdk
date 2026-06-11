/**
 * Error handling patterns: demonstrates catching specific SDK exceptions.
 *
 * The Candescent SDK maps every HTTP error status to a typed exception so
 * your code can react precisely — retry on 429, alert on 401, log details
 * on 400, and fall back to a generic handler for anything unexpected.
 *
 * Error hierarchy (all from "@cdx-forge/di-typescript-sdk"):
 *
 *     CandescentError                   ← root of all SDK errors
 *     ├── ConnectionError               ← network-level failure
 *     ├── RequestTimeoutError           ← HTTP timeout
 *     └── ApiError                      ← base for all HTTP error responses
 *         ├── BadRequestError           ← 400
 *         ├── AuthenticationError       ← 401
 *         ├── PermissionDeniedError     ← 403
 *         ├── NotFoundError             ← 404
 *         ├── ConflictError             ← 409
 *         ├── UnprocessableEntityError  ← 422
 *         ├── RateLimitError            ← 429 (has .retryAfter)
 *         └── InternalServerError       ← 5xx
 *
 * Every ApiError exposes:
 *     .statusCode    — HTTP status (e.g. 404)
 *     .message       — human-readable error text
 *     .headers       — response Headers object
 *     .body          — raw body string
 *     .rawResponse   — the full fetch Response
 *
 * Prerequisites:
 *   - Set environment variables: CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *     CANDESCENT_INSTITUTION_ID (and optionally CANDESCENT_ENVIRONMENT).
 *   - Set CANDESCENT_HOST_USER_ID or CANDESCENT_LOGIN_ID for list-accounts.
 *
 * Run: npx tsx examples/typescript/error-handling.ts
 */

import {
  CandescentClient,
  ApiError,
  BadRequestError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  RateLimitError,
  InternalServerError,
} from "@cdx-forge/di-typescript-sdk";

// Demo fallbacks only when no credentials are configured (e.g. offline dry-run).
if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

const SEPARATOR = "=".repeat(72);
const DASH = "-".repeat(72);

function pretty(label: string, obj: unknown): void {
  console.log("\n" + DASH);
  console.log("  " + label);
  console.log(DASH);
  console.log(JSON.stringify(obj, null, 2));
}

function dumpApiError(err: ApiError): void {
  console.log(`    statusCode:   ${err.statusCode}`);
  console.log(`    message:      ${err.message}`);
  console.log(`    body:         ${err.body?.slice(0, 200)}`);
  console.log(`    headers:      Headers object`);
  console.log(`    rawResponse:  ${err.rawResponse?.constructor?.name ?? "Response"}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Scenario 1: Success path ────────────────────────────────────────────

async function demoSuccessPath(client: CandescentClient): Promise<void> {
  console.log(`\n${SEPARATOR}`);
  console.log("  SCENARIO 1: Success path — list accounts");
  console.log(SEPARATOR);

  const hostUserId = process.env.CANDESCENT_HOST_USER_ID;
  const loginId = process.env.CANDESCENT_LOGIN_ID;

  if (!hostUserId && !loginId) {
    console.log("  Skipped (set CANDESCENT_HOST_USER_ID or CANDESCENT_LOGIN_ID)");
    return;
  }

  const userIdParam = hostUserId ? { hostUserId } : { loginId };

  try {
    const accounts = await client.accounts.list(userIdParam);
    pretty("Accounts retrieved successfully", accounts);
  } catch (err) {
    if (err instanceof ApiError) {
      console.log(`  Unexpected API error during list: ${err.message}`);
      dumpApiError(err);
    } else {
      throw err;
    }
  }
}

// ── Scenario 2: NotFoundError (404) ─────────────────────────────────────

async function demoNotFound(client: CandescentClient): Promise<void> {
  console.log(`\n${SEPARATOR}`);
  console.log("  SCENARIO 2: NotFoundError — get account with fake ID");
  console.log(SEPARATOR);

  const fakeId = "00000000-0000-0000-0000-000000000000";
  const hostUserId = process.env.CANDESCENT_HOST_USER_ID;
  const loginId = process.env.CANDESCENT_LOGIN_ID;
  
  const userIdParam = hostUserId ? { hostUserId } : { loginId };

  try {
    await client.accounts.getAccountById({
      accountId: fakeId,
      ...userIdParam,
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      console.log(`  Caught NotFoundError (HTTP ${err.statusCode}):`);
      console.log(`    ${err.message}`);
      dumpApiError(err);
    } else if (err instanceof ApiError) {
      console.log(`  Got a different API error instead of 404: HTTP ${err.statusCode}`);
      dumpApiError(err);
    } else {
      throw err;
    }
  }
}

// ── Scenario 3: BadRequestError / UnprocessableEntityError ──────────────

async function demoBadRequest(client: CandescentClient): Promise<void> {
  console.log(`\n${SEPARATOR}`);
  console.log("  SCENARIO 3: BadRequestError — malformed payload");
  console.log(SEPARATOR);

  try {
    await client.accounts.list({
      hostUserId: undefined,
      loginId: undefined,
    });
    console.log("  Unexpected success — the call accepted empty identifiers.");
  } catch (err) {
    if (err instanceof BadRequestError) {
      console.log(`  Caught BadRequestError (HTTP ${err.statusCode}):`);
      console.log(`    ${err.message}`);
      dumpApiError(err);
    } else if (err instanceof UnprocessableEntityError) {
      console.log(`  Caught UnprocessableEntityError (HTTP ${err.statusCode}):`);
      console.log(`    ${err.message}`);
      dumpApiError(err);
    } else if (err instanceof ApiError) {
      console.log(`  Got a different API error: HTTP ${err.statusCode}`);
      dumpApiError(err);
    } else {
      throw err;
    }
  }
}

// ── Scenario 4: Catch-all ApiError ──────────────────────────────────────

async function demoCatchAll(client: CandescentClient): Promise<void> {
  console.log(`\n${SEPARATOR}`);
  console.log("  SCENARIO 4: Catch-all ApiError — unexpected errors");
  console.log(SEPARATOR);

  const fakeId = "not-a-valid-id-!!!-@@@";
  try {
    await client.accounts.getAccountById({
      accountId: fakeId,
      hostUserId: "invalid",
    });
    console.log("  Unexpected success.");
  } catch (err) {
    if (err instanceof NotFoundError) {
      console.log(`  Caught NotFoundError: ${err.message}`);
    } else if (err instanceof BadRequestError) {
      console.log(`  Caught BadRequestError: ${err.message}`);
    } else if (err instanceof ApiError) {
      // Catches everything else: 401, 403, 409, 500, etc.
      console.log(`  Caught ApiError (catch-all) — HTTP ${err.statusCode}:`);
      dumpApiError(err);
    } else {
      throw err;
    }
  }
}

// ── Scenario 5: Inspecting ApiError fields ──────────────────────────────

async function demoErrorFields(client: CandescentClient): Promise<void> {
  console.log(`\n${SEPARATOR}`);
  console.log("  SCENARIO 5: Inspecting ApiError fields");
  console.log(SEPARATOR);

  const fakeId = "00000000-0000-0000-0000-000000000000";
  const hostUserId = process.env.CANDESCENT_HOST_USER_ID;
  const loginId = process.env.CANDESCENT_LOGIN_ID;
  const userIdParam = hostUserId ? { hostUserId } : { loginId };
  
  try {
    await client.accounts.getAccountById({
      accountId: fakeId,
      ...userIdParam,
    });
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;

    console.log("  Every ApiError carries rich context for debugging:\n");
    console.log(`    err.statusCode   → ${err.statusCode}`);
    console.log(`    err.message      → ${err.message}`);
    console.log(`    err.body         → ${err.body?.slice(0, 120)}`);
    console.log(`    err.headers      → Headers object`);
    console.log(`    err.rawResponse  → ${err.rawResponse?.constructor?.name ?? "Response"}`);
    console.log(`    err.name         → ${err.name}`);

    console.log("\n  Use instanceof checks for fine-grained control:");
    console.log(`    err instanceof NotFoundError             → ${err instanceof NotFoundError}`);
    console.log(`    err instanceof BadRequestError           → ${err instanceof BadRequestError}`);
    console.log(`    err instanceof AuthenticationError       → ${err instanceof AuthenticationError}`);
    console.log(`    err instanceof PermissionDeniedError     → ${err instanceof PermissionDeniedError}`);
    console.log(`    err instanceof ConflictError             → ${err instanceof ConflictError}`);
    console.log(`    err instanceof UnprocessableEntityError  → ${err instanceof UnprocessableEntityError}`);
    console.log(`    err instanceof RateLimitError            → ${err instanceof RateLimitError}`);
    console.log(`    err instanceof InternalServerError       → ${err instanceof InternalServerError}`);
    console.log(`    err instanceof ApiError                  → ${err instanceof ApiError} (always true)`);
  }
}

// ── Scenario 6: RateLimitError retry pattern ────────────────────────────

function demoRateLimitHandling(): void {
  console.log(`\n${SEPARATOR}`);
  console.log("  SCENARIO 6: RateLimitError — retry-after pattern");
  console.log(SEPARATOR);

  console.log(`
  When the API returns HTTP 429, the SDK raises RateLimitError with an
  extra field: retryAfter (number | null), parsed from the Retry-After header.

  Recommended retry pattern:

    import {
      ApiError, RateLimitError
    } from "@cdx-forge/di-typescript-sdk";

    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await client.accounts.list({ hostUserId });
        break; // success
      } catch (err) {
        if (err instanceof RateLimitError) {
          const wait = err.retryAfter ?? 2 ** attempt;
          console.log(
            \`Rate limited (attempt \${attempt + 1}/\${MAX_RETRIES}). \` +
            \`Retrying in \${wait}s...\`
          );
          await sleep(wait * 1000);
          continue;
        }
        if (err instanceof ApiError) {
          console.error(\`API error \${err.statusCode}: \${err.message}\`);
        }
        throw err;
      }
    }

  The retryAfter value comes from the Retry-After response header.
  When absent, use exponential backoff (2^attempt seconds is a good default).
`);
}

// ── Scenario 7: Production-grade combined handler ───────────────────────

function demoProductionPattern(): void {
  console.log(`\n${SEPARATOR}`);
  console.log("  SCENARIO 7: Production-grade combined handler (reference)");
  console.log(SEPARATOR);

  console.log(`
  In production, combine specific and generic handlers:

    import {
      ApiError, BadRequestError, AuthenticationError,
      PermissionDeniedError, NotFoundError, RateLimitError,
      InternalServerError,
    } from "@cdx-forge/di-typescript-sdk";

    try {
      const result = await client.accounts.getAccountById({ accountId, ... });

    } catch (err) {
      if (err instanceof NotFoundError) {
        // 404 — resource doesn't exist. Safe to show user a friendly message.
        return { error: "Account not found", code: "NOT_FOUND" };
      }
      if (err instanceof BadRequestError) {
        // 400 — caller's fault. Log the body for debugging the payload.
        logger.warn("Bad request: %s", err.body);
        return { error: "Invalid request", code: "BAD_REQUEST" };
      }
      if (err instanceof AuthenticationError ||
          err instanceof PermissionDeniedError) {
        // 401/403 — auth problem. Trigger re-authentication or escalate.
        logger.error("Auth failure — check credentials/permissions");
        return { error: "Not authorized", code: "AUTH_FAILURE" };
      }
      if (err instanceof RateLimitError) {
        // 429 — back off and retry using the server-provided delay.
        const wait = err.retryAfter ?? 5;
        await sleep(wait * 1000);
        return retryOperation(...);
      }
      if (err instanceof InternalServerError) {
        // 5xx — server problem. Retry with backoff, then alert on-call.
        return { error: "Server error — please retry", code: "SERVER_ERROR" };
      }
      if (err instanceof ApiError) {
        // Catch-all for any other HTTP error (409 Conflict, 422, etc.)
        logger.error("Unexpected API error %d: %s", err.statusCode, err.message);
        return { error: "Unexpected error", code: "UNKNOWN" };
      }
      throw err; // non-API error — rethrow
    }
`);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(SEPARATOR);
  console.log("  Candescent SDK — Error Handling Patterns (TypeScript)");
  console.log(SEPARATOR);

  const client = CandescentClient.fromEnv();
  console.log("Client initialised\n");

  await demoSuccessPath(client);
  await demoNotFound(client);
  await demoBadRequest(client);
  await demoCatchAll(client);
  await demoErrorFields(client);
  demoRateLimitHandling();
  demoProductionPattern();

  await client.close();
  console.log(`\n${SEPARATOR}`);
  console.log("  Done.");
  console.log(SEPARATOR);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
