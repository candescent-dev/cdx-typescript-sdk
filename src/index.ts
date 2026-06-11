/**
 * @cdx-forge/di-typescript-sdk — TypeScript Server SDK for Candescent Digital Insight
 *
 * @example
 * ```ts
 * import { CandescentClient, Environment } from "@cdx-forge/di-typescript-sdk";
 *
 * const client = new CandescentClient({
 *   clientId: "my-client-id",
 *   clientSecret: "my-secret",
 *   institutionId: "12345",
 *   environment: Environment.Stage,
 * });
 *
 * const accounts = await client.accounts.list({ hostUserId: "user-12345" });
 * console.log(accounts);
 * ```
 */

export { CandescentClient, Environment, type ClientConfig } from "./client.js";
export {
  ClientCredentialsProvider,
  PasswordGrantProvider,
  StaticTokenProvider,
  TokenEndpoint,
  type TokenProvider,
  type AccessToken,
} from "./auth.js";
export { PageIterator, type Page, type PageRequest, type PageFetcher } from "./pagination.js";
export { type Result, type Ok, type Err, ok, err, safe } from "./result.js";
export {
  CandescentError,
  ApiError,
  BadRequestError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  RateLimitError,
  InternalServerError,
  ConnectionError,
  RequestTimeoutError,
} from "./errors.js";

// Operation registry — structured metadata for every DI API operation
export {
  OPERATION_REGISTRY,
  getAllCategories,
  getCategory,
  findOperation,
  searchOperations,
  getTotalOperationCount,
  type ParamInfo,
  type OperationInfo,
  type CategoryInfo,
} from "./registry.js";

// Parameter validation utilities
export { validateParams, validateUrlParams, getMutuallyExclusivePairs } from "./validate.js";

// Re-export all generated models for convenient typed usage
export * from "@cdx-forge/di-typescript-sdk/dist/generated/src/models/index.js";
