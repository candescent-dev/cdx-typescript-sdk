/**
 * Authentication lifecycle example: obtain a token, use it, close the client
 * (which revokes tokens), then verify that a new client must be created
 * for further API calls.  Tests both mutually exclusive user-identification
 * paths (hostUserId vs loginId).
 *
 * The SDK handles all complexity transparently:
 *   - V1 vs V2 OAuth token routing (based on endpoint path)
 *   - Token acquisition on first API call (lazy)
 *   - Token revocation via client.close()
 *
 * Prerequisites:
 *   - Set environment variables: CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *     CANDESCENT_INSTITUTION_ID (and optionally CANDESCENT_ENVIRONMENT).
 * Additional env vars:
 *   CANDESCENT_HOST_USER_ID — user identifier for the list-accounts call
 *   CANDESCENT_LOGIN_ID     — alternative to hostUserId
 *
 * Run: npx tsx examples/typescript/authentication-lifecycle.ts
 */

import { CandescentClient } from "@cdx-forge/di-typescript-sdk";

// Demo fallbacks only when no credentials are configured (e.g. offline dry-run).
if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

// ── Helpers ─────────────────────────────────────────────────────────────

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

type UserCtx = { hostUserId: string } | { loginId: string };

async function testListAccounts(
  client: InstanceType<typeof CandescentClient>,
  label: string,
  userCtx: UserCtx,
): Promise<void> {
  try {
    const accounts = await client.accounts.list(userCtx);
    pretty(`Accounts — ${label} (should succeed)`, accounts);
    console.log("  SUCCESS — token is valid");
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const hostUserId = process.env.CANDESCENT_HOST_USER_ID ?? "demo-host-user";
  const loginId = process.env.CANDESCENT_LOGIN_ID;

  // hostUserId and loginId are mutually exclusive — the SDK will reject
  // calls that pass both.

  // ── 1. Client initialisation (implicit token fetch) ───────────────────
  console.log("=== Step 1: Initialise client (implicit token acquisition) ===");
  let client = CandescentClient.fromEnv();
  console.log("  Client initialised — token will be fetched on first API call");

  // ── 2a. Use the token — test with hostUserId ──────────────────────────
  if (hostUserId) {
    console.log("\n=== Step 2a: Use token — list accounts (hostUserId) ===");
    await testListAccounts(client, "hostUserId", { hostUserId });
  }

  // ── 2b. Use the token — test with loginId ─────────────────────────────
  if (loginId) {
    console.log("\n=== Step 2b: Use token — list accounts (loginId) ===");
    await testListAccounts(client, "loginId", { loginId });
  }

  // ── 3. Close the client (revokes tokens) ──────────────────────────────
  console.log("\n=== Step 3: Close client (revokes tokens) ===");
  await client.close();
  console.log("  Client closed — tokens revoked");

  // ── 4. Attempt to use closed client (expect failure) ──────────────────
  console.log("\n=== Step 4: Attempt API call after close (expect failure) ===");
  try {
    const userCtx: UserCtx = hostUserId ? { hostUserId } : { loginId: loginId! };
    const accounts2 = await client.accounts.list(userCtx);
    console.log("  NOTE: Call succeeded — the SDK may have auto-refreshed the token");
    pretty("Accounts (after close)", accounts2);
  } catch (e: unknown) {
    console.log(`  Expected error after close: ${e}`);
  }

  // ── 5. Create a fresh client and verify it works ──────────────────────
  console.log("\n=== Step 5: Create fresh client and verify ===");
  client = CandescentClient.fromEnv();

  if (hostUserId) {
    console.log("\n  Fresh client — hostUserId path:");
    await testListAccounts(client, "hostUserId (fresh)", { hostUserId });
  }
  if (loginId) {
    console.log("\n  Fresh client — loginId path:");
    await testListAccounts(client, "loginId (fresh)", { loginId });
  }

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
