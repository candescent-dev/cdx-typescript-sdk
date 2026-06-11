/**
 * User Status example: query user status via all four supported userIdType
 * variants and compare the responses.
 *
 * The SDK handles all complexity transparently:
 *   - V1 vs V2 OAuth token routing (based on endpoint path)
 *   - Auth headers, tracing headers, institutionId injection
 *
 * Prerequisites:
 *   - Set environment variables: CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *     CANDESCENT_INSTITUTION_ID (and optionally CANDESCENT_ENVIRONMENT).
 * Additional env vars (set at least one):
 *   CANDESCENT_HOST_USER_ID        — maps to HOST_USER_ID
 *   CANDESCENT_LOGIN_ID            — maps to LOGIN_ID
 *   CANDESCENT_CUSTOMER_ID         — maps to CUSTOMER_ID
 *   CANDESCENT_INSTITUTION_USER_ID — maps to INSTITUTION_USER_ID
 *
 * Run: npx tsx examples/typescript/user-status.ts
 */

import { CandescentClient } from "@cdx-forge/di-typescript-sdk";
import { maskSensitive } from "./_helpers.ts";

// Demo fallbacks only when no credentials are configured (e.g. offline dry-run).
if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

type UserIdType =
  | "INSTITUTION_USER_ID"
  | "HOST_USER_ID"
  | "LOGIN_ID"
  | "CUSTOMER_ID";

// ── Helpers ─────────────────────────────────────────────────────────────

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

/**
 * Maps each supported userIdType to the env var that supplies the
 * corresponding user identifier.
 */
const ID_TYPE_MAP: Record<UserIdType, string> = {
  HOST_USER_ID: "CANDESCENT_HOST_USER_ID",
  LOGIN_ID: "CANDESCENT_LOGIN_ID",
  CUSTOMER_ID: "CANDESCENT_CUSTOMER_ID",
  INSTITUTION_USER_ID: "CANDESCENT_INSTITUTION_USER_ID",
};

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const lookups: Array<{ idType: UserIdType; value: string }> = [];
  for (const idType of Object.keys(ID_TYPE_MAP) as UserIdType[]) {
    const value = process.env[ID_TYPE_MAP[idType]];
    if (value) {
      lookups.push({ idType, value });
    }
  }

  if (lookups.length === 0) {
    lookups.push({ idType: "HOST_USER_ID", value: "demo-host-user" });
    console.log("  No user ID env vars set — using dummy HOST_USER_ID: demo-host-user");
  }

  const client = CandescentClient.fromEnv();
  console.log("Client initialised");
  console.log(
    `Will query user status for ${lookups.length} ID type(s): ${lookups.map((l) => l.idType).join(", ")}`,
  );

  // ── Query each configured userIdType ──────────────────────────────────

  for (const { idType, value } of lookups) {
    console.log(`\n=== Get User Status (userIdType=${idType}) ===`);
    console.log(`  userId: ${maskSensitive(value)}`);
    try {
      const status = await client.profileAndStatus.getUserStatus({
        userId: value,
        userIdType: idType,
      });
      pretty(`User Status (${idType})`, status);
    } catch (e: unknown) {
      console.log(`  Failed: ${e}`);
    }
  }

  // ── Negative case: invalid userIdType ─────────────────────────────────

  console.log("\n=== Negative: Invalid userIdType (expect error) ===");
  try {
    await client.profileAndStatus.getUserStatus({
      userId: "test",
      userIdType: "INVALID_TYPE" as UserIdType,
    });
    console.log("  UNEXPECTED SUCCESS — should have returned an error");
  } catch (e: unknown) {
    console.log(`  Expected error: ${e}`);
  }

  // ── Negative: non-existent user ───────────────────────────────────────

  console.log("\n=== Negative: Non-existent user (expect 404) ===");
  try {
    await client.profileAndStatus.getUserStatus({
      userId: "000000000",
      userIdType: "HOST_USER_ID",
    });
    console.log("  UNEXPECTED SUCCESS — should have returned an error");
  } catch (e: unknown) {
    console.log(`  Expected error: ${e}`);
  }

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
