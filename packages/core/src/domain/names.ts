/** Trims and collapses inner whitespace: "  Greek   yogurt " → "Greek yogurt". */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * The key two names are compared by: normalized and lower-cased.
 * Matches the database's case-insensitive unique index on `lower(name)`.
 */
export function nameKey(raw: string): string {
  return normalizeName(raw).toLowerCase();
}

/** Alphabetical, ignoring case and accents, for display order. */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}
