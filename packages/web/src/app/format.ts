/** "1 item", "3 items". */
export function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? "" : "s"}`;
}

/** The first letter of a name, for the small avatar circles. */
export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** "3:42 PM", in the phone's own locale and time zone. */
export function clockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
