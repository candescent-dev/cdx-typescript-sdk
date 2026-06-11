/**
 * End-to-end example: register a customer, then look them up via three
 * different Candescent API endpoints and compare the responses.
 *
 * The SDK handles all complexity transparently:
 *   - V1 vs V2 OAuth token routing (based on endpoint path)
 *   - XML-to-JSON response conversion (registration & bankingservices)
 *   - Auth headers, tracing headers, institutionId injection
 *
 * Prerequisites:
 *   - Set environment variables: CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *     CANDESCENT_INSTITUTION_ID (and optionally CANDESCENT_ENVIRONMENT).
 * Run: npx tsx examples/typescript/register-and-lookup.ts
 */

import {
  CandescentClient,
  type RegisterCustomerRequest,
  type FICustomerRequest,
  type CustomerInformation,
  type RegisterCustomerResponse,
} from "@cdx-forge/di-typescript-sdk";
import {
  envSetStatus,
  maskSensitive,
  runExampleStep,
  secureRandomChoice,
  secureRandomInt,
} from "./_helpers.ts";

// Demo fallbacks only when no credentials are configured (e.g. offline dry-run).
if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

const FI_ID = process.env.CANDESCENT_INSTITUTION_ID ?? "05523";
const FALLBACK_CUSTOMER_ID = process.env.FALLBACK_CUSTOMER_ID;

const FIRST_NAMES = [
  "James", "Emma", "Liam", "Olivia", "Noah", "Ava", "William",
  "Sophia", "Benjamin", "Isabella", "Mason", "Charlotte", "Ethan",
];

// ── Helpers ─────────────────────────────────────────────────────────────

function randomMemberNumber(): string {
  return String(secureRandomInt(100_000_000, 1_000_000_000));
}

function randomLoginId(minLen = 6, maxLen = 12): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@$*_-=.!~";
  const length = secureRandomInt(minLen, maxLen + 1);
  return Array.from({ length }, () => chars[secureRandomInt(0, chars.length)]).join("");
}

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

// ── Registration request builder ────────────────────────────────────────

function buildRegistrationRequest(fiId: string): {
  request: RegisterCustomerRequest;
  memberNumber: string;
  loginId: string;
} {
  const memberNumber = randomMemberNumber();
  const loginId = randomLoginId();

  const fiCustomer: FICustomerRequest = {
    id: { value: "0", type: "GUID" },
    fiId: { value: fiId },
    memberNumber,
    person: {
      personName: {
        firstName: secureRandomChoice(FIRST_NAMES),
        lastName: "ZionTest",
      },
      contactInfo: {
        emailAddress: `ziontest+${memberNumber}@example.com`,
        postalAddress: [
          {
            address1: "123 Main Street",
            address2: "",
            address3: "",
            city: "City Name",
            state: "NJ",
            postalCode: "07047",
            country: "USA",
          },
        ],
        phoneNumber: [
          { number: "1231231231", countryCode: "0" },
        ],
      },
      birthDate: "1989-10-09",
    },
    channelInfos: {
      channelInfo: [
        {
          channelType: "TPV_API",
          credential: { loginId, password: "Test@@@123" },
        },
      ],
    },
    acceptedDisclosure: "false",
    userType: "PRIMARY",
    ssn: "123456789",
    motherMaidenName: "MaidenName",
    hostCredential: { password: "1234576" },
  };

  return { request: { fICustomer: fiCustomer }, memberNumber, loginId };
}

function extractCustomerGuid(response: RegisterCustomerResponse): string | undefined {
  const id = response.fICustomer?.id;
  if (typeof id === "object" && id?.value) return id.value;
  if (typeof id === "string") return id;
  return (response as { FICustomer?: { id?: string } })?.FICustomer?.id;
}

async function registerCustomer(client: CandescentClient): Promise<string> {
  const { request, memberNumber, loginId } = buildRegistrationRequest(FI_ID);
  console.log("\nRegistering customer...");
  console.log(`  memberNumber: ${maskSensitive(memberNumber)}`);
  console.log(`  loginId:      ${maskSensitive(loginId)}`);
  console.log(`  fiId:         ${FI_ID}`);

  let customerGuid: string | undefined;
  await runExampleStep("", async () => {
    const response = await client.registrationAndAccess.register({
      diFiid: FI_ID,
      body: request,
    });
    pretty("Registration Response (POST /registration/v4/...)", response);
    customerGuid = extractCustomerGuid(response);
    if (customerGuid) console.log(`\n  -> Customer GUID: ${maskSensitive(customerGuid)}`);
  }, "Registration");

  if (customerGuid) return customerGuid;

  console.log("\n  NOTE: Registration may require valid member data in the FI core.");
  if (FALLBACK_CUSTOMER_ID) {
    console.log(`  Using FALLBACK_CUSTOMER_ID: ${maskSensitive(FALLBACK_CUSTOMER_ID)}`);
    return FALLBACK_CUSTOMER_ID;
  }
  console.log("  No customer GUID available — using demo customer ID for lookup examples.");
  console.log("  Set FALLBACK_CUSTOMER_ID to use a real known customer GUID.");
  return "00000000-0000-0000-0000-000000000000";
}

async function runCustomerLookups(
  client: CandescentClient,
  customerGuid: string,
): Promise<void> {
  let institutionUserId: string | undefined;

  await runExampleStep("\nLookup #3 — Get Customer Information  [/ux-users/v1/...]", async () => {
    const info: CustomerInformation = await client.profileAndStatus.getInformation({
      customerId: customerGuid,
    });
    pretty("Response #3 — Get Customer Information  [/ux-users/v1/...]", info);
    institutionUserId = info.userId;
  }, "Lookup #3");

  const lookup2Id = institutionUserId ?? customerGuid;
  await runExampleStep("\nLookup #2 — Get Institution User  [/db-users/v1/...]", async () => {
    console.log(
      `  Using ID: ${lookup2Id} (source: ${institutionUserId ? "userId from Lookup #3" : "customer GUID"})`,
    );
    const instUser = await client.profileAndStatus.getInstitutionUser({
      institutionUserId: lookup2Id,
    });
    pretty("Response #2 — Get Institution User  [/db-users/v1/...]", instUser);
  }, "Lookup #2");

  await runExampleStep("\nLookup #1 — Get FI Customer  [/bankingservices/v2/...]", async () => {
    const customer = await client.profileAndStatus.getCustomer({
      fiId: FI_ID,
      fiCustomerId: customerGuid,
    });
    pretty("Response #1 — Get FI Customer  [/bankingservices/v2/...]", customer);
  }, "Lookup #1");
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`  FI_ID (di_fiid):       ${FI_ID}`);
  console.log(`  INSTITUTION_ID env:    ${envSetStatus(process.env.CANDESCENT_INSTITUTION_ID)}`);
  console.log(`  ENVIRONMENT env:       ${envSetStatus(process.env.CANDESCENT_ENVIRONMENT)}`);
  console.log();

  const client = CandescentClient.fromEnv();
  console.log("Client initialised (V1 + V2 dual-token routing enabled)");

  const customerGuid = await registerCustomer(client);
  console.log(`\n  Using Customer GUID: ${maskSensitive(customerGuid)}`);

  await runCustomerLookups(client, customerGuid);
  printComparisonSummary();

  await client.close();
  console.log("\nDone.");
}

function printComparisonSummary(): void {
  console.log(`
========================================================================
  COMPARISON OF THE THREE CUSTOMER LOOKUP ENDPOINTS
========================================================================

+-------------------------+------------------------+----------------------+--------------------------+
| Aspect                  | Get FI Customer (V2)   | Get Institution User | Get Customer Information |
|                         | /bankingservices/v2/   | /db-users/v1/        | /ux-users/v1/            |
+-------------------------+------------------------+----------------------+--------------------------+
| OAuth Token             | V1 (Legacy)            | V2 (Current)         | V2 (Current)             |
+-------------------------+------------------------+----------------------+--------------------------+
| Response Format         | XML (auto-converted)   | JSON                 | JSON                     |
+-------------------------+------------------------+----------------------+--------------------------+
| Primary Use Case        | Full digital banking   | Institution-level    | Registration & contact   |
|                         | profile                | user record          | details                  |
+-------------------------+------------------------+----------------------+--------------------------+
| Lookup ID               | fiCustomerId (GUID)    | institutionUserId    | customerId (GUID)        |
+-------------------------+------------------------+----------------------+--------------------------+

KEY TAKEAWAYS:

  1. Get FI Customer (V2) is the most comprehensive — full digital banking
     profile. XML is converted to JSON automatically by the SDK.

  2. Get Institution User uses a DIFFERENT ID (userId, not customer GUID).
     Lightweight, focused on role/type and parent-child relationships.

  3. Get Customer Information is registration-centric — names, contacts,
     login status. Contains the userId needed for Institution User lookup.
`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
