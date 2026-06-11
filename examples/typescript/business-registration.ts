/**
 * Business Banking Registration example: register a business, look up by
 * confirmation number and registration ID, retrieve registration config,
 * and query business details using multiple search types.
 *
 * Includes negative test cases for validation errors.
 *
 * The SDK handles all complexity transparently:
 *   - V1 vs V2 OAuth token routing (based on endpoint path)
 *   - Auth headers, tracing headers, institutionId injection
 *
 * Prerequisites:
 *   - Set environment variables for Business Banking:
 *       CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *       CANDESCENT_INSTITUTION_ID (BB institution, e.g. "05529"),
 *       CANDESCENT_ENVIRONMENT
 * Additional env vars:
 *   CANDESCENT_BB_LOGIN_ID    — existing BB login ID for detail lookups
 *   CANDESCENT_BB_BUSINESS_ID — existing BB business ID for detail lookups
 *
 * Run: npx tsx examples/typescript/business-registration.ts
 */

import {
  BbRegistrationUserType,
  CandescentClient,
  type BbRegistration,
  type BbRegistrationUser,
  type BusinessAddress,
  type BusinessContact,
  type BusinessTinInfo,
} from "@cdx-forge/di-typescript-sdk";
import { runExampleStep, runExampleStepWhen, runExpectedErrorStep } from "./_helpers.ts";

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

// ── Registration request builder ────────────────────────────────────────

/** Build a well-formed business registration payload using typed SDK models. */
function buildValidRegistration(): Omit<
  BbRegistration,
  "approvedDate" | "businessId" | "completedDate" | "confirmationNumber" | "createdUser" | "declinedDate" | "id" | "institutionId" | "message" | "registrationDate"
> {
  const address: BusinessAddress = {
    address1: "100 Main Street",
    city: "Springfield",
    state: "NJ",
    zipCode: "07001",
  };

  const contact: BusinessContact = {
    firstName: "John",
    lastName: "Doe",
    email: "sdk-test@example.com",
    phoneNumber: "555-123-4567",
    address,
  };

  const users: BbRegistrationUser[] = [
    {
      firstName: "John",
      lastName: "Doe",
      email: "sdk-admin@example.com",
      userType: BbRegistrationUserType.PRIMARY_ADMIN,
    },
    {
      firstName: "Jane",
      lastName: "Smith",
      email: "sdk-admin2@example.com",
      userType: BbRegistrationUserType.SECONDARY_ADMIN,
    },
  ];

  const tins: BusinessTinInfo[] = [
    {
      tinNumber: "215732250",
      tinName: "SDK Test Business",
      memberNumber: "123456",
      hostPassword: "TestPass1",
      primary: true,
    },
  ];

  return {
    businessName: "SDK-Test-Registration",
    contact,
    users,
    tins,
    onlineFeatures: ["ACH Origination", "ACH Positive Pay"],
    additionalServices: ["Card Services"],
  };
}

async function createRegistration(
  client: CandescentClient,
): Promise<{ confirmationNumber?: string; registrationId?: string }> {
  let confirmationNumber: string | undefined;
  let registrationId: string | undefined;
  await runExampleStep("\n=== 2. Create Business Registration ===", async () => {
    const result = await client.registration.createRegistration({
      bbRegistration: buildValidRegistration(),
    });
    pretty("Registration Result", result);
    confirmationNumber = result.confirmationNumber;
    registrationId = result.id;
    if (confirmationNumber) console.log(`\n  Confirmation number: ${confirmationNumber}`);
    if (registrationId) console.log(`  Registration ID: ${registrationId}`);
  });
  return { confirmationNumber, registrationId };
}

async function runRegistrationLookups(
  client: CandescentClient,
  confirmationNumber: string | undefined,
  registrationId: string | undefined,
): Promise<void> {
  await runExampleStepWhen(
    !!confirmationNumber,
    "",
    "\n=== 3. Lookup by Confirmation Number ===",
    async () => {
      const lookup = await client.registration.getRegistrationByConfirmation({
        confirmationNumber: confirmationNumber!,
      });
      pretty("Registration (by confirmation)", lookup);
    },
  );

  await runExampleStepWhen(
    !!registrationId,
    "",
    "\n=== 4. Lookup by Registration ID ===",
    async () => {
      const lookup = await client.registration.getRegistrationById({
        registrationId: registrationId!,
      });
      pretty("Registration (by ID)", lookup);
    },
  );
}

async function runLoginIdBusinessDetails(
  client: CandescentClient,
  bbLoginId: string,
): Promise<void> {
  await runExampleStep("\n=== 5. Business Details — by LOGIN_ID ===", async () => {
    const details = await client.profile.getBusinessDetails({
      searchType: "LOGIN_ID",
      searchValue: bbLoginId,
    });
    pretty("Business Details (LOGIN_ID)", details);
  });

  await runExampleStep("\n=== 5b. Business Details — by LOGIN_ID + includeUsers ===", async () => {
    const details = await client.profile.getBusinessDetails({
      searchType: "LOGIN_ID",
      searchValue: bbLoginId,
      includeUsers: true,
    });
    pretty("Business Details (LOGIN_ID + users)", details);
  });
}

async function runBusinessIdDetails(
  client: CandescentClient,
  bbBusinessId: string,
): Promise<void> {
  await runExampleStep("\n=== 6. Business Details — by BUSINESS_ID ===", async () => {
    const details = await client.profile.getBusinessDetails({
      searchType: "BUSINESS_ID",
      searchValue: bbBusinessId,
    });
    pretty("Business Details (BUSINESS_ID)", details);
  });

  await runExampleStep("\n=== 6b. Business Details — by BUSINESS_ID + includeTins ===", async () => {
    const details = await client.profile.getBusinessDetails({
      searchType: "BUSINESS_ID",
      searchValue: bbBusinessId,
      includeTins: true,
    });
    pretty("Business Details (BUSINESS_ID + TINs)", details);
  });

  await runExampleStep(
    "\n=== 6c. Business Details — by BUSINESS_ID + includeUsers + includeTins ===",
    async () => {
      const details = await client.profile.getBusinessDetails({
        searchType: "BUSINESS_ID",
        searchValue: bbBusinessId,
        includeUsers: true,
        includeTins: true,
      });
      pretty("Business Details (BUSINESS_ID + users + TINs)", details);
    },
  );
}

async function runNegativeRegistrationCases(client: CandescentClient): Promise<void> {
  await runExpectedErrorStep("\n=== 7. Negative: Empty businessName (expect 400) ===", async () => {
    const badPayload = buildValidRegistration();
    badPayload.businessName = "";
    await client.registration.createRegistration({ bbRegistration: badPayload });
  });

  await runExpectedErrorStep("\n=== 8. Negative: Invalid TIN (expect validation error) ===", async () => {
    const badPayload = buildValidRegistration();
    badPayload.tins = [{ tinNumber: "215", tinName: "Bad TIN", primary: true }];
    await client.registration.createRegistration({ bbRegistration: badPayload });
  });

  await runExpectedErrorStep(
    "\n=== 9. Negative: Invalid confirmation number (expect error) ===",
    async () => {
      await client.registration.getRegistrationByConfirmation({
        confirmationNumber: "INVALID-CONF-000",
      });
    },
  );

  await runExpectedErrorStep("\n=== 10. Negative: Invalid searchType (expect error) ===", async () => {
    await client.profile.getBusinessDetails({ searchType: "INVALID_TYPE", searchValue: "test" });
  });
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const bbLoginId = process.env.CANDESCENT_BB_LOGIN_ID;
  const bbBusinessId = process.env.CANDESCENT_BB_BUSINESS_ID;

  const client = CandescentClient.fromEnv();
  console.log("Client initialised (Business Banking)");

  await runExampleStep("\n=== 1. Get Registration Config ===", async () => {
    const config = await client.registration.getRegistrationConfig();
    pretty("Registration Config", config);
  });

  const { confirmationNumber, registrationId } = await createRegistration(client);
  await runRegistrationLookups(client, confirmationNumber, registrationId);

  if (bbLoginId) {
    await runLoginIdBusinessDetails(client, bbLoginId);
  } else {
    console.log("\n  Skipping LOGIN_ID lookup (CANDESCENT_BB_LOGIN_ID not set)");
  }

  if (bbBusinessId) {
    await runBusinessIdDetails(client, bbBusinessId);
  } else {
    console.log("\n  Skipping BUSINESS_ID lookup (CANDESCENT_BB_BUSINESS_ID not set)");
  }

  await runNegativeRegistrationCases(client);
  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
