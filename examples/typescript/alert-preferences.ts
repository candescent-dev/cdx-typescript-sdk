/**
 * Alert preferences example (Postman "14. Alerts" steps 9–10):
 *   9. Get User Alert Preferences    — GET  /db-alerts-preferences/v1/alert-preferences
 *  10. Create User Alert Preferences — POST /db-alerts-preferences/v1/alert-preferences
 *
 * Run after alert-configuration.ts and alert-delivery.ts for the full Postman flow.
 *
 * Prerequisites:
 *   CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET, CANDESCENT_INSTITUTION_ID
 * Additional env vars:
 *   CANDESCENT_HOST_USER_ID  — retail user identifier
 *   CANDESCENT_LOGIN_ID      — login identifier (alternative to hostUserId)
 *   CANDESCENT_CUSTOMER_ID   — institutionCustomerId (header + preference body)
 *
 * Run: npx tsx examples/typescript/alert-preferences.ts
 */

import {
  CandescentClient,
  type AlertPreferenceResource,
} from "@cdx-forge/di-typescript-sdk";
import { envSetStatus } from "./_helpers.ts";

if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

const HOST_USER_ID = process.env.CANDESCENT_HOST_USER_ID ?? "demo-host-user";
const LOGIN_ID = process.env.CANDESCENT_LOGIN_ID;
const INSTITUTION_ID = process.env.CANDESCENT_INSTITUTION_ID ?? "";
const INSTITUTION_CUSTOMER_ID =
  process.env.CANDESCENT_CUSTOMER_ID ?? "7226ec52252e4017b0ab01d9536d95be";

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

async function main(): Promise<void> {
  const client = CandescentClient.fromEnv();
  const userIdParam = HOST_USER_ID
    ? { hostUserId: HOST_USER_ID }
    : { loginId: LOGIN_ID! };
  console.log("Client initialised");
  console.log(`  INSTITUTION_CUSTOMER_ID: ${envSetStatus(INSTITUTION_CUSTOMER_ID)}`);
  console.log();

  const listParams = {
    ...userIdParam,
    institutionCustomerId: INSTITUTION_CUSTOMER_ID,
  };

  // ── 9. Get User Alert Preferences ─────────────────────────────────────
  console.log("=== Step 9: Get User Alert Preferences ===");
  try {
    const prefs = await client.userPreferences.list(listParams);
    pretty("User Alert Preferences", prefs);
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // ── 10. Create User Alert Preferences ───────────────────────────────────
  console.log("\n=== Step 10: Create User Alert Preferences ===");
  try {
    const alertPreferenceResource: AlertPreferenceResource = {
      additionalInfo: {},
      alertOpted: true,
      alertPreferenceAccountDetails: {
        accountExternalId: "ctc-vd-a6a54172-755d-4c0b-b1a4-42f1bea73c1c",
        accountId: "9MweppliRXyP-9G4Dzmfcz8-1Lnfbhi_W0kotSR9UnM",
        cardNumber: "4471",
      },
      alertPreferenceDetails: {
        alertPrefId: 0,
        alertTypeName: "VISA-HOUSEHOLD_SPEND_ALERTS",
        channelTypeName: "EMAIL",
        externalId: "string",
        institutionCustomerId: INSTITUTION_CUSTOMER_ID,
        institutionId: INSTITUTION_ID,
      },
      allowCallback: true,
      defaultPreferences: true,
    };

    const result = await client.userPreferences.create({
      alertPreferenceResource,
      ...userIdParam,
      institutionCustomerId: INSTITUTION_CUSTOMER_ID,
    });
    pretty("Created User Alert Preference", result);
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
