/**
 * Customer Management example: get contact methods, update contact info,
 * reset password, and unlock a user account.
 *
 * These four operations complement the registration/lookup flows in
 * register-and-lookup.ts and the status queries in user-status.ts.
 *
 * The SDK handles all complexity transparently:
 *   - V1 vs V2 OAuth token routing (based on endpoint path)
 *   - Auth headers, tracing headers, institutionId injection
 *
 * Prerequisites:
 *   - Set environment variables: CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *     CANDESCENT_INSTITUTION_ID (and optionally CANDESCENT_ENVIRONMENT).
 *   - Set CANDESCENT_CUSTOMER_ID to a valid customer GUID.
 *
 * Run: npx tsx examples/typescript/customer-management.ts
 */

import {
  CandescentClient,
  type ContactMethodResponse,
  type ContactInfo,
  type ResetPasswordRequest,
} from "@cdx-forge/di-typescript-sdk";

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

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const customerId = process.env.CANDESCENT_CUSTOMER_ID ?? "00000000-0000-0000-0000-000000000000";
  const client = CandescentClient.fromEnv();
  console.log("Client initialised");
  console.log(`  customerId: ${customerId}`);

  // ── 1. Get Contact Methods ──────────────────────────────────────────
  //   Fetch available contact methods (SMS, Voice, Email) for the customer.
  //   The response includes contactMethodId values needed for resetPassword.

  let contactMethodId: string | undefined;

  console.log("\n=== Step 1: Get Contact Methods ===");
  try {
    const methods: ContactMethodResponse =
      await client.contactInfo.getContactMethods({
        customerId,
      });
    pretty("Contact Methods", methods);

    if (methods.contactMethods?.length) {
      contactMethodId = methods.contactMethods[0].id;
      console.log(`\n  First contact method ID: ${contactMethodId}`);
    }
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // ── 2. Update Contact Info ──────────────────────────────────────────
  //   Update email and/or phone number for the customer.
  //   This is a PUT-style operation; the server returns no body on success.

  console.log("\n=== Step 2: Update Contact Info ===");
  try {
    const contactInfo: ContactInfo = {
      email: {
        emailAddress: `updated+${customerId.slice(0, 8)}@example.com`,
      },
      phoneNumber: {
        oldPhoneNumber: "1231231231",
        oldCountryCode: "1",
        newPhoneNumber: "9879879876",
        newCountryCode: "1",
      },
    };

    await client.contactInfo.updateContactInfo({
      customerId,
      contactInfo,
    });
    console.log("  Contact info updated successfully (no response body expected)");
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // ── 3. Reset Password ──────────────────────────────────────────────
  //   Sends a password-reset OTP to the specified contact method.
  //   Requires a contactMethodId from step 1.

  console.log("\n=== Step 3: Reset Password ===");
  if (contactMethodId) {
    try {
      const resetPasswordRequest: ResetPasswordRequest = {
        contactMethodId,
        protocol: "SMS",
      };

      await client.registrationAndAccess.resetPassword({
        customerId,
        resetPasswordRequest,
      });
      console.log("  Password reset initiated successfully (OTP sent via SMS)");
    } catch (e: unknown) {
      console.log(`  Failed: ${e}`);
    }
  } else {
    console.log("  Skipped — no contactMethodId available from step 1");
  }

  // ── 4. Unlock User ─────────────────────────────────────────────────
  //   Unlocks a customer account that has been locked (e.g. too many
  //   failed login attempts). No-op if the account is not locked.

  console.log("\n=== Step 4: Unlock User ===");
  try {
    await client.registrationAndAccess.unlockUser({
      customerId,
    });
    console.log("  User unlocked successfully (no response body expected)");
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
