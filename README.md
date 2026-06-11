# TypeScript SDK — Examples & Consumption Guide

[![npm version](https://img.shields.io/npm/v/@cdx-forge/di-typescript-sdk.svg)](https://www.npmjs.com/package/@cdx-forge/di-typescript-sdk)
[![OpenAPI spec](https://img.shields.io/badge/OpenAPI-1.6.0-6BA539?logo=openapiinitiative&logoColor=white)](https://github.com/candescent-dev/openapi/tree/v1.6.0)
[![downloads](https://img.shields.io/npm/dm/@cdx-forge/di-typescript-sdk.svg?label=downloads)](https://www.npmjs.com/package/@cdx-forge/di-typescript-sdk)
[![node](https://img.shields.io/node/v/@cdx-forge/di-typescript-sdk.svg)](https://www.npmjs.com/package/@cdx-forge/di-typescript-sdk)

Runnable TypeScript examples for the [Candescent Digital Insight API](https://docs.candescent.com). Scripts in `examples/typescript/` cover **all API operations**, plus error-handling and pagination patterns.

| Package | Version |
|---------|---------|
| `@cdx-forge/di-typescript-sdk` | **1.0.0** |
| OpenAPI spec ([`candescent-dev/openapi`](https://github.com/candescent-dev/openapi/tree/v1.6.0)) | **1.6.0** |

For full SDK reference (installation, authentication, error types, pagination, framework integration), see [@cdx-forge/di-typescript-sdk on npm](https://www.npmjs.com/package/@cdx-forge/di-typescript-sdk).

## Requirements

| Requirement | Details |
|-------------|---------|
| Node.js | **20+** |
| Module system | **ESM only** — use `import` syntax. `require()` will throw `ERR_REQUIRE_ESM` (see [Troubleshooting](#troubleshooting)) |



## Install dependencies

If you haven't cloned the repo yet:

```bash
git clone https://github.com/candescent-dev/cdx-typescript-sdk.git
cd cdx-typescript-sdk
```

Then install dependencies from the repo root:

```bash
pnpm install
```

This installs `@cdx-forge/di-typescript-sdk` (declared in `package.json`) and any other dependencies required to run the example scripts. Install once before running anything under `examples/typescript/`.

---

## Environment setup

Copy the template and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `CANDESCENT_INSTITUTION_ID` | Yes | Institution identifier |
| `CANDESCENT_CLIENT_ID` | Yes\* | OAuth 2.0 client ID |
| `CANDESCENT_CLIENT_SECRET` | Yes\* | OAuth 2.0 client secret |
| `CANDESCENT_BEARER_TOKEN` | Yes\* | Pre-obtained JWT (skips OAuth) |
| `CANDESCENT_ENVIRONMENT` | No | `stage` (default) or `production` |

\*Provide either `CANDESCENT_BEARER_TOKEN` or both `CANDESCENT_CLIENT_ID` and `CANDESCENT_CLIENT_SECRET`.

Scripts do not automatically load `.env` files. Either `source .env` before running, or rely on the batch runner which loads the repo-root `.env` automatically.

See [`.env.example`](https://github.com/candescent-dev/cdx-typescript-sdk/blob/main/.env.example) for example-specific variables (account IDs, business banking, MX, alerts, etc.).

**Repeating credentials in `.env`**

`.env.example` declares OAuth client credentials in three places. If a single client ID, secret, and institution ID work for all example flows, set the **same values three times**:

| Group | Variables |
|-------|-----------|
| Retail / default | `CANDESCENT_CLIENT_ID`, `CANDESCENT_CLIENT_SECRET`, `CANDESCENT_INSTITUTION_ID` |
| Business banking | `CANDESCENT_BB_CLIENT_ID`, `CANDESCENT_BB_CLIENT_SECRET`, `CANDESCENT_BB_INSTITUTION_ID` |
| MX integration | `CANDESCENT_MX_CLIENT_ID` (MX also requires a separate `CANDESCENT_MX_API_KEY`) |

User identifiers are also listed in three places. If the same user works across retail and business-banking examples, repeat that identifier **three times**:

| Variable | Used for |
|----------|----------|
| `CANDESCENT_HOST_USER_ID` | Retail examples (`hostUserId`) |
| `CANDESCENT_LOGIN_ID` | Retail examples (`loginId` — use instead of or alongside host user ID per example) |
| `CANDESCENT_BB_LOGIN_ID` | Business banking examples |

Set `FALLBACK_CUSTOMER_ID` to skip registration and test lookups against an existing customer.

---

## Running examples

### Single example

```bash
node --experimental-strip-types examples/typescript/register-and-lookup.ts
```

### All examples

From the repo root:

```bash
node scripts/run-all-typescript-examples.mjs
```

Full output is appended to `developerscript/typescript/logs/all-examples.log`. The process exits non-zero if any example fails.

| Detail | Value |
|--------|-------|
| Default log | `developerscript/typescript/logs/all-examples.log` |
| Custom log | Pass `--log=<path>` to write output to a different file (e.g. `node scripts/run-all-typescript-examples.mjs --log=/tmp/ts-examples.log`), or set the `LOG_FILE` env var before running. Useful for CI pipelines or when you want to keep a clean run separate from the default log. |
| Credentials | Environment variables or repo-root `.env` (loaded automatically) |

When `CANDESCENT_CLIENT_ID` and `CANDESCENT_CLIENT_SECRET` are set, a static `CANDESCENT_BEARER_TOKEN` is stripped so examples use live OAuth.

Run `error-handling.ts` individually — it is excluded from the batch runner because it exercises intentional failures:

```bash
node --experimental-strip-types examples/typescript/error-handling.ts
```

---

## SDK Usage

> **Package:** [`@cdx-forge/di-typescript-sdk`](https://www.npmjs.com/package/@cdx-forge/di-typescript-sdk?activeTab=readme)

A full accounts walkthrough using `CandescentClient`. The SDK handles OAuth token routing, auth/tracing header injection, and V1/V2 token selection transparently.

```typescript
import { CandescentClient, type AccountsResponse } from "@cdx-forge/di-typescript-sdk";

// Reads CANDESCENT_CLIENT_ID, CANDESCENT_CLIENT_SECRET,
// CANDESCENT_INSTITUTION_ID, CANDESCENT_ENVIRONMENT from the environment.
const client = CandescentClient.fromEnv();

// 1. List accounts by host user ID
const hostUserId = process.env.CANDESCENT_HOST_USER_ID!;
const accounts: AccountsResponse = await client.accounts.list({ hostUserId });
console.log(`Found ${accounts.accounts?.length ?? 0} account(s)`);

// 2. Auto-discover the first account ID
const accountId = accounts.accounts?.[0]?.id;

// 3. Get a specific account by ID
if (accountId) {
  const account = await client.accounts.getAccountById({ accountId, hostUserId });
  console.log("Account details:", account.id, account.accountType);
}

// 4. List transactions for the account
if (accountId) {
  const txns = await client.accounts.listTransactions({ accountId, hostUserId });
  console.log(`Transactions: ${txns.transactions?.length ?? 0}`);
}

// 5. Shutdown — revokes cached tokens
await client.close();
```

**Using `loginId` instead of `hostUserId`** (`hostUserId` and `loginId` are mutually exclusive — pass only one):

```typescript
const loginId = process.env.CANDESCENT_LOGIN_ID!;
const accountsByLogin: AccountsResponse = await client.accounts.list({ loginId });
```

See [`examples/typescript/accounts.ts`](https://github.com/candescent-dev/cdx-typescript-sdk/blob/main/examples/typescript/accounts.ts) for the full runnable script.

---

## Example scripts

| Example File | What It Covers |
|--------------|----------------|
| `accounts.ts` | List accounts, retrieve account details, banking images |
| `transactions.ts` | Transaction history, filtering |
| `authentication.ts` | OAuth token lifecycle |
| `authentication-lifecycle.ts` | Full token create / revoke flow |
| `customer-management.ts` | Contact methods, password reset, unlock |
| `register-and-lookup.ts` | Customer registration + 3-way lookup |
| `disclosures.ts` | Institution and user disclosures |
| `estatements.ts` | E-statement delivery preferences |
| `alert-configuration.ts` | Alert templates and types |
| `alert-preferences.ts` | User and institution alert preferences |
| `alert-delivery.ts` | Alert history and content |
| `notification-channels.ts` | Subscription management |
| `business-registration.ts` | Business banking registration |
| `business-entitlements.ts` | Business and user entitlements |
| `business-payments.ts` | ACH and wire payments |
| `customer-campaigns.ts` | Experience groups and campaigns |
| `money-movement.ts` | Recipients and transfers |
| `mx-service.ts` | MX integration — widget, users, logs |
| `pagination.ts` | PageIterator across all pagination patterns |
| `error-handling.ts` | Full error hierarchy showcase |
| `user-status.ts` | User authentication status |

### Example → Operation Coverage

| API Tag | Example File | Operations Covered |
|---------|--------------|-------------------|
| **Accounts** | `accounts` | `list`, `get`, `listBankingImages`, `getBankingImage`, `searchActivities`, `getAccounts`, `listCustomerAccounts` |
| **Transactions** | `transactions` | `listTransactions` |
| **Alert Configuration** | `alert-configuration` | Templates, types, institution types CRUD |
| **Alert Delivery** | `alert-delivery` | `listHistory`, `getHistoryContent`, `publishEvents` |
| **Alert Preferences** | `alert-preferences` | User + institution preference CRUD |
| **Authentication** | `authentication`, `authentication-lifecycle` | Authorize, legacy token, auth code, create/revoke token |
| **Business Banking** | `business-registration`, `business-entitlements`, `business-payments` | Registration lifecycle, entitlements, ACH/Wire |
| **Customer Campaigns** | `customer-campaigns` | Experience groups, jobs, user lists |
| **Customer Management** | `register-and-lookup`, `user-status`, `customer-management` | Register, lookups, contact, password, unlock |
| **Documents & Preferences** | `disclosures`, `estatements` | Disclosure CRUD, e-statement prefs/report |
| **MX** | `mx-service` | Users, widget URL, transaction logs |
| **Money Movement** | `money-movement` | Recipients + transfers |
| **Notification Channels** | `notification-channels` | Subscriptions CRUD + send event |
| **Cross-cutting** | `error-handling`, `pagination` | Error hierarchy, PageIterator patterns |

All API operations are covered across all API tags.

---

## Troubleshooting

**CommonJS `require()` not working**

This package is ESM-only. Your project must use `"type": "module"` in `package.json` or use `.mjs` file extensions. `require('@cdx-forge/di-typescript-sdk')` will throw `ERR_REQUIRE_ESM`.

**`Cannot find module '@cdx-forge/di-typescript-sdk'`**

Run `npm install @cdx-forge/di-typescript-sdk` and confirm the package is listed in your `package.json` dependencies.

**Authentication errors (401)**

- Verify `CANDESCENT_CLIENT_ID` and `CANDESCENT_CLIENT_SECRET` are correct
- Confirm `CANDESCENT_INSTITUTION_ID` matches the credentials issued to you
- For staging environments, set `CANDESCENT_ENVIRONMENT=stage`

**`"Parameters hostUserId and loginId are mutually exclusive"`**

Pass only one user identifier per request — either `hostUserId` or `loginId`, not both.

**`"Module not found"` when running examples**

Run `npm install` in the repo root or `examples/` directory to install dependencies.

---

## Versioning

This SDK follows [semantic versioning](https://semver.org/) independently from the Candescent DI OpenAPI specification. The SDK version and spec version are tracked separately.

| Package | Version |
|---------|---------|
| SDK (`@cdx-forge/di-typescript-sdk`) | **1.0.0** |
| OpenAPI spec ([`candescent-dev/openapi`](https://github.com/candescent-dev/openapi/tree/v1.6.0)) | **1.6.0** |

Each SDK release is pinned to a specific spec version. See [CHANGELOG.md](https://github.com/candescent-dev/cdx-typescript-sdk/blob/main/CHANGELOG.md) for the spec version used in each release.

## Support

- **API Reference:** [docs.candescent.com](https://docs.candescent.com)
- **SDK README:** [@cdx-forge/di-typescript-sdk on npm](https://www.npmjs.com/package/@cdx-forge/di-typescript-sdk)
- **Issues:** [GitHub Issues](https://github.com/candescent-dev/cdx-typescript-sdk/issues)
