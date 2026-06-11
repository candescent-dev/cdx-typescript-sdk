/**
 * Pagination patterns: demonstrates the four pagination styles used by the
 * Candescent DI API, plus the SDK's PageIterator abstraction that unifies them.
 *
 * Pagination patterns in the API:
 *   1. pageNo / pageSize                       — Alert Preferences
 *   2. Spring HATEOAS (page/size/sort + links) — Experience Groups, Jobs
 *   3. Cursor (nextPageToken)                  — Banking Activities
 *   4. Keyset (limit + userToken)              — Subscriptions (legacy V1)
 *
 * The SDK provides a PageIterator class that implements AsyncIterable,
 * letting you use `for await...of` to seamlessly iterate across all pages.
 *
 * Prerequisites:
 *   - Set environment variables: CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
 *     CANDESCENT_INSTITUTION_ID (and optionally CANDESCENT_ENVIRONMENT).
 * Additional env vars:
 *   CANDESCENT_HOST_USER_ID  — retail user identifier (alert preferences / transactions)
 *   CANDESCENT_LOGIN_ID      — login identifier (fallback when hostUserId is not in alert prefs)
 *   CANDESCENT_ACCOUNT_ID    — optional; auto-discovered from list accounts when omitted
 *
 * Run: npx tsx examples/typescript/pagination.ts
 */

import {
  CandescentClient,
  NotFoundError,
  PageIterator,
  type Page,
  type PageRequest,
  type PageFetcher,
} from "@cdx-forge/di-typescript-sdk";
import { envSetStatus, runExampleStep } from "./_helpers.ts";

// Demo fallbacks only when no credentials are configured (e.g. offline dry-run).
if (!process.env.CANDESCENT_CLIENT_ID && !process.env.CANDESCENT_CLIENT_SECRET) {
  process.env.CANDESCENT_INSTITUTION_ID ??= "05523";
  process.env.CANDESCENT_BEARER_TOKEN ??= "demo-bearer-token";
}

const FI_ID = process.env.CANDESCENT_FI_ID ?? process.env.CANDESCENT_INSTITUTION_ID ?? "05523";
const HOST_USER_ID = process.env.CANDESCENT_HOST_USER_ID ?? "demo-host-user";
const LOGIN_ID = process.env.CANDESCENT_LOGIN_ID;

type UserIdParam = { hostUserId: string } | { loginId: string };

function resolveUserIdParams(): UserIdParam[] {
  const params: UserIdParam[] = [];
  if (process.env.CANDESCENT_HOST_USER_ID) {
    params.push({ hostUserId: process.env.CANDESCENT_HOST_USER_ID });
  }
  if (LOGIN_ID) {
    const loginParam = { loginId: LOGIN_ID };
    if (!params.some((p) => "loginId" in p && p.loginId === loginParam.loginId)) {
      params.push(loginParam);
    }
  }
  if (params.length === 0) {
    params.push({ hostUserId: HOST_USER_ID });
  }
  return params;
}

function isNotFound(err: unknown): boolean {
  return err instanceof NotFoundError;
}

async function resolveAccountId(client: CandescentClient): Promise<string | undefined> {
  if (process.env.CANDESCENT_ACCOUNT_ID) {
    return process.env.CANDESCENT_ACCOUNT_ID;
  }
  for (const userIdParam of resolveUserIdParams()) {
    try {
      const accounts = await client.accounts.list(userIdParam);
      const id = accounts.accounts?.[0]?.id;
      if (id) return id;
    } catch {
      // try next identifier
    }
  }
  return undefined;
}

/** Try alert preferences (pageNo/pageSize); fall back to transactions ($skip/$top) on 404. */
async function createOffsetPageFetcher(
  client: CandescentClient,
  accountId: string | undefined,
): Promise<{ fetch: PageFetcher<unknown>; label: string }> {
  const userIdCandidates = resolveUserIdParams();
  let alertPrefsUnavailable = false;

  const tryAlertPrefs = async (req: PageRequest): Promise<Page<unknown> | null> => {
    if (alertPrefsUnavailable) return null;
    for (const userIdParam of userIdCandidates) {
      try {
        const response = await client.userPreferences.list({
          ...userIdParam,
          pageNo: req.page ?? 0,
          pageSize: req.size ?? 10,
        });
        const prefs = response.alertPreferences ?? [];
        return {
          items: prefs,
          hasMore: prefs.length >= (req.size ?? 10),
        };
      } catch (err) {
        if (isNotFound(err)) continue;
        throw err;
      }
    }
    alertPrefsUnavailable = true;
    return null;
  };

  const fetchTransactions = async (req: PageRequest): Promise<Page<unknown>> => {
    if (!accountId) {
      return { items: [], hasMore: false };
    }
    const pageSize = req.size ?? 10;
    const page = req.page ?? 0;
    const endDate = new Date();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const userIdParam = userIdCandidates[0] ?? { hostUserId: HOST_USER_ID };
    const response = await client.transactions.listAccountTransactions({
      accountId,
      ...userIdParam,
      startDate,
      endDate,
      $skip: page * pageSize,
      $top: pageSize,
    });
    const txns = response.transactions ?? [];
    return {
      items: txns,
      hasMore: txns.length >= pageSize,
    };
  };

  const fetch: PageFetcher<unknown> = async (req) => {
    const prefsPage = await tryAlertPrefs(req);
    if (prefsPage) {
      return prefsPage;
    }
    return fetchTransactions(req);
  };

  // Probe once to choose a label for logging.
  const probe = await tryAlertPrefs({ page: 0, size: 1 });
  const label =
    probe != null
      ? "Alert Preferences (pageNo / pageSize)"
      : accountId
        ? "Transactions ($skip / $top fallback — alert preferences unavailable)"
        : "Transactions fallback unavailable (no account_id)";

  if (probe == null && !accountId) {
    console.log(
      "  Note: alert preferences returned 404 and no account_id is available for transaction pagination.",
    );
  } else if (probe == null) {
    console.log(
      "  Note: alert preferences unavailable for this user/FI — using transaction $skip/$top pagination.",
    );
  }

  return { fetch, label };
}

async function runOffsetPatternManual(fetchOffsetPage: PageFetcher<unknown>): Promise<void> {
  await runExampleStep("\n--- 1a. Manual pagination loop ---", async () => {
    let pageNo = 0;
    const pageSize = 10;
    const allItems: unknown[] = [];
    while (true) {
      const page = await fetchOffsetPage({ page: pageNo, size: pageSize });
      const batch = page.items ?? [];
      if (batch.length === 0) break;
      console.log(`  Page ${pageNo}: ${batch.length} item(s)`);
      allItems.push(...batch);
      if (!page.hasMore) break;
      pageNo++;
    }
    console.log(`  Total items: ${allItems.length}`);
  });
}

async function runOffsetPatternIterator(fetchOffsetPage: PageFetcher<unknown>): Promise<void> {
  await runExampleStep("\n--- 1b. Using PageIterator ---", async () => {
    const iterator = new PageIterator(fetchOffsetPage, { page: 0, size: 10 });
    let count = 0;
    for await (const _item of iterator) count++;
    console.log(`  Iterated ${count} item(s) via for-await-of`);
    const allItems = await new PageIterator(fetchOffsetPage, { page: 0, size: 10 }).toArray();
    console.log(`  Total via .toArray(): ${allItems.length}`);
    const firstFive = await new PageIterator(fetchOffsetPage, { page: 0, size: 10 }).take(5);
    console.log(`  First 5 via .take(5): ${firstFive.length} item(s)`);
  });
}

async function runHateoasPatternManual(client: CandescentClient): Promise<void> {
  await runExampleStep("\n--- 2a. Manual pagination loop ---", async () => {
    let pageNum = 0;
    const pageSize = 10;
    const allGroups: unknown[] = [];
    while (true) {
      const response = await client.experienceGroups.listExperienceGroups({
        pageable: { page: pageNum, size: pageSize },
      });
      const content = response.content ?? [];
      const pageMeta = response.page;
      if (content.length === 0 && (pageMeta?.totalElements ?? 0) === 0) break;
      const totalPages = pageMeta?.totalPages;
      const totalElements = pageMeta?.totalElements;
      console.log(
        `  Page ${pageNum}/${totalPages ?? "?"}: ${content.length} groups (total: ${totalElements ?? "?"})`,
      );
      allGroups.push(...content);
      if (totalPages !== undefined && pageNum + 1 >= totalPages) break;
      if (content.length < pageSize) break;
      pageNum++;
    }
    console.log(`  Total experience groups: ${allGroups.length}`);
  });
}

async function runHateoasPatternIterator(client: CandescentClient): Promise<void> {
  await runExampleStep("\n--- 2b. Using PageIterator ---", async () => {
    const fetchGroups: PageFetcher<unknown> = async (req: PageRequest): Promise<Page<unknown>> => {
      const response = await client.experienceGroups.listExperienceGroups({
        pageable: { page: req.page ?? 0, size: req.size ?? 10 },
      });
      const content = response.content ?? [];
      const pageMeta = response.page;
      const totalPages = pageMeta?.totalPages ?? 0;
      const currentPage = req.page ?? 0;
      return {
        items: content,
        hasMore: currentPage + 1 < totalPages,
        totalElements: pageMeta?.totalElements,
      };
    };
    const iterator = new PageIterator(fetchGroups, { page: 0, size: 10 });
    let printed = 0;
    for await (const group of iterator) {
      const g = group as { groupName?: string; groupId?: string };
      console.log(`  Group: ${g.groupName ?? "(unnamed)"} (ID: ${g.groupId ?? "?"})`);
      printed++;
      if (printed >= 5) {
        console.log("  … (truncated after 5 groups)");
        break;
      }
    }
    console.log("  Iteration complete");
  });
}

function createBankingActivitySearch(client: CandescentClient) {
  const bankingEnd = new Date();
  const bankingStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return async (pageToken?: string, pageSize = 25) =>
    client.bankingActivities.searchBankingActivities({
      searchCriteria: {
        startTime: bankingStart,
        endTime: bankingEnd,
        pageSize,
        nextPageToken: pageToken,
      },
    });
}

async function runCursorPatternManual(
  searchActivities: ReturnType<typeof createBankingActivitySearch>,
): Promise<void> {
  await runExampleStep("\n--- 3a. Manual pagination loop ---", async () => {
    let nextPageToken: string | undefined;
    const allActivities: unknown[] = [];
    let pageIndex = 0;
    while (true) {
      const response = await searchActivities(nextPageToken, 25);
      if (!response) {
        console.log(`  Page ${pageIndex}: no records (HTTP 204)`);
        break;
      }
      const batch = response.bankingActivities ?? [];
      console.log(`  Page ${pageIndex}: ${batch.length} activities (count: ${response.count})`);
      allActivities.push(...batch);
      nextPageToken = response.nextPageToken;
      if (!nextPageToken || batch.length === 0) break;
      pageIndex++;
    }
    console.log(`  Total banking activities: ${allActivities.length}`);
  });
}

async function runCursorPatternIterator(
  searchActivities: ReturnType<typeof createBankingActivitySearch>,
): Promise<void> {
  await runExampleStep("\n--- 3b. Using PageIterator ---", async () => {
    const fetchActivities: PageFetcher<unknown> = async (req: PageRequest): Promise<Page<unknown>> => {
      const response = await searchActivities(req.pageToken, req.size ?? 25);
      if (!response) return { items: [], hasMore: false };
      const batch = response.bankingActivities ?? [];
      return {
        items: batch,
        hasMore: !!response.nextPageToken,
        nextPageToken: response.nextPageToken,
      };
    };
    const allActivities = await new PageIterator(fetchActivities, { page: 0, size: 25 }).toArray();
    console.log(`  Total via PageIterator: ${allActivities.length}`);
  });
}

async function runPattern1(fetchOffsetPage: PageFetcher<unknown>, offsetLabel: string): Promise<void> {
  console.log("=".repeat(72));
  console.log(`  PATTERN 1: ${offsetLabel}`);
  console.log("=".repeat(72));
  await runOffsetPatternManual(fetchOffsetPage);
  await runOffsetPatternIterator(fetchOffsetPage);
}

async function runPattern2(client: CandescentClient): Promise<void> {
  console.log("\n" + "=".repeat(72));
  console.log("  PATTERN 2: Spring HATEOAS  (Experience Groups)");
  console.log("=".repeat(72));
  await runHateoasPatternManual(client);
  await runHateoasPatternIterator(client);
}

async function runPattern3(client: CandescentClient): Promise<void> {
  console.log("\n" + "=".repeat(72));
  console.log("  PATTERN 3: Cursor (nextPageToken)  (Banking Activities)");
  console.log("=".repeat(72));
  const searchActivities = createBankingActivitySearch(client);
  try {
    await runCursorPatternManual(searchActivities);
    await runCursorPatternIterator(searchActivities);
  } catch (e) {
    if (isNotFound(e)) {
      console.log("  Skipped: banking activities search returned 404 for this institution.");
    } else {
      console.log(`  Failed: ${e}`);
    }
  }
}

async function main(): Promise<void> {
  console.log(`  FI_ID:          ${FI_ID}`);
  console.log(`  HOST_USER_ID:   ${envSetStatus(HOST_USER_ID)}`);
  console.log(`  LOGIN_ID:       ${envSetStatus(LOGIN_ID)}`);
  console.log(`  ENVIRONMENT:    ${envSetStatus(process.env.CANDESCENT_ENVIRONMENT)}`);
  console.log();

  const client = CandescentClient.fromEnv();
  console.log("Client initialised\n");

  const accountId = await resolveAccountId(client);
  if (accountId) console.log(`  ACCOUNT_ID:     ${envSetStatus(accountId)}`);

  const { fetch: fetchOffsetPage, label: offsetLabel } =
    await createOffsetPageFetcher(client, accountId);

  await runPattern1(fetchOffsetPage, offsetLabel);
  await runPattern2(client);
  await runPattern3(client);

  console.log(`
========================================================================
  PAGINATION PATTERNS SUMMARY
========================================================================

+---------------------------+------------------------------+---------------------------+
| Pattern                   | API Example                  | PageIterator Behavior     |
+---------------------------+------------------------------+---------------------------+
| pageNo / pageSize         | Alert Preferences            | Increments page number    |
| Spring HATEOAS            | Experience Groups, Jobs      | Uses page metadata for    |
|   (page/size + links)     |                              | total pages; increments   |
| Cursor (nextPageToken)    | Banking Activities           | Follows nextPageToken     |
| Keyset (limit+userToken)  | Subscriptions (legacy V1)    | Uses last ID as cursor    |
+---------------------------+------------------------------+---------------------------+

The TypeScript PageIterator implements AsyncIterable, so you can use:
  - for await (const item of iterator)  — lazy, streaming iteration
  - await iterator.toArray()            — collect all items eagerly
  - await iterator.take(n)              — collect first N items
  - await iterator.map(fn)             — async transform over all items
`);

  await client.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0);
});
