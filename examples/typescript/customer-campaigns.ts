/**
 * Covers APIs split across Experience Groups, Jobs, Audience, and Promotions Suite.
 *
 * The SDK handles all complexity transparently:
 *   - V1 vs V2 OAuth token routing (based on endpoint path)
 *   - Auth headers, tracing headers, institutionId injection
 *
 * Prerequisites:
 *   - Set environment variables: CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *     CANDESCENT_INSTITUTION_ID (and optionally CANDESCENT_ENVIRONMENT).
 * Additional env vars:
 *   CANDESCENT_FI_ID  — FI identifier (falls back to CANDESCENT_INSTITUTION_ID)
 *
 * Run: npx tsx examples/typescript/customer-campaigns.ts
 */

import {
  CandescentClient,
  type GroupBaseRequestDTO,
  type GroupBaseResponseDTO,
  type UserList,
  type UserListsDTO,
} from "@cdx-forge/di-typescript-sdk";
import { runExampleStep, runExampleStepWhen } from "./_helpers.ts";

// Demo fallbacks only when no credentials are configured (e.g. offline dry-run).
if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

const FI_ID =
  process.env.CANDESCENT_FI_ID ??
  process.env.CANDESCENT_INSTITUTION_ID ??
  "05523";

// ── Helpers ─────────────────────────────────────────────────────────────

function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

async function createExperienceGroup(client: CandescentClient): Promise<string | undefined> {
  let createdGroupId: string | undefined;
  await runExampleStep("\n=== 2. Create Experience Group ===", async () => {
    const newGroup: GroupBaseRequestDTO = {
      groupName: "SDK_TEST_GROUP",
      groupDescription: "Created by SDK example script",
    };
    const result: GroupBaseResponseDTO = await client.experienceGroups.createExperienceGroup({
      groupBaseRequestDTO: newGroup,
    });
    pretty("Created Experience Group", result);
    createdGroupId = result.groupId;
    if (createdGroupId) console.log(`\n  Created group ID: ${createdGroupId}`);
  });
  return createdGroupId;
}

async function listJobsAndDiscoverId(client: CandescentClient): Promise<string | undefined> {
  let firstJobId: string | undefined;
  await runExampleStep("\n=== 5. List Jobs ===", async () => {
    const jobs = await client.jobs.listJobs({});
    pretty("Jobs", jobs);
    firstJobId = jobs.content?.[0]?.jobId;
    if (firstJobId) console.log(`\n  Auto-discovered job_id: ${firstJobId}`);
  });
  return firstJobId;
}

function buildUserListMetadata(): UserListsDTO {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return {
    userLists: [
      {
        fileMetadata: {
          userlistFileName: `FI${FI_ID}_MetaData_${timestamp}.csv`,
          userlistName: "SDK_TEST_LIST",
          userlistOperation: "CREATE",
          userlistDescription: "Created by SDK example script",
        },
      },
    ],
  };
}

async function runExperienceGroupLifecycle(
  client: CandescentClient,
  createdGroupId: string | undefined,
): Promise<void> {
  await runExampleStepWhen(
    !!createdGroupId,
    "\n  Skipping update (no group ID from create step)",
    "\n=== 3. Update Experience Group ===",
    async () => {
      const updatedGroup: GroupBaseRequestDTO = {
        groupName: "SDK_TEST_GROUP_UPDATED",
        groupDescription: "Updated by SDK example script",
      };
      const result = await client.experienceGroups.updateExperienceGroup({
        groupId: createdGroupId!,
        groupBaseRequestDTO: updatedGroup,
      });
      pretty("Updated Experience Group", result);
    },
  );

  await runExampleStepWhen(
    !!createdGroupId,
    "\n  Skipping delete (no group ID from create step)",
    "\n=== 4. Delete Experience Group ===",
    async () => {
      await client.experienceGroups.deleteExperienceGroup({ groupId: createdGroupId! });
      console.log("  Experience group deleted successfully");
    },
  );
}

async function runJobSteps(client: CandescentClient, firstJobId: string | undefined): Promise<void> {
  await runExampleStepWhen(
    !!firstJobId,
    "\n  Skipping get job (no job_id available)",
    "\n=== 6. Get Job ===",
    async () => {
      const job = await client.jobs.getJob({ jobId: firstJobId! });
      pretty(`Job (${firstJobId})`, job);
    },
  );

  await runExampleStepWhen(
    !!firstJobId,
    "\n  Skipping get job errors (no job_id available)",
    "\n=== 7. Get Job Errors ===",
    async () => {
      const errors = await client.jobs.getJobErrors({ jobId: firstJobId! });
      pretty(`Job Errors (${firstJobId})`, errors);
    },
  );

  await runExampleStepWhen(
    !!firstJobId,
    "\n  Skipping get user list status (no job_id available)",
    "\n=== 10. Get User List Status ===",
    async () => {
      const status = await client.promotionsSuite.getUserListStatus({
        fiId: FI_ID,
        jobId: firstJobId!,
      });
      pretty("User List Status", status);
    },
  );
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`  FI_ID: ${FI_ID}`);
  console.log();

  const client = CandescentClient.fromEnv();
  console.log("Client initialised");

  await runExampleStep("\n=== 1. List Experience Groups ===", async () => {
    const groups = await client.experienceGroups.listExperienceGroups({});
    pretty("Experience Groups", groups);
  });

  const createdGroupId = await createExperienceGroup(client);
  await runExperienceGroupLifecycle(client, createdGroupId);
  const firstJobId = await listJobsAndDiscoverId(client);
  await runJobSteps(client, firstJobId);

  await runExampleStep("\n=== 8. Create User List Metadata ===", async () => {
    await client.audience.createUserListMetadata({ userListsDTO: buildUserListMetadata() });
    console.log("  User list metadata created successfully");
  });

  await runExampleStep("\n=== 9. Get User List Details ===", async () => {
    const details = await client.audience.getUserListDetails({
      userlistFileName: "SDK_TEST_LIST",
      viewName: "default",
    });
    pretty("User List Details", details);
  });

  await runExampleStep("\n=== 11. Create User List ===", async () => {
    const userList: UserList = { name: "sdk_test_userlist", users: ["member001", "member002"] };
    const result = await client.promotionsSuite.createUserList({ fiId: FI_ID, body: userList });
    pretty("Created User List", result);
  });

  await runExampleStep("\n=== 12. Upload User List File ===", async () => {
    const groupId = createdGroupId ?? "SDK_TEST_GROUP";
    const uploadResult = await client.experienceGroups.uploadUserListFile({
      groupId,
      type: "ADD",
      fileName: new Blob(["user1@example.com\nuser2@example.com"]),
    });
    pretty("Uploaded User List File", uploadResult);
  });

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
