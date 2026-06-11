/**
 * Parameter validation utilities powered by the operation registry.
 *
 * Checks mutual-exclusivity constraints (e.g. hostUserId vs loginId)
 * before the request is sent, producing a clear client-side error
 * instead of a cryptic 400 from the server.
 */

import { OPERATION_REGISTRY } from "./registry.js";
import { CandescentError } from "./errors.js";

export interface MutexPair {
  a: string;
  b: string;
}

let _mutexPairs: MutexPair[] | null = null;

function sortedPairNames(a: string, b: string): [string, string] {
  return a.localeCompare(b) <= 0 ? [a, b] : [b, a];
}

function addMutexPair(seen: Set<string>, pairs: MutexPair[], a: string, b: string): void {
  const [first, second] = sortedPairNames(a, b);
  const key = `${first}+${second}`;
  if (seen.has(key)) return;
  seen.add(key);
  pairs.push({ a: first, b: second });
}

function collectMutexPairsFromRegistry(): MutexPair[] {
  const seen = new Set<string>();
  const pairs: MutexPair[] = [];

  for (const op of Object.values(OPERATION_REGISTRY)) {
    for (const p of op.params) {
      if (!p.mutuallyExclusiveWith?.length) continue;
      for (const other of p.mutuallyExclusiveWith) {
        addMutexPair(seen, pairs, p.name, other);
      }
    }
  }

  return pairs;
}

/**
 * Extracts all unique mutual-exclusivity pairs from the registry.
 * Result is cached after first call.
 */
export function getMutuallyExclusivePairs(): MutexPair[] {
  if (_mutexPairs) return _mutexPairs;
  _mutexPairs = collectMutexPairsFromRegistry();
  return _mutexPairs;
}

/**
 * Validate that no mutually exclusive parameters are both present.
 * Throws CandescentError if a violation is found.
 *
 * @param params - key/value pairs being sent as query/path parameters
 */
export function validateParams(params: Record<string, unknown>): void {
  for (const { a, b } of getMutuallyExclusivePairs()) {
    if (params[a] != null && params[b] != null) {
      throw new CandescentError(
        `Parameters "${a}" and "${b}" are mutually exclusive — pass one, not both`,
      );
    }
  }
}

/**
 * Validate query parameters extracted from a URL against mutual-exclusivity rules.
 */
export function validateUrlParams(url: string): void {
  try {
    const parsed = new URL(url);
    const pairs = getMutuallyExclusivePairs();
    for (const { a, b } of pairs) {
      if (parsed.searchParams.has(a) && parsed.searchParams.has(b)) {
        throw new CandescentError(
          `Parameters "${a}" and "${b}" are mutually exclusive — pass one, not both`,
        );
      }
    }
  } catch (e) {
    if (e instanceof CandescentError) throw e;
    // URL parsing failure — skip validation rather than blocking the request
  }
}
