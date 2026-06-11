/**
 * End-to-end example: exercise all six Money Movement API operations —
 * recipient CRUD and fund transfers.
 *
 * Prerequisites:
 *   - Set environment variables: CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *     CANDESCENT_INSTITUTION_ID (and optionally CANDESCENT_ENVIRONMENT).
 *   - Set CANDESCENT_HOST_USER_ID and CANDESCENT_LOGIN_ID for user context.
 *   - Set CANDESCENT_ACCOUNT_ID for the transfer source account.
 *
 * Run: npx tsx examples/typescript/money-movement.ts
 */

import {
  CandescentClient,
  DIAccountType2,
  type Recipient,
  type Recipients,
  type Transfer,
} from "@cdx-forge/di-typescript-sdk";
import { envSetStatus, runExampleStep, runExampleStepWhen } from "./_helpers.ts";

// Demo fallbacks only when no credentials are configured (e.g. offline dry-run).
if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

const HOST_USER_ID = process.env.CANDESCENT_HOST_USER_ID ?? "demo-host-user";
const LOGIN_ID = process.env.CANDESCENT_LOGIN_ID ?? "";
const ACCOUNT_ID = process.env.CANDESCENT_ACCOUNT_ID ?? "";
const FALLBACK_RECIPIENT_ID = process.env.FALLBACK_RECIPIENT_ID;

// ── Helpers ─────────────────────────────────────────────────────────────

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

const NEW_RECIPIENT: Recipient = {
  memberNumber: "123456789",
  accountNumber: "9876543210",
  accountType: DIAccountType2.SAVINGS,
  nickName: "Test Recipient",
  fullName: "Jane Doe",
};

const UPDATED_RECIPIENT: Recipient = {
  memberNumber: "123456789",
  accountNumber: "9876543210",
  accountType: DIAccountType2.SAVINGS,
  nickName: "Updated Recipient",
  fullName: "Jane D. Smith",
};

async function createRecipientStep(
  client: CandescentClient,
  userIdParam: { hostUserId: string } | { loginId: string },
): Promise<string> {
  let recipientId: string | undefined;
  await runExampleStep(
    "\nStep 2 — Create Recipient  [POST /db-recipients/v1/recipients]",
    async () => {
      const createResponse = await client.recipients.createRecipient({
        recipient: NEW_RECIPIENT,
        ...userIdParam,
      });
      pretty("Create Recipient Response", createResponse);
      recipientId = createResponse.recipients?.[0]?.id;
      if (recipientId) console.log(`\n  -> Recipient ID: ${recipientId}`);
    },
    "Create Recipient",
  );
  if (recipientId) return recipientId;
  if (FALLBACK_RECIPIENT_ID) {
    console.log(`  Using FALLBACK_RECIPIENT_ID: ${FALLBACK_RECIPIENT_ID}`);
    return FALLBACK_RECIPIENT_ID;
  }
  console.log("  No recipient ID available — using demo recipient ID.");
  console.log("  Set FALLBACK_RECIPIENT_ID to use a real known recipient ID.");
  return "demo-recipient-id";
}

async function runTransferStep(
  client: CandescentClient,
  userIdParam: { hostUserId: string } | { loginId: string },
): Promise<void> {
  await runExampleStepWhen(
    !!ACCOUNT_ID,
    "  Skipping — CANDESCENT_ACCOUNT_ID not set.",
    "\nStep 6 — Create Transfer  [POST /db-transfers/v1/transfers]",
    async () => {
      const transferRequest: Transfer = {
        fromAccountId: ACCOUNT_ID,
        toAccountId: "destination-account-id",
        amount: { currencyCode: "USD", amount: 10 },
        memo: "SDK example transfer",
      };
      const transferResponse = await client.transfers.createTransfer({
        ...userIdParam,
        transferRequest,
      });
      pretty("Create Transfer Response", transferResponse);
    },
    "Create Transfer",
  );
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`  HOST_USER_ID:  ${envSetStatus(HOST_USER_ID)}`);
  console.log(`  LOGIN_ID:      ${envSetStatus(LOGIN_ID)}`);
  console.log(`  ACCOUNT_ID:    ${envSetStatus(ACCOUNT_ID)}`);
  console.log();

  const client = CandescentClient.fromEnv();
  const userIdParam = HOST_USER_ID ? { hostUserId: HOST_USER_ID } : { loginId: LOGIN_ID! };
  console.log("Client initialised\n");

  await runExampleStep(
    "Step 1 — List Recipients  [GET /db-recipients/v1/recipients]",
    async () => {
      const recipients = await client.recipients.listRecipients({ ...userIdParam });
      pretty("List Recipients Response", recipients);
    },
    "List Recipients",
  );

  const recipientId = await createRecipientStep(client, userIdParam);

  await runExampleStep(
    "\nStep 3 — Get Recipient  [GET /db-recipients/v1/recipients/{recipientId}]",
    async () => {
      const getResponse = await client.recipients.getRecipient({ recipientId, ...userIdParam });
      pretty("Get Recipient Response", getResponse);
    },
    "Get Recipient",
  );

  await runExampleStep(
    "\nStep 4 — Update Recipient  [PUT /db-recipients/v1/recipients/{recipientId}]",
    async () => {
      const updateResponse = await client.recipients.updateRecipient({
        recipientId,
        recipient: UPDATED_RECIPIENT,
        ...userIdParam,
      });
      pretty("Update Recipient Response", updateResponse);
    },
    "Update Recipient",
  );

  await runExampleStep(
    "\nStep 5 — Delete Recipient  [DELETE /db-recipients/v1/recipients/{recipientId}]",
    async () => {
      const deleteResponse = await client.recipients.deleteRecipient({
        recipientId,
        ...userIdParam,
      });
      pretty("Delete Recipient Response", deleteResponse);
    },
    "Delete Recipient",
  );

  await runTransferStep(client, userIdParam);
  printSummary();
  await client.close();
  console.log("\nDone.");
}

function printSummary(): void {
  console.log(`
========================================================================
  MONEY MOVEMENT API — OPERATIONS SUMMARY
========================================================================

+-----+--------------------+--------+---------------------------------------+
| #   | Operation          | Method | Endpoint                              |
+-----+--------------------+--------+---------------------------------------+
|  1  | List Recipients    | GET    | /db-recipients/v1/recipients          |
|  2  | Create Recipient   | POST   | /db-recipients/v1/recipients          |
|  3  | Get Recipient      | GET    | /db-recipients/v1/recipients/{id}     |
|  4  | Update Recipient   | PUT    | /db-recipients/v1/recipients/{id}     |
|  5  | Delete Recipient   | DELETE | /db-recipients/v1/recipients/{id}     |
|  6  | Create Transfer    | POST   | /db-transfers/v1/transfers            |
+-----+--------------------+--------+---------------------------------------+

KEY TAKEAWAYS:

  1. Recipients are saved payees that can receive transfers.
     Full CRUD is available: list, create, get, update, delete.

  2. Create Transfer supports one-time and recurring transfers,
     including standard, recipient, loan payment, and IRA types.

  3. All operations require either hostUserId or loginId when using
     client_credentials grant type.
`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
