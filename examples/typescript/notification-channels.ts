/**
 * Notification Channels example: exercises all 7 operations in the
 * Notification Channels API — institution-wide listing, per-user CRUD
 * for subscriptions, and sending a customer event.
 *
 * These are legacy V1 endpoints; the CandescentClient handles V1 token
 * routing automatically.
 *
 * Prerequisites:
 *   - Set environment variables: CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *     CANDESCENT_INSTITUTION_ID (and optionally CANDESCENT_ENVIRONMENT).
 * Additional env vars:
 *   CANDESCENT_HOST_USER_ID — customer identifier (used as diFicustomer)
 *
 * Run: npx tsx examples/typescript/notification-channels.ts
 */

import {
  CandescentClient,
  type Subscription,
  type Events,
} from "@cdx-forge/di-typescript-sdk";
import { envSetStatus } from "./_helpers.ts";

// Demo fallbacks only when no credentials are configured (e.g. offline dry-run).
if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

const FI_ID = process.env.CANDESCENT_INSTITUTION_ID ?? "05523";
const CUSTOMER_ID =
  process.env.CANDESCENT_INSTITUTION_CUSTOMER_ID ??
  process.env.CANDESCENT_CUSTOMER_ID ??
  process.env.CANDESCENT_HOST_USER_ID ??
  "demo-host-user";

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

async function main(): Promise<void> {
  console.log(`  FI_ID (diFiid):        ${FI_ID}`);
  console.log(`  CUSTOMER_ID:           ${envSetStatus(CUSTOMER_ID)}`);
  console.log(`  ENVIRONMENT env:       ${process.env.CANDESCENT_ENVIRONMENT ?? "(not set)"}`);
  console.log();

  const client = CandescentClient.fromEnv();
  console.log("Client initialised (V1 token routing for /subscriptions/v1/...)");

  // ── 1. List Institution Subscriptions (institution-wide view) ─────
  console.log("\n=== 1. List Institution Subscriptions ===");
  try {
    const instSubs = await client.notificationChannels.listInstitutionSubscriptions({
      diFiid: FI_ID,
    });
    pretty("Institution Subscriptions (GET /subscriptions/v1/fis/{di_fiid}/subscriptions)", instSubs);
    console.log(`\n  Total institution subscriptions returned: ${instSubs?.length ?? 0}`);
  } catch (e: any) {
    console.log(`  List institution subscriptions failed: ${e}`);
  }

  // ── 2. List User Subscriptions ────────────────────────────────────
  console.log("\n=== 2. List User Subscriptions ===");
  try {
    const userSubs = await client.notificationChannels.listUserSubscriptions({
      diFiid: FI_ID,
      diFicustomer: CUSTOMER_ID,
    });
    pretty("User Subscriptions (GET .../fiCustomers/{di_ficustomer}/subscriptions)", userSubs);
    console.log(`\n  Total user subscriptions returned: ${userSubs?.length ?? 0}`);
  } catch (e: any) {
    console.log(`  List user subscriptions failed: ${e}`);
  }

  // ── 3. Create Subscription ────────────────────────────────────────
  console.log("\n=== 3. Create Subscription ===");
  let subscriptionId: string | undefined;
  try {
    const newSub: Subscription = {
      fiId: FI_ID,
      fiCustomerId: CUSTOMER_ID,
      eventTypeId: "BALANCE_THRESHOLD",
    };
    const created = await client.notificationChannels.createSubscription({
      diFiid: FI_ID,
      diFicustomer: CUSTOMER_ID,
      subscription: newSub,
    });
    pretty("Created Subscription (POST .../subscriptions)", created);

    if (created?.id) {
      subscriptionId = created.id;
      console.log(`\n  -> Subscription ID: ${subscriptionId}`);
    }
  } catch (e: any) {
    console.log(`  Create subscription failed: ${e}`);
  }

  if (!subscriptionId) {
    console.log("\n  No subscription ID available — skipping get/update/delete steps.");
    await sendEvent(client);
    await client.close();
    console.log("\nDone.");
    return;
  }

  // ── 4. Get Subscription ───────────────────────────────────────────
  console.log("\n=== 4. Get Subscription ===");
  try {
    const fetched = await client.notificationChannels.getSubscription({
      diFiid: FI_ID,
      diFicustomer: CUSTOMER_ID,
      subscriptionId,
    });
    pretty(`Fetched Subscription ${subscriptionId}`, fetched);
  } catch (e: any) {
    console.log(`  Get subscription failed: ${e}`);
  }

  // ── 5. Update Subscription ────────────────────────────────────────
  console.log("\n=== 5. Update Subscription ===");
  try {
    const updatedSub: Subscription = {
      id: subscriptionId,
      fiId: FI_ID,
      fiCustomerId: CUSTOMER_ID,
      eventTypeId: "BALANCE_THRESHOLD",
      fulfillment: "RECURRING",
    };
    const updated = await client.notificationChannels.updateSubscription({
      diFiid: FI_ID,
      diFicustomer: CUSTOMER_ID,
      subscription: updatedSub,
    });
    pretty("Updated Subscription (PUT .../subscriptions)", updated);
  } catch (e: any) {
    console.log(`  Update subscription failed: ${e}`);
  }

  // ── 6. Delete Subscription ────────────────────────────────────────
  console.log("\n=== 6. Delete Subscription ===");
  try {
    await client.notificationChannels.deleteSubscription({
      diFiid: FI_ID,
      diFicustomer: CUSTOMER_ID,
      subscriptionId,
    });
    console.log(`  Subscription ${subscriptionId} deleted successfully (204 No Content)`);
  } catch (e: any) {
    console.log(`  Delete subscription failed: ${e}`);
  }

  // ── 7. Send Customer Event ────────────────────────────────────────
  await sendEvent(client);

  await client.close();
  console.log("\nDone.");
}

async function sendEvent(client: CandescentClient): Promise<void> {
  console.log("\n=== 7. Send Customer Event ===");
  try {
    const eventsPayload: Events[] = [
      {
        event: [
          {
            fiCustomerId: CUSTOMER_ID,
            fiId: FI_ID,
            eventType: "BALANCE_THRESHOLD",
          },
        ],
      },
    ];
    await client.notificationChannels.sendCustomerEvent({
      diFiid: FI_ID,
      diFicustomer: CUSTOMER_ID!,
      body: eventsPayload,
    });
    console.log("  Customer event sent successfully (204 No Content)");
  } catch (e: any) {
    console.log(`  Send customer event failed: ${e}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
