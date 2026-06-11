/**
 * Accounts example: list accounts (retail + business patterns) and get a
 * single account by ID.  Tests both mutually exclusive user-identification
 * paths (hostUserId vs loginId) when both env vars are provided.
 *
 * The SDK handles all complexity transparently:
 *   - V1 vs V2 OAuth token routing (based on endpoint path)
 *   - Auth headers, tracing headers, institutionId injection
 *
 * Prerequisites:
 *   - Set environment variables: CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *     CANDESCENT_INSTITUTION_ID (and optionally CANDESCENT_ENVIRONMENT).
 * Additional env vars:
 *   CANDESCENT_HOST_USER_ID            — retail user identifier
 *   CANDESCENT_LOGIN_ID                — login identifier (alternative to hostUserId)
 *   CANDESCENT_INSTITUTION_CUSTOMER_ID — business customer identifier (BB)
 *   CANDESCENT_ACCOUNT_ID              — specific account to fetch (or auto-discovered)
 *
 * Run: npx tsx examples/typescript/accounts.ts
 */

import { CandescentClient, type AccountsResponse } from "@cdx-forge/di-typescript-sdk";
import { runExampleStep } from "./_helpers.ts";

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

function extractAccountId(accounts: AccountsResponse): string | undefined {
  return accounts.accounts?.[0]?.id;
}

async function listAccountsAndDiscoverId(
  client: CandescentClient,
  label: string,
  params: { hostUserId: string } | { loginId: string },
  accountId: string | undefined,
): Promise<string | undefined> {
  let discovered = accountId;
  await runExampleStep(`\n=== List Accounts (via ${label}) ===`, async () => {
    const accounts: AccountsResponse = await client.accounts.list(params);
    pretty(`Account List (${label})`, accounts);
    if (!discovered) {
      discovered = extractAccountId(accounts);
      if (discovered) console.log(`\n  Auto-discovered account_id: ${discovered}`);
    }
  }, `List accounts (${label})`);
  return discovered;
}

async function runBusinessAccountLists(
  client: CandescentClient,
  loginId: string,
): Promise<void> {
  await runExampleStep("\n=== Business: List Accounts (grouped by customer) ===", async () => {
    const bbAccounts = await client.accounts.list({
      loginId,
      $apply: "groupBy(customer)",
      $skipGroups: 0,
      $topGroups: 1,
    });
    pretty("Business Account List (grouped)", bbAccounts);
  }, "Business list accounts");

  await runExampleStep("\n=== Business: List Accounts (filtered by category) ===", async () => {
    const bbFiltered = await client.accounts.list({
      loginId,
      $filter: "category eq 'DEPOSIT'",
    });
    pretty("Business Account List (DEPOSIT only)", bbFiltered);
  }, "Business filtered list");
}

async function getSingleAccount(
  client: CandescentClient,
  accountId: string,
  label: string,
  params: { hostUserId: string } | { loginId: string },
): Promise<void> {
  await runExampleStep(`\n=== Get Single Account (via ${label}) ===`, async () => {
    const account = await client.accounts.getAccountById({ accountId, ...params });
    pretty(`Single Account — ${label} (${accountId})`, account);
  }, `Get account (${label})`);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const hostUserId = process.env.CANDESCENT_HOST_USER_ID ?? "demo-host-user";
  const loginId = process.env.CANDESCENT_LOGIN_ID;
  let accountId = process.env.CANDESCENT_ACCOUNT_ID;

  const client = CandescentClient.fromEnv();
  console.log("Client initialised (V1 + V2 dual-token routing enabled)");

  if (hostUserId) {
    accountId = await listAccountsAndDiscoverId(client, "hostUserId", { hostUserId }, accountId);
  } else {
    console.log("\n  Skipping hostUserId path (CANDESCENT_HOST_USER_ID not set)");
  }

  if (loginId) {
    accountId = await listAccountsAndDiscoverId(client, "loginId", { loginId }, accountId);
  } else {
    console.log("\n  Skipping loginId path (CANDESCENT_LOGIN_ID not set)");
  }

  if (loginId) {
    await runBusinessAccountLists(client, loginId);
  } else {
    console.log("\n  Skipping business account list (CANDESCENT_LOGIN_ID not set)");
  }

  if (accountId && hostUserId) {
    await getSingleAccount(client, accountId, "hostUserId", { hostUserId });
  }
  if (accountId && loginId) {
    await getSingleAccount(client, accountId, "loginId", { loginId });
  }
  if (!accountId) {
    console.log("\n  Skipping get single account (no account_id available)");
  }

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
