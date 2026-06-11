/**
 * Result<T, E> monad for non-throwing error handling.
 *
 * Inspired by Speakeasy's pattern — callers can choose between
 * try/catch and explicit result checking:
 *
 *   // Approach 1: traditional
 *   const accounts = await client.accounts.list();
 *
 *   // Approach 2: result monad (never throws)
 *   const result = await safe(() => client.accounts.list({hostUserId: "user-12345"}));
 *   if (result.ok) console.log(result.value);
 *   else console.error(result.error);
 */

export type Result<T, E = Error> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Wraps an async function so it returns Result<T, E> instead of throwing.
 */
export function safe<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  return fn().then(
    (value) => ok(value),
    (error) => err(error instanceof Error ? error : new Error(String(error))),
  );
}
