/**
 * Alert delivery example (Postman "14. Alerts" steps 7–8):
 *   7. Get Alert History  — GET  /db-alerts-delivery/v1/alert-history
 *   8. Publish Events     — POST /db-events/v1/realtime-events
 *
 * Run after alert-configuration.ts (steps 1–6) when exercising the full flow.
 *
 * Prerequisites:
 *   CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET, CANDESCENT_INSTITUTION_ID
 * Additional env vars:
 *   CANDESCENT_HOST_USER_ID       — retail user (required for client_credentials)
 *   CANDESCENT_LOGIN_ID           — login id (alternative to hostUserId)
 *   CANDESCENT_CUSTOMER_ID        — institutionCustomerId for publish / history
 *   CANDESCENT_ALERT_CONTACT_EMAIL — destination email for publish (optional)
 *
 * Run: npx tsx examples/typescript/alert-delivery.ts
 */

import {
  CandescentClient,
  type AlertHistorySummaryResources,
  type Event,
} from "@cdx-forge/di-typescript-sdk";
import { envSetStatus, redact } from "./_helpers.ts";

if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

const HOST_USER_ID = process.env.CANDESCENT_HOST_USER_ID ?? "demo-host-user";
const LOGIN_ID = process.env.CANDESCENT_LOGIN_ID;
const INSTITUTION_ID = process.env.CANDESCENT_INSTITUTION_ID ?? "";
const INSTITUTION_CUSTOMER_ID = process.env.CANDESCENT_CUSTOMER_ID ?? "";
const CONTACT_EMAIL =
  process.env.CANDESCENT_ALERT_CONTACT_EMAIL ?? "demo@example.com";

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

async function main(): Promise<void> {
  console.log(`  HOST_USER_ID:            ${envSetStatus(HOST_USER_ID)}`);
  console.log(`  LOGIN_ID:                ${envSetStatus(LOGIN_ID)}`);
  console.log(`  INSTITUTION_ID:          ${envSetStatus(INSTITUTION_ID)}`);
  console.log(`  INSTITUTION_CUSTOMER_ID: ${envSetStatus(INSTITUTION_CUSTOMER_ID)}`);
  console.log(`  CONTACT_EMAIL:           ${redact(CONTACT_EMAIL)}`);
  console.log();

  const client = CandescentClient.fromEnv();
  const userIdParam = HOST_USER_ID
    ? { hostUserId: HOST_USER_ID }
    : { loginId: LOGIN_ID! };
  console.log("Client initialised\n");

  // ── 7. Get Alert History ──────────────────────────────────────────────
  console.log("=== Step 7: Get Alert History ===");
  try {
    const history: AlertHistorySummaryResources =
      await client.historyAndEvents.listHistory({
        ...userIdParam,
        ...(INSTITUTION_CUSTOMER_ID
          ? { institutionCustomerId: INSTITUTION_CUSTOMER_ID }
          : {}),
      });
    pretty("Alert History", history);

    const items = history.alertHistorySummaryResources;
    if (!items || items.length === 0) {
      console.log("\n  No alert history records returned.");
    }
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // ── 8. Publish Events ─────────────────────────────────────────────────
  console.log("\n=== Step 8: Publish Events ===");

  const publishBody = {
    eventDomainType: "notification",
    eventDetails: {
      eventId: crypto.randomUUID(),
      eventType: "CUSTOM_SAVEUP_ALERT",
      eventSource: `Candescent_${INSTITUTION_ID}`,
      additionalInfo: {},
      institutionId: INSTITUTION_ID,
      ...(INSTITUTION_CUSTOMER_ID
        ? { institutionCustomerId: INSTITUTION_CUSTOMER_ID }
        : {}),
    },
    notification: {
      Name: "Candescent",
    },
    destintionDetails: {
      contactChannels: ["EMAIL"],
      contactEmail: [CONTACT_EMAIL],
    },
  };

  console.log("  Publishing realtime notification event:");
  console.log(`    eventDomainType: notification`);
  console.log(`    eventType:       CUSTOM_SAVEUP_ALERT`);
  console.log(`    eventSource:     Candescent_${INSTITUTION_ID}`);

  try {
    await client.historyAndEvents.publishEvents(
      {
        event: publishBody as Event,
        ...userIdParam,
        ...(INSTITUTION_CUSTOMER_ID
          ? { institutionCustomerId: INSTITUTION_CUSTOMER_ID }
          : {}),
      },
      { body: publishBody as unknown as BodyInit },
    );
    console.log("\n  Event published successfully (202 Accepted)");
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
