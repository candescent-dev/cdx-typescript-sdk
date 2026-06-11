/**
 * MX Service example: list MX users, get a specific user, retrieve widget URL,
 * and download transaction logs.
 *
 * MX endpoints route requests to different MX ecosystem hosts via the
 * `ext_host` header. Each operation may target a different host:
 *   - api.mx.com              — MX Platform API (list users)
 *   - live.moneydesktop.com   — MX user profile (get user by id)
 *   - sso.moneydesktop.com    — SSO widget URLs
 *   - logs.moneydesktop.com   — Transaction log downloads
 *
 * The SDK handles all complexity transparently:
 *   - V1 vs V2 OAuth token routing (based on endpoint path)
 *   - Auth headers, tracing headers, institutionId injection
 *
 * Prerequisites (MX-only — does not use main CANDESCENT_CLIENT_* vars):
 *   CANDESCENT_MX_CLIENT_ID, CANDESCENT_MX_CLIENT_SECRET, CANDESCENT_MX_INSTITUTION_ID
 *   Source: apigee-mx-stg Postman environment
 *
 * Optional:
 *   CANDESCENT_MX_HOST       — List-users ext_host (default: "api.mx.com")
 *   CANDESCENT_MX_LIVE_HOST  — Get-user ext_host (default: "live.moneydesktop.com")
 *   CANDESCENT_MX_USER_ID    — MX user id field (u-...), or auto-discovered from list
 *   CANDESCENT_ENVIRONMENT — "stage" (default) | "production"
 *
 * Run: npx tsx examples/typescript/mx-service.ts
 */

import { CandescentClient, Environment } from "@cdx-forge/di-typescript-sdk";
import { runExampleStep, runExampleStepWhen } from "./_helpers.ts";

const MX_API_HOST = process.env.CANDESCENT_MX_HOST || "api.mx.com";
const MX_LIVE_HOST = process.env.CANDESCENT_MX_LIVE_HOST || "live.moneydesktop.com";
const MX_SSO_HOST = "sso.moneydesktop.com";
const MX_LOGS_HOST = "logs.moneydesktop.com";
const MX_SSO_ACCEPT_JSON = "application/vnd.moneydesktop.sso.v3+json";
const MX_SSO_ACCEPT_XML = "application/vnd.moneydesktop.sso.v3+xml";
const INSTITUTION_ID = process.env.CANDESCENT_MX_INSTITUTION_ID;
let mxUserId = process.env.CANDESCENT_MX_USER_ID;

function resolveEnvironment(): Environment {
  return process.env.CANDESCENT_ENVIRONMENT?.toLowerCase() === "production"
    ? Environment.Production
    : Environment.Stage;
}

/** MX Apigee credentials — isolated from main DI examples. */
function createMxClient(): CandescentClient {
  const clientId = process.env.CANDESCENT_MX_CLIENT_ID;
  const clientSecret = process.env.CANDESCENT_MX_CLIENT_SECRET;
  const institutionId = INSTITUTION_ID;

  if (!institutionId) {
    throw new Error(
      "Set CANDESCENT_MX_INSTITUTION_ID (MX institution, e.g. from apigee-mx-stg)",
    );
  }
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set CANDESCENT_MX_CLIENT_ID and CANDESCENT_MX_CLIENT_SECRET (MX Apigee credentials)",
    );
  }

  return new CandescentClient({
    clientId,
    clientSecret,
    institutionId,
    environment: resolveEnvironment(),
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function listMxUsers(client: CandescentClient): Promise<string | undefined> {
  let discoveredId = mxUserId;
  await runExampleStep("\n=== 1. List MX Users ===", async () => {
    const users = await client.users.listUsers({
      extHost: MX_API_HOST,
      accept: "application/vnd.mx.api.v1+json",
    });
    pretty("MX Users", users);
    if (!discoveredId && users) {
      const firstUser = Array.isArray(users.users) ? users.users[0] : null;
      discoveredId = firstUser?.id ?? firstUser?.guid;
      if (discoveredId) console.log(`\n  Auto-discovered MX user: ${discoveredId}`);
    }
  });
  return discoveredId;
}

async function runMxUserSteps(
  client: CandescentClient,
  institutionId: string,
  userId: string,
): Promise<void> {
  await runExampleStep("\n=== 2. Get MX User ===", async () => {
    const user = await client.users.getUser({
      extHost: MX_LIVE_HOST,
      institutionId,
      userId,
      accept: MX_SSO_ACCEPT_JSON,
    });
    pretty(`MX User (${userId})`, user);
  });

  await runExampleStep("\n=== 3. Get MX Widget URL ===", async () => {
    const widget = await client.widgets.getWidgetUrl({
      extHost: MX_SSO_HOST,
      institutionId,
      userId,
      accept: MX_SSO_ACCEPT_XML,
    });
    pretty("MX Widget URL", widget);
  });
}

async function downloadMxLogs(client: CandescentClient, institutionId: string): Promise<void> {
  const logDate = yesterday();
  await runExampleStep(`\n=== 4. Download MX Transaction Logs (${logDate}) ===`, async () => {
    const logs = await client.data.downloadTransactionLogs({
      extHost: MX_LOGS_HOST,
      institutionId,
      date: new Date(logDate),
      accept: "application/vnd.mx.logs.v1+avro",
    });
    pretty("MX Transaction Logs", logs);
  });
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const client = createMxClient();
  const institutionId = INSTITUTION_ID!;
  console.log("Client initialised");
  console.log(`  MX API host:  ${MX_API_HOST}`);
  console.log(`  MX Live host: ${MX_LIVE_HOST}`);
  console.log(`  MX SSO host:  ${MX_SSO_HOST}`);
  console.log(`  MX Logs host: ${MX_LOGS_HOST}`);
  console.log(`  Institution:  ${institutionId}`);

  const resolvedUserId = await listMxUsers(client);
  await runExampleStepWhen(
    !!resolvedUserId,
    "\n  Skipping get user / widget URL (no MX user_id available)",
    "",
    async () => runMxUserSteps(client, institutionId, resolvedUserId!),
  );
  await downloadMxLogs(client, institutionId);

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
