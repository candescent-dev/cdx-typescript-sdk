/**
 * Alert configuration example (Postman "14. Alerts" steps 1–6):
 *   1. Get Alert Types          — GET  /db-alerts-management/v1/alert-types
 *   2. Create Alert Types       — POST /db-alerts-management/v1/alert-types
 *   3. Get Alert Template       — GET  /db-alerts-management/v1/alert-templates
 *   4. Create Alert Template    — POST /db-alerts-management/v1/alert-templates
 *   5. Get Institution Alert Types — GET  /db-alerts-management/v1/institution-alert-types
 *   6. Create Institution Alert Type — POST /db-alerts-management/v1/institution-alert-types
 *
 * Prerequisites:
 *   CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET, CANDESCENT_INSTITUTION_ID
 *
 * Run: npx tsx examples/typescript/alert-configuration.ts
 */

import {
  CandescentClient,
  type AlertTemplateResource,
  type AlertTypeResource,
  type InstitutionAlertTypeResource,
} from "@cdx-forge/di-typescript-sdk";

if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

const INSTITUTION_ID = process.env.CANDESCENT_INSTITUTION_ID ?? "";
const ALERT_TYPE_NAME =
  process.env.CANDESCENT_ALERT_TYPE_NAME ??
  `CUSTOM_DEVEX_ALERT_SDK_${Date.now()}`;

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

async function main(): Promise<void> {
  console.log(`  INSTITUTION_ID:  ${INSTITUTION_ID || "(not set)"}`);
  console.log(`  ALERT_TYPE_NAME: ${ALERT_TYPE_NAME}`);
  console.log();

  const client = CandescentClient.fromEnv();
  console.log("Client initialised\n");

  let alertTypeId: number | undefined;
  let alertTypeName = ALERT_TYPE_NAME;

  // ── 1. Get Alert Types ──────────────────────────────────────────────
  console.log("=== Step 1: Get Alert Types ===");
  try {
    const types = await client.systemAlerts.listTypes({});
    pretty("Alert Types", types);
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // ── 2. Create Alert Types ───────────────────────────────────────────
  console.log("\n=== Step 2: Create Alert Types ===");
  try {
    const alertTypeResource: AlertTypeResource = {
      alertTypeName: ALERT_TYPE_NAME,
      eventTypeDomain: "ACCOUNT",
      externalSystem: `DEVEX_REGISTRATION_${INSTITUTION_ID}`,
      status: "ACTIVE",
      description: "Registration Notification",
      channels: "EMAIL",
      displayAlertTypeName: "DevEx Portal Notification",
      alertCategory: "CUSTOM",
      institutionId: INSTITUTION_ID,
    };

    const createTypeBody = {
      ...alertTypeResource,
      userInputType: "NA",
    };

    const created = await client.systemAlerts.createType(
      { alertTypeResource },
      { body: createTypeBody as unknown as BodyInit },
    );
    pretty("Created Alert Type", created);
    alertTypeId = created.alertTypeId;
    alertTypeName = created.alertTypeName ?? ALERT_TYPE_NAME;
    if (alertTypeId !== undefined) {
      console.log(`\n  alertTypeId:   ${alertTypeId}`);
      console.log(`  alertTypeName: ${alertTypeName}`);
    }
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // ── 3. Get Alert Template ─────────────────────────────────────────────
  console.log("\n=== Step 3: Get Alert Template ===");
  try {
    const templates = await client.templates.listTemplates({});
    pretty("Alert Templates", templates);
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // ── 4. Create Alert Template ──────────────────────────────────────────
  console.log("\n=== Step 4: Create Alert Template ===");
  if (alertTypeId === undefined) {
    console.log("  Skipped — no alertTypeId from step 2");
  } else {
    try {
      const emailBody =
        "<html>\n<head>\n\t<title>Registration</title>\n</head>\n<body>\n" +
        '<p>Hello<span th:remove="tag" th:text="${NAME}">${NAME}</span></p></body>\n</html>\n';

      const alertTemplateResource: AlertTemplateResource = {
        alertTypeResourceId: alertTypeId,
        alertTypeName,
        institutionId: INSTITUTION_ID,
        state: "DRAFT",
        templateContents: [
          {
            channelType: "EMAIL",
            templateContentType: "EMAIL_SUBJECT",
            templateContent: "Developer Portal Registration",
          },
          {
            channelType: "EMAIL",
            templateContentType: "EMAIL_BODY",
            templateContent: emailBody,
          },
        ],
      };

      const createTemplateBody = {
        ...alertTemplateResource,
        vendor: "CANDESCENT",
      };

      const created = await client.templates.createTemplate(
        { alertTemplateResource },
        { body: createTemplateBody as unknown as BodyInit },
      );
      pretty("Created Alert Template", created);
    } catch (e: unknown) {
      console.log(`  Failed: ${e}`);
    }
  }

  // ── 5. Get Institution Alert Types ────────────────────────────────────
  console.log("\n=== Step 5: Get Institution Alert Types ===");
  try {
    const instTypes = await client.institutionAlerts.listInstitutionTypes({});
    pretty("Institution Alert Types", instTypes);
  } catch (e: unknown) {
    console.log(`  Failed: ${e}`);
  }

  // ── 6. Create Institution Alert Type ──────────────────────────────────
  console.log("\n=== Step 6: Create Institution Alert Type ===");
  try {
    const institutionAlertTypeResource: InstitutionAlertTypeResource = {
      alertTypeName,
      channelsOptd: "EMAIL",
      reason: "Alerts when funds drop below a set threshold",
      statusOptd: "ACTIVE",
      institutionId: INSTITUTION_ID,
    };
    const created = await client.institutionAlerts.createInstitutionType({
      institutionAlertTypeResource,
    });
    pretty("Created Institution Alert Type", created);
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
