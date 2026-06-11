/**
 * E-Statement Management example: read e-statement disclosures by account,
 * update delivery preferences, and toggle e-statement opt-in.  Tests both
 * mutually exclusive user-identification paths (hostUserId vs loginId).
 *
 * The SDK handles all complexity transparently:
 *   - V1 vs V2 OAuth token routing (based on endpoint path)
 *   - Auth headers, tracing headers, institutionId injection
 *
 * Prerequisites:
 *   - Set environment variables: CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *     CANDESCENT_INSTITUTION_ID (and optionally CANDESCENT_ENVIRONMENT).
 * Additional env vars:
 *   CANDESCENT_HOST_USER_ID  — retail user identifier (required)
 *   CANDESCENT_LOGIN_ID      — alternative to host_user_id
 *   CANDESCENT_ACCOUNT_ID    — account to manage (or auto-discovered)
 *
 * Run: npx tsx examples/typescript/estatements.ts
 */

import {
  CandescentClient,
  type EStatementRequest,
  type EStatementPreferencesRequest,
  type EStatementReportRequest,
} from "@cdx-forge/di-typescript-sdk";
import { runExampleStep, runExampleStepWhen } from "./_helpers.ts";

// Demo fallbacks only when no credentials are configured (e.g. offline dry-run).
if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

const HOST_USER_ID = process.env.CANDESCENT_HOST_USER_ID ?? "demo-host-user";
const LOGIN_ID = process.env.CANDESCENT_LOGIN_ID;
let accountId = process.env.CANDESCENT_ACCOUNT_ID;

// ── Helpers ─────────────────────────────────────────────────────────────

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

type UserCtx = { hostUserId: string } | { loginId: string };

async function runEstatementFlow(
  client: InstanceType<typeof CandescentClient>,
  label: string,
  userCtx: UserCtx,
  acctId: string,
): Promise<void> {
  console.log("\n" + "=".repeat(72));
  console.log(`  E-Statement Flow — ${label}`);
  console.log("=".repeat(72));

  // Get E-Statement Disclosures by Account
  console.log(`\n=== Get E-Statement Disclosures (${label}) ===`);
  try {
    const disclosures = await client.electronicStatements.getDisclosuresByAccount({
      accountId: acctId,
      ...userCtx,
    });
    pretty(`E-Statement Disclosures — ${label} (${acctId})`, disclosures);
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // Update Statement Delivery Preference (single account)
  console.log(`\n=== Update Delivery Preference — opt-in (${label}) ===`);
  try {
    const request: EStatementRequest = {
      statementType: "OLS",
      activateEstatement: true,
      accountId: acctId,
    };
    const result = await client.electronicStatements.updateStatementDeliveryPreference({
      eStatementRequest: request,
      ...userCtx,
    });
    pretty(`Updated Delivery Preference — ${label}`, result);
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // Update E-Statement Preferences (all accounts)
  console.log(`\n=== Update E-Statement Preferences — all accounts (${label}) ===`);
  try {
    const prefsRequest: EStatementPreferencesRequest = {
      activateEstatement: true,
    };
    const result = await client.electronicStatements.updateEStatementPreferences({
      eStatementPreferencesRequest: prefsRequest,
      ...userCtx,
    });
    pretty(`Updated E-Statement Preferences — ${label}`, result);
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }
}

async function resolveEstatementAccountId(client: CandescentClient): Promise<string> {
  if (accountId) return accountId;
  console.log("\nAuto-discovering account_id from list...");
  try {
    const userCtx = HOST_USER_ID ? { hostUserId: HOST_USER_ID } : { loginId: LOGIN_ID! };
    const accounts = await client.accounts.list(userCtx);
    const discovered = accounts.accounts?.[0]?.id;
    if (discovered) {
      console.log(`  Using account_id: ${discovered}`);
      return discovered;
    }
    console.log("  No accounts found — using demo account ID for e-statement examples");
    return "demo-account-id";
  } catch (e: unknown) {
    console.log(`  Auto-discovery failed: ${e} — using demo account ID`);
    return "demo-account-id";
  }
}

async function runEstatementsReport(client: CandescentClient): Promise<void> {
  await runExampleStep("\n=== 4. Get E-Statements Report (opt-in data) ===", async () => {
    const reportRequest: EStatementReportRequest = {
      customerId: HOST_USER_ID,
      accountType: "SDA",
    };
    const userIdParam = HOST_USER_ID ? { hostUserId: HOST_USER_ID } : { loginId: LOGIN_ID! };
    const report = await client.electronicStatements.getEstatementsReport({
      eStatementReportRequest: reportRequest,
      ...userIdParam,
    });
    pretty("E-Statements Report", report);
  });
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const client = CandescentClient.fromEnv();
  console.log("Client initialised");

  const resolvedAccountId = await resolveEstatementAccountId(client);

  await runExampleStepWhen(
    !!HOST_USER_ID,
    "\n  Skipping hostUserId path (CANDESCENT_HOST_USER_ID not set)",
    "",
    async () => runEstatementFlow(client, "hostUserId", { hostUserId: HOST_USER_ID }, resolvedAccountId),
  );

  await runExampleStepWhen(
    !!LOGIN_ID,
    "\n  Skipping loginId path (CANDESCENT_LOGIN_ID not set)",
    "",
    async () => runEstatementFlow(client, "loginId", { loginId: LOGIN_ID! }, resolvedAccountId),
  );

  await runEstatementsReport(client);
  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
