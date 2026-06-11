/**
 * Business Banking Entitlements example: query user entitlements and business
 * entitlements with various filter combinations.
 *
 * Includes negative test cases for missing required parameters.
 *
 * The SDK handles all complexity transparently:
 *   - V1 vs V2 OAuth token routing (based on endpoint path)
 *   - Auth headers, tracing headers, institutionId injection
 *
 * Prerequisites (BB Apigee credentials — does not use main CANDESCENT_CLIENT_* vars):
 *   CANDESCENT_BB_CLIENT_ID, CANDESCENT_BB_CLIENT_SECRET
 *   Source: apigee-bb-stg Postman environment
 *
 * Optional:
 *   CANDESCENT_BB_INSTITUTION_ID  — BB institution (default: CANDESCENT_INSTITUTION_ID, e.g. "05529")
 *   CANDESCENT_APIGEE_BASE_URL    — Apigee host (default: apigee-bb-stg `apigee_base_url`)
 *   CANDESCENT_ENVIRONMENT        — when APIGEE_BASE_URL unset: "stage" (default) | "production"
 *
 * Additional env vars:
 *   CANDESCENT_BB_LOGIN_ID                — BB user login ID (required)
 *   CANDESCENT_BB_BUSINESS_ID             — BB business ID (required)
 *   CANDESCENT_BB_INSTITUTION_CUSTOMER_ID — location identifier (optional filter)
 *   CANDESCENT_BB_FEATURE_NAME            — feature name filter (optional)
 *
 * Run (from repo root):
 *   node --experimental-strip-types examples/typescript/business-entitlements.ts
 *   # or: source .env && node ...
 *
 * Repo-root `.env` is loaded automatically when present (same as run-all-typescript-examples.mjs).
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CandescentClient,
  ClientCredentialsProvider,
  TokenEndpoint,
} from "@cdx-forge/di-typescript-sdk";
import { loadRepoDotEnv } from "../../scripts/load-dotenv.mjs";
import {
  assertCandescentHttpsBase,
  envSetStatus,
  runExampleStep,
  runExampleStepWhen,
  runExpectedErrorStep,
} from "./_helpers.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
Object.assign(process.env, loadRepoDotEnv(REPO_ROOT));

/** Apigee proxy prefix for BB entitlements (Postman: `db-bb-entitlements`). */
const BB_ENTITLEMENTS_API_PREFIX = "/db-bb-entitlements";

function resolveApigeeBase(): string {
  const fromEnv = process.env.CANDESCENT_APIGEE_BASE_URL?.replace(/\/$/, "");
  const candidate =
    fromEnv ??
    (process.env.CANDESCENT_ENVIRONMENT?.toLowerCase() === "production"
      ? "https://api.candescent.com/digitalbanking"
      : "https://api.candescent.com/digitalbanking/stage");
  return assertCandescentHttpsBase(candidate);
}

/**
 * BB entitlements client aligned with Postman apigee-bb-stg:
 *   OAuth:  {apigee_base_url}/oauth2/v1/token
 *   APIs:   {apigee_base_url}/db-bb-entitlements/v1/...
 */
function createBbClient(): CandescentClient {
  const clientId = process.env.CANDESCENT_BB_CLIENT_ID;
  const clientSecret = process.env.CANDESCENT_BB_CLIENT_SECRET;
  const institutionId =
    process.env.CANDESCENT_BB_INSTITUTION_ID ?? process.env.CANDESCENT_INSTITUTION_ID;

  if (!institutionId) {
    throw new Error(
      "Set CANDESCENT_BB_INSTITUTION_ID or CANDESCENT_INSTITUTION_ID (BB institution, e.g. from apigee-bb-stg)",
    );
  }
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set CANDESCENT_BB_CLIENT_ID and CANDESCENT_BB_CLIENT_SECRET (BB Apigee credentials from apigee-bb-stg)",
    );
  }

  const apigeeBase = resolveApigeeBase();
  const tokenProvider = new ClientCredentialsProvider(
    clientId,
    clientSecret,
    institutionId,
    apigeeBase,
    TokenEndpoint.V2_CURRENT,
  );

  return new CandescentClient({
    institutionId,
    tokenProvider,
    baseUrl: `${apigeeBase}${BB_ENTITLEMENTS_API_PREFIX}`,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

async function runUserEntitlementSteps(
  client: ReturnType<typeof createBbClient>,
  bbLoginId: string,
  institutionCustomerId: string | undefined,
  featureName: string | undefined,
): Promise<void> {
  await runExampleStep("\n=== 1. User Entitlements — by loginId ===", async () => {
    const ue = await client.entitlements.getUserEntitlements({ loginId: bbLoginId });
    pretty("User Entitlements (loginId)", ue);
  });

  await runExampleStepWhen(
    !!institutionCustomerId,
    "\n  Skipping location filter (CANDESCENT_BB_INSTITUTION_CUSTOMER_ID not set)",
    "\n=== 2. User Entitlements — loginId + institutionCustomerId ===",
    async () => {
      const ue = await client.entitlements.getUserEntitlements({
        loginId: bbLoginId,
        institutionCustomerId,
      });
      pretty("User Entitlements (loginId + location)", ue);
    },
  );

  await runExampleStepWhen(
    !!featureName,
    "\n  Skipping feature filter (CANDESCENT_BB_FEATURE_NAME not set)",
    "\n=== 3. User Entitlements — loginId + featureName ===",
    async () => {
      const ue = await client.entitlements.getUserEntitlements({
        loginId: bbLoginId,
        featureName,
      });
      pretty(`User Entitlements (loginId + feature=${featureName})`, ue);
    },
  );
}

async function runBusinessEntitlementSteps(
  client: ReturnType<typeof createBbClient>,
  bbBusinessId: string,
  institutionCustomerId: string | undefined,
  featureName: string | undefined,
): Promise<void> {
  await runExampleStep("\n=== 4. Business Entitlements — by businessId ===", async () => {
    const be = await client.entitlements.getBusinessEntitlements({ businessId: bbBusinessId });
    pretty("Business Entitlements (businessId)", be);
  });

  if (institutionCustomerId) {
    await runExampleStep(
      "\n=== 5. Business Entitlements — businessId + institutionCustomerId ===",
      async () => {
        const be = await client.entitlements.getBusinessEntitlements({
          businessId: bbBusinessId,
          institutionCustomerId,
        });
        pretty("Business Entitlements (businessId + location)", be);
      },
    );
  }

  if (featureName) {
    await runExampleStep(
      "\n=== 6. Business Entitlements — businessId + featureName ===",
      async () => {
        const be = await client.entitlements.getBusinessEntitlements({
          businessId: bbBusinessId,
          featureName,
        });
        pretty(`Business Entitlements (businessId + feature=${featureName})`, be);
      },
    );
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const bbLoginId = process.env.CANDESCENT_BB_LOGIN_ID ?? "demo-bb-login";
  const bbBusinessId = process.env.CANDESCENT_BB_BUSINESS_ID ?? "demo-business-id";
  const institutionCustomerId = process.env.CANDESCENT_BB_INSTITUTION_CUSTOMER_ID;
  const featureName = process.env.CANDESCENT_BB_FEATURE_NAME;

  const client = createBbClient();
  console.log("Client initialised (Business Banking)");
  console.log(`  Login ID:    ${envSetStatus(bbLoginId)}`);
  console.log(`  Business ID: ${envSetStatus(bbBusinessId)}`);

  await runUserEntitlementSteps(client, bbLoginId, institutionCustomerId, featureName);
  await runBusinessEntitlementSteps(client, bbBusinessId, institutionCustomerId, featureName);

  await runExpectedErrorStep(
    "\n=== 7. Negative: User entitlements without loginId (expect error) ===",
    async () => {
      await client.entitlements.getUserEntitlements({ loginId: "" });
    },
  );

  await runExpectedErrorStep(
    "\n=== 8. Negative: Business entitlements without businessId (expect error) ===",
    async () => {
      await client.entitlements.getBusinessEntitlements({ businessId: "" });
    },
  );

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
