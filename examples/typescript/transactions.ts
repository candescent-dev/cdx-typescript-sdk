/**
 * Transactions example: list transactions with date-range filters for both
 * retail and business banking users.  Tests both mutually exclusive
 * user-identification paths (hostUserId vs loginId).
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
 *   CANDESCENT_LOGIN_ID                — login identifier
 *   CANDESCENT_ACCOUNT_ID              — account to query (or auto-discovered)
 *   CANDESCENT_INSTITUTION_CUSTOMER_ID — business customer identifier (BB)
 *
 * Run: npx tsx examples/typescript/transactions.ts
 */

import { CandescentClient } from "@cdx-forge/di-typescript-sdk";
import { runExampleStep, runExampleStepWhen } from "./_helpers.ts";

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

async function resolveAccountId(
  client: CandescentClient,
  hostUserId: string,
  loginId: string | undefined,
  accountId: string | undefined,
): Promise<string> {
  if (accountId) return accountId;
  console.log("\nAuto-discovering account_id from list...");
  try {
    const userCtx = hostUserId ? { hostUserId } : { loginId: loginId! };
    const accounts = await client.accounts.list(userCtx);
    const discovered = accounts.accounts?.[0]?.id;
    if (discovered) {
      console.log(`  Using account_id: ${discovered}`);
      return discovered;
    }
    console.log("  No accounts found — using demo account ID for transaction examples");
    return "demo-account-id";
  } catch (e: unknown) {
    console.log(`  Auto-discovery failed: ${e} — using demo account ID`);
    return "demo-account-id";
  }
}

async function listTransactionsForUser(
  client: CandescentClient,
  label: string,
  accountId: string,
  dateRange: string,
  startDate: Date,
  endDate: Date,
  params: { hostUserId: string } | { loginId: string },
): Promise<void> {
  await runExampleStep(`\n=== List Transactions — ${label} (last 30 days) ===`, async () => {
    console.log(`  account_id: ${accountId}`);
    console.log(`  date range: ${dateRange}`);
    const txns = await client.transactions.listAccountTransactions({
      accountId,
      ...params,
      startDate,
      endDate,
    });
    pretty(`Transaction List (${label})`, txns);
  }, `List transactions (${label})`);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const hostUserId = process.env.CANDESCENT_HOST_USER_ID ?? "demo-host-user";
  const loginId = process.env.CANDESCENT_LOGIN_ID;
  const institutionCustomerId = process.env.CANDESCENT_INSTITUTION_CUSTOMER_ID;

  const client = CandescentClient.fromEnv();
  console.log("Client initialised");

  const accountId = await resolveAccountId(
    client,
    hostUserId,
    loginId,
    process.env.CANDESCENT_ACCOUNT_ID,
  );

  const endDate = new Date();
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dateRange = `${startDate.toISOString().substring(0, 10)} to ${endDate.toISOString().substring(0, 10)}`;

  if (hostUserId) {
    await listTransactionsForUser(
      client,
      "hostUserId",
      accountId,
      dateRange,
      startDate,
      endDate,
      { hostUserId },
    );
  } else {
    console.log("\n  Skipping hostUserId path (CANDESCENT_HOST_USER_ID not set)");
  }

  if (loginId) {
    await listTransactionsForUser(
      client,
      "loginId",
      accountId,
      dateRange,
      startDate,
      endDate,
      { loginId },
    );
  } else {
    console.log("\n  Skipping loginId path (CANDESCENT_LOGIN_ID not set)");
  }

  await runExampleStepWhen(
    !!(institutionCustomerId && loginId),
    "\n  Skipping business transactions (CANDESCENT_INSTITUTION_CUSTOMER_ID or LOGIN_ID not set)",
    "\n=== Business: List Transactions ===",
    async () => {
      const bbTxns = await client.transactions.listAccountTransactions({
        accountId,
        loginId: loginId!,
        institutionCustomerId: institutionCustomerId!,
        startDate,
        endDate,
      });
      pretty("Transaction List (business)", bbTxns);
    },
    "Business list transactions",
  );

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
