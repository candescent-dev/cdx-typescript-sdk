/**
 * Disclosures example: full CRUD lifecycle for both institution-level and
 * user-level disclosures (UserDisclosures / InstitutionDisclosures / ElectronicStatements APIs).
 * Tests both
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
 *   CANDESCENT_HOST_USER_ID  — retail user identifier (required for user disclosures)
 *   CANDESCENT_LOGIN_ID      — alternative to host_user_id
 *   CANDESCENT_ACCOUNT_ID    — account for account-level disclosures (optional)
 *
 * Run: npx tsx examples/typescript/disclosures.ts
 */

import {
  CandescentClient,
  type InstitutionDisclosureCreateRequest,
  type InstitutionDisclosureUpdateRequest,
  type InstitutionUserDisclosureCreateRequest,
  type InstitutionUserDisclosureDeleteRequest,
  type InstitutionUserDisclosureUpdateRequest,
} from "@cdx-forge/di-typescript-sdk";

// Demo fallbacks only when no credentials are configured (e.g. offline dry-run).
if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

const HOST_USER_ID = process.env.CANDESCENT_HOST_USER_ID ?? "demo-host-user";
const LOGIN_ID = process.env.CANDESCENT_LOGIN_ID;
const ACCOUNT_ID = process.env.CANDESCENT_ACCOUNT_ID;

// ── Helpers ─────────────────────────────────────────────────────────────

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

type UserCtx = { hostUserId: string } | { loginId: string };
type DisclosureClient = InstanceType<typeof CandescentClient>;

async function listUserDisclosuresStep(
  client: DisclosureClient,
  label: string,
  userCtx: UserCtx,
): Promise<void> {
  console.log(`\n=== List User Disclosures (${label}) ===`);
  try {
    const userDisclosures = await client.userDisclosures.listUserDisclosures(userCtx);
    pretty(`User Disclosures (${label})`, userDisclosures);
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }
}

async function createUserDisclosureStep(
  client: DisclosureClient,
  label: string,
  userCtx: UserCtx,
  createdDisclosureId: string,
): Promise<boolean> {
  console.log(`\n=== Create User Disclosure (${label}) ===`);
  try {
    const userDisclosure: InstitutionUserDisclosureCreateRequest = {
      institutionDisclosureId: createdDisclosureId,
      institutionUserDisclosureStatus: "ACCEPTED",
    };
    await client.userDisclosures.createUserDisclosure({
      ...userCtx,
      institutionUserDisclosureCreateRequest: userDisclosure,
    });

    const listed = await client.userDisclosures.listUserDisclosures(userCtx);
    const created = listed.institutionUserDisclosures?.find(
      (d) => d.institutionDisclosureId === createdDisclosureId,
    );
    pretty(`Created User Disclosure (${label})`, created ?? userDisclosure);
    return true;
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
    return false;
  }
}

async function updateUserDisclosureStep(
  client: DisclosureClient,
  label: string,
  userCtx: UserCtx,
  createdDisclosureId: string,
  disclosureName: string | undefined,
): Promise<void> {
  console.log(`\n=== Update User Disclosure (${label}) ===`);
  try {
    const updatePayload: InstitutionUserDisclosureUpdateRequest = {
      institutionDisclosureId: createdDisclosureId,
      institutionDisclosureName: disclosureName,
      institutionUserDisclosureStatus: "NOT_ACCEPTED",
    };
    await client.userDisclosures.updateUserDisclosure({
      ...userCtx,
      institutionUserDisclosureUpdateRequest: updatePayload,
    });
    pretty(`Updated User Disclosure (${label})`, updatePayload);
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }
}

async function deleteUserDisclosureStep(
  client: DisclosureClient,
  label: string,
  userCtx: UserCtx,
): Promise<void> {
  console.log(`\n=== Delete User Disclosure (${label}) ===`);
  if (!ACCOUNT_ID) {
    console.log("  Skipping delete (CANDESCENT_ACCOUNT_ID required for OLS disclosure delete)");
    return;
  }
  try {
    const deletePayload: InstitutionUserDisclosureDeleteRequest = {
      institutionDisclosureName: "OLS",
      accountId: ACCOUNT_ID,
    };
    await client.userDisclosures.deleteUserDisclosure({
      ...userCtx,
      accountType: "CHECKING",
      institutionUserDisclosureDeleteRequest: deletePayload,
    });
    console.log("  User disclosure deleted successfully");
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }
}

async function getAccountDisclosuresStep(
  client: DisclosureClient,
  label: string,
  userCtx: UserCtx,
  accountId: string,
): Promise<void> {
  console.log(`\n=== Get Disclosures by Account (${label}) ===`);
  try {
    const acctDisclosures = await client.electronicStatements.getDisclosuresByAccount({
      accountId,
      ...userCtx,
    });
    pretty(`Account Disclosures — ${label} (${accountId})`, acctDisclosures);
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }
}

async function runUserDisclosureFlow(
  client: DisclosureClient,
  label: string,
  userCtx: UserCtx,
  createdDisclosureId: string | undefined,
  disclosureName: string | undefined,
): Promise<void> {
  console.log("\n" + "=".repeat(72));
  console.log(`  User Disclosure Flow — ${label}`);
  console.log("=".repeat(72));

  await listUserDisclosuresStep(client, label, userCtx);

  const userDisclosureCreated = createdDisclosureId
    ? await createUserDisclosureStep(client, label, userCtx, createdDisclosureId)
    : false;

  if (userDisclosureCreated && createdDisclosureId) {
    await updateUserDisclosureStep(client, label, userCtx, createdDisclosureId, disclosureName);
    await deleteUserDisclosureStep(client, label, userCtx);
  }

  if (ACCOUNT_ID) {
    await getAccountDisclosuresStep(client, label, userCtx, ACCOUNT_ID);
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // hostUserId and loginId are mutually exclusive — the SDK will reject
  // calls that pass both.

  const client = CandescentClient.fromEnv();
  console.log("Client initialised");

  let createdDisclosureId: string | undefined;
  let disclosureName: string | undefined;

  // ── 1. List Institution Disclosures ────────────────────────────────────
  console.log("\n=== 1. List Institution Disclosures ===");
  try {
    const disclosures = await client.institutionDisclosures.listInstitutionDisclosures();
    pretty("Institution Disclosures", disclosures);
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // ── 2. Create Institution Disclosure ───────────────────────────────────
  console.log("\n=== 2. Create Institution Disclosure ===");
  try {
    // institutionDisclosureName max length is 20 chars (DSC_12011 if exceeded).
    // Postman uses: TEST_DISCLOSURE_{{$randomInt}}
    disclosureName = `TEST_DISCLOSURE_${String(Date.now() % 1000).padStart(3, "0")}`;
    const newDisclosure: InstitutionDisclosureCreateRequest = {
      institutionDisclosureName: disclosureName,
      institutionDisclosureStatus: true,
    };
    const result = await client.institutionDisclosures.createInstitutionDisclosure({
      institutionDisclosureCreateRequest: newDisclosure,
    });
    pretty("Created Institution Disclosure", result);

    if (result.institutionDisclosureId) {
      createdDisclosureId = result.institutionDisclosureId;
      console.log(`\n  Created disclosure ID: ${createdDisclosureId}`);
    }
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // ── 3. Update Institution Disclosure ───────────────────────────────────
  if (createdDisclosureId && disclosureName) {
    console.log("\n=== 3. Update Institution Disclosure ===");
    try {
      const updated: InstitutionDisclosureUpdateRequest = {
        institutionDisclosureId: createdDisclosureId,
        // Keep within 20-char max (same prefix + 3-digit suffix).
        institutionDisclosureName: `TEST_DISCLOSURE_${String((Date.now() + 1) % 1000).padStart(3, "0")}`,
        institutionDisclosureStatus: true,
      };
      const result = await client.institutionDisclosures.updateInstitutionDisclosure({
        institutionDisclosureId: createdDisclosureId,
        institutionDisclosureUpdateRequest: updated,
      });
      pretty("Updated Institution Disclosure", result);
    } catch (e: unknown) {
      console.log(`  Failed: ${e}`);
    }
  } else {
    console.log("\n  Skipping update (no disclosure ID from create step)");
  }

  // ── 4. User Disclosure flow — hostUserId path ─────────────────────────
  if (HOST_USER_ID) {
    await runUserDisclosureFlow(
      client,
      "hostUserId",
      { hostUserId: HOST_USER_ID },
      createdDisclosureId,
      disclosureName,
    );
  } else {
    console.log("\n  Skipping hostUserId path (CANDESCENT_HOST_USER_ID not set)");
  }

  // ── 5. User Disclosure flow — loginId path ────────────────────────────
  if (LOGIN_ID) {
    await runUserDisclosureFlow(
      client,
      "loginId",
      { loginId: LOGIN_ID },
      createdDisclosureId,
      disclosureName,
    );
  } else {
    console.log("\n  Skipping loginId path (CANDESCENT_LOGIN_ID not set)");
  }

  if (!ACCOUNT_ID) {
    console.log(
      "\n  Skipping account-level disclosures (CANDESCENT_ACCOUNT_ID not set)",
    );
  }

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
