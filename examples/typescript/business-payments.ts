/**
 * Business Payments (ACH & Wire) example: create and list ACH/Wire payments
 * through the Business Banking Payments API.
 *
 * Covers all 6 operations now available in spec 1.6.0:
 *   createAchPayment, getAchPayments, getAchPayment,
 *   createWirePayment, getWirePayments, getWirePayment
 *
 * Prerequisites (BB Apigee credentials for OAuth — does not use main CANDESCENT_CLIENT_* vars):
 *   CANDESCENT_BB_CLIENT_ID, CANDESCENT_BB_CLIENT_SECRET
 *   Source: apigee-bb-stg Postman environment
 *
 * Optional:
 *   CANDESCENT_BB_INSTITUTION_ID  — BB institution (default: CANDESCENT_INSTITUTION_ID, e.g. "05529")
 *   CANDESCENT_APIGEE_BASE_URL    — OAuth host (default: apigee-bb-stg `apigee_base_url`)
 *   CANDESCENT_ENVIRONMENT        — payments API host: "stage" (default) | "production"
 *
 * Additional env vars:
 *   CANDESCENT_BB_LOGIN_ID   — business user login ID (Postman: LOGIN_ID)
 *   CANDESCENT_BB_ACCOUNT_ID — originating account number for create calls (required for steps 1 & 4)
 *   CANDESCENT_ACCOUNT_ID    — fallback for BB account number
 *   CANDESCENT_BB_TIN_NUMBER      — TIN for create payloads (optional; apigee-bb-stg entitledTins.tinNumber)
 *   CANDESCENT_BB_ACH_COMPANY_ID   — achCompanyId for ACH create (optional; user entitlements achCompanyIds)
 *
 * Run (from repo root):
 *   npx tsx examples/typescript/business-payments.ts
 *
 * Repo-root `.env` is loaded automatically when present (same as run-all-typescript-examples.mjs).
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CandescentClient,
  ClientCredentialsProvider,
  Environment,
  TokenEndpoint,
  type AchPayment,
  type WirePayment,
  AchPaymentPaymentTypeEnum,
  AchPaymentTransactionTypeEnum,
  AchPaymentAchSecCodeEnum,
  AchTransactionContactAccountTypeEnum,
  WirePaymentPaymentTypeEnum,
  WirePaymentTransactionTypeEnum,
} from "@cdx-forge/di-typescript-sdk";
import { loadRepoDotEnv } from "../../scripts/load-dotenv.mjs";
import { assertCandescentHttpsBase, envSetStatus, runExampleStep, runExampleStepWhen } from "./_helpers.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
Object.assign(process.env, loadRepoDotEnv(REPO_ROOT));

function resolveApigeeBase(): string {
  const fromEnv = process.env.CANDESCENT_APIGEE_BASE_URL?.replace(/\/$/, "");
  const candidate =
    fromEnv ??
    (process.env.CANDESCENT_ENVIRONMENT?.toLowerCase() === "production"
      ? "https://api.candescent.com/digitalbanking"
      : "https://api.candescent.com/digitalbanking/stage");
  return assertCandescentHttpsBase(candidate);
}

function resolvePaymentsApiBase(): string {
  return process.env.CANDESCENT_ENVIRONMENT?.toLowerCase() === "production"
    ? Environment.Production
    : Environment.Stage;
}

/**
 * BB payments client aligned with Postman apigee-bb-stg:
 *   OAuth:  {apigee_base_url}/oauth2/v1/token  (BB client_id / client_secret)
 *   APIs:   api.stage.candescent.com/v1/... (stage host — do not use /db-bb-payments on Apigee; bb-stg client gets CMN_90001 there)
 */
function createBbPaymentsClient(): CandescentClient {
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
    baseUrl: resolvePaymentsApiBase(),
  });
}

const LOGIN_ID =
  process.env.CANDESCENT_BB_LOGIN_ID ??
  process.env.CANDESCENT_LOGIN_ID ??
  "";
const ACCOUNT_ID =
  process.env.CANDESCENT_BB_ACCOUNT_ID ??
  process.env.CANDESCENT_ACCOUNT_ID ??
  "";
const TIN_NUMBER = process.env.CANDESCENT_BB_TIN_NUMBER ?? "";
const ACH_COMPANY_ID = process.env.CANDESCENT_BB_ACH_COMPANY_ID ?? "cghfghgwew";

// ── Helpers ─────────────────────────────────────────────────────────────

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function buildAchPayment(deliveryDate: string): AchPayment {
  return {
    paymentName: "Vendor Payroll Batch",
    paymentDescription: "payroll",
    paymentType: AchPaymentPaymentTypeEnum.ACH_PAYMENT,
    transactionType: AchPaymentTransactionTypeEnum.DEBIT,
    deliveryDate,
    accountNumber: ACCOUNT_ID,
    tinNumber: TIN_NUMBER || "675636454",
    achCompanyId: ACH_COMPANY_ID,
    achSecCode: AchPaymentAchSecCodeEnum.COMMERCIAL_CCD,
    achTransactions: [
      {
        amount: 1500.0,
        currencyCode: "USD" as any,
        contactName: "Supplier Inc",
        contactAccountNumber: "9876543210",
        contactAccountType: AchTransactionContactAccountTypeEnum.BUSINESS_CHECKING,
        contactBankAchRoutingNumber: "021000021",
      },
    ],
  };
}

function buildWirePayment(deliveryDate: string): WirePayment {
  return {
    paymentName: "Domestic Wire Transfer",
    paymentDescription: "One-time vendor payment",
    paymentType: WirePaymentPaymentTypeEnum.WIRE_DOMESTIC,
    transactionType: WirePaymentTransactionTypeEnum.DEBIT,
    deliveryDate,
    accountNumber: ACCOUNT_ID,
    tinNumber: TIN_NUMBER || "675636454",
    wireTransaction: {
      amount: 25000.0,
      currencyCode: "USD" as any,
      beneficiaryDetails: {
        beneficiaryName: "ABC Supplier Inc",
        beneficiaryAccountNumber: "111222333444",
        purposeOfWire: "Trade payment",
        address: {
          address1: "100 Main St",
          city: "New York",
          state: "NY",
          zipCode: "10001",
          country: "United States",
        },
      },
      beneficiaryBankDetails: {
        beneficiaryBankRoutingNumber: "021000021",
        beneficiaryBankName: "Chase Bank",
      },
    } as any,
  };
}

async function runAchPaymentFlow(
  client: CandescentClient,
  loginId: string,
  today: Date,
  thirtyDaysAgo: Date,
  tomorrow: Date,
): Promise<string | undefined> {
  let achPaymentId: string | undefined;
  await runExampleStepWhen(
    !!ACCOUNT_ID,
    "  Skipped — set CANDESCENT_BB_ACCOUNT_ID or CANDESCENT_ACCOUNT_ID",
    "\n=== 1. Create ACH Payment ===",
    async () => {
      const result = await client.payments.createAchPayment({
        loginId,
        achPayment: buildAchPayment(formatDate(tomorrow)),
      });
      pretty("Created ACH Payment", result);
      achPaymentId = result.id;
      if (achPaymentId) console.log(`  -> ACH Payment ID: ${achPaymentId}`);
    },
  );

  await runExampleStep("\n=== 2. List ACH Payments ===", async () => {
    const payments = await client.payments.getAchPayments({
      loginId,
      fromDate: thirtyDaysAgo,
      toDate: today,
    });
    pretty("ACH Payments", payments);
  });

  await runExampleStepWhen(
    !!achPaymentId,
    "\n=== 3. Get ACH Payment by ID ===\n  Skipped — no ACH payment ID from create step",
    `\n=== 3. Get ACH Payment by ID (${achPaymentId}) ===`,
    async () => {
      const detail = await client.payments.getAchPayment({
        loginId,
        paymentId: achPaymentId!,
      });
      pretty("ACH Payment Detail", detail);
    },
  );

  return achPaymentId;
}

async function runWirePaymentFlow(
  client: CandescentClient,
  loginId: string,
  today: Date,
  thirtyDaysAgo: Date,
  tomorrow: Date,
): Promise<void> {
  let wirePaymentId: string | undefined;
  await runExampleStepWhen(
    !!ACCOUNT_ID,
    "  Skipped — set CANDESCENT_BB_ACCOUNT_ID or CANDESCENT_ACCOUNT_ID",
    "\n=== 4. Create Wire Payment ===",
    async () => {
      const result = await client.payments.createWirePayment({
        loginId,
        wirePayment: buildWirePayment(formatDate(tomorrow)),
      });
      pretty("Created Wire Payment", result);
      wirePaymentId = result.id;
      if (wirePaymentId) console.log(`  -> Wire Payment ID: ${wirePaymentId}`);
    },
  );

  await runExampleStep("\n=== 5. List Wire Payments ===", async () => {
    const payments = await client.payments.getWirePayments({
      loginId,
      fromDate: thirtyDaysAgo,
      toDate: today,
    });
    pretty("Wire Payments", payments);
  });

  await runExampleStepWhen(
    !!wirePaymentId,
    "\n=== 6. Get Wire Payment by ID ===\n  Skipped — no wire payment ID from create step",
    `\n=== 6. Get Wire Payment by ID (${wirePaymentId}) ===`,
    async () => {
      const detail = await client.payments.getWirePayment({
        loginId,
        paymentId: wirePaymentId!,
      });
      pretty("Wire Payment Detail", detail);
    },
  );
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const client = createBbPaymentsClient();
  console.log("Client initialised (Business Banking Payments)");
  console.log(`  LOGIN_ID:   ${envSetStatus(LOGIN_ID)}`);
  console.log(
    `  ACCOUNT_ID: ${ACCOUNT_ID ? envSetStatus(ACCOUNT_ID) : "(not set — create steps skipped)"}`,
  );
  console.log();

  if (!LOGIN_ID) {
    throw new Error(
      "Set CANDESCENT_BB_LOGIN_ID (Postman apigee-bb-stg LOGIN_ID, e.g. Swpa123)",
    );
  }

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  await runAchPaymentFlow(client, LOGIN_ID, today, thirtyDaysAgo, tomorrow);
  await runWirePaymentFlow(client, LOGIN_ID, today, thirtyDaysAgo, tomorrow);

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
