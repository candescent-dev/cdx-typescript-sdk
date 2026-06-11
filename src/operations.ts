/**
 * Standalone functions — importable individually for tree-shaking.
 *
 * Each function creates a short-lived client from env vars and calls a
 * single operation. Ideal for serverless or lightweight scripts.
 *
 * @example
 * ```ts
 * import { listAccounts } from "@cdx-forge/di-typescript-sdk/operations";
 * const accounts = await listAccounts();
 * ```
 */

import { CandescentClient } from "./client.js";
import { validateParams } from "./validate.js";
import type {
  AccountsResponse,
  Account,
  TransactionsResponse,
} from "@cdx-forge/di-typescript-sdk/dist/generated/src/models/index.js";

export async function listAccounts(
  params?: { hostUserId?: string; loginId?: string },
): Promise<AccountsResponse> {
  if (params) validateParams(params);
  const client = CandescentClient.fromEnv();
  try {
    return await client.accounts.list(params ?? {});
  } finally {
    await client.close();
  }
}

export async function getAccount(
  params: { accountId: string; hostUserId?: string; loginId?: string },
): Promise<Account> {
  validateParams(params);
  const client = CandescentClient.fromEnv();
  try {
    return await client.accounts.getAccountById(params);
  } finally {
    await client.close();
  }
}

export async function listTransactions(
  params: {
    accountId: string;
    hostUserId?: string;
    loginId?: string;
    institutionCustomerId?: string;
    startDate?: Date;
    endDate?: Date;
    retrieveFutureTransactions?: boolean;
  },
): Promise<TransactionsResponse> {
  validateParams(params);
  const client = CandescentClient.fromEnv();
  try {
    return await client.transactions.listAccountTransactions(params);
  } finally {
    await client.close();
  }
}
