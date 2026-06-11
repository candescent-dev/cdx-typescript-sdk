/**
 * Shared utilities for Candescent DI TypeScript examples.
 */

/** HTTP method + path for APIs invoked by examples (from OpenAPI registry). */
export const ENDPOINTS = {
  // Authentication
  oauthV2AuthorizeClient: "POST /auth-code/v1/client-authorization",
  oauthV1CreateLegacyToken: "POST /v1/oauth/token",
  oauthV2GetAuthorizationCode: "POST /auth-code/v1/auth-code",
  oauthV2CreateToken: "POST /oauth2/v1/token",
  oauthV2RevokeToken: "DELETE /oauth2/v1/revoke",
} as const;

const KNOWN_ENDPOINTS = new Set<string>(Object.values(ENDPOINTS));

/** Log a known API endpoint path (public registry strings only). */
export function logEndpoint(endpoint: string): void {
  if (KNOWN_ENDPOINTS.has(endpoint)) {
    console.log(`  Endpoint: ${endpoint}`);
  } else {
    console.log("  Endpoint: [redacted]");
  }
}

/** Whether an env var is set, without printing its value. */
export function envSetStatus(value: string | undefined): string {
  return value ? "(set)" : "(not set)";
}

/** Redact a secret or identifier for console output. */
export function redact(value: string | undefined): string {
  if (!value) return "(not set)";
  return "***redacted***";
}

/** Mask a value, keeping only the last four characters visible. */
export function maskSensitive(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "*".repeat(value.length);
  return "*".repeat(value.length - 4) + value.slice(-4);
}

function secureRandomUnit(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x1_0000_0000;
}

/** Uniform integer in [min, max) using crypto.getRandomValues (not for secrets). */
export function secureRandomInt(min: number, max: number): number {
  return Math.floor(secureRandomUnit() * (max - min)) + min;
}

/** Pick a random item from a non-empty array. */
export function secureRandomChoice<T>(items: readonly T[]): T {
  return items[secureRandomInt(0, items.length)];
}

/** Restrict OAuth / API base URLs to Candescent HTTPS hosts (SSRF guard). */
export function assertCandescentHttpsBase(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Invalid API base URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("API base URL must use HTTPS");
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "api.candescent.com" && !host.endsWith(".candescent.com")) {
    throw new Error(`Disallowed API base URL host: ${parsed.hostname}`);
  }
  return normalized;
}

export function pretty(label: string, obj: unknown): void {
  console.log("\n" + "-".repeat(72));
  console.log("  " + label);
  console.log("-".repeat(72));
  console.log(JSON.stringify(obj, null, 2));
}

/** Run an example step; log failures without throwing. */
export async function runExampleStep(
  heading: string,
  fn: () => Promise<void>,
  failureLabel = "Failed",
): Promise<void> {
  console.log(heading);
  try {
    await fn();
  } catch (e: unknown) {
    console.log(`  ${failureLabel}: ${e}`);
  }
}

/** Run a step only when condition is true; otherwise log skip message. */
export async function runExampleStepWhen(
  condition: boolean,
  skipMessage: string,
  heading: string,
  fn: () => Promise<void>,
  failureLabel = "Failed",
): Promise<void> {
  if (!condition) {
    console.log(skipMessage);
    return;
  }
  await runExampleStep(heading, fn, failureLabel);
}

/** Run a step that is expected to fail with an error. */
export async function runExpectedErrorStep(
  heading: string,
  fn: () => Promise<void>,
): Promise<void> {
  console.log(heading);
  try {
    await fn();
    console.log("  UNEXPECTED SUCCESS — should have returned an error");
  } catch (e: unknown) {
    console.log(`  Expected error: ${e}`);
  }
}

/** Exit the process when required env vars are missing. */
export function requireEnvVars(
  checks: { value: string | undefined; message: string }[],
): void {
  for (const { value, message } of checks) {
    if (!value) {
      console.error(message);
      process.exit(1);
    }
  }
}
