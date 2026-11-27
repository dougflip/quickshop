/**
 * Marks a branch that the type checker has proven unreachable.
 * Use it in the default of a switch over a union so a new variant becomes a compile error.
 */
export function assertNever(value: never, message = "Unexpected value"): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}
