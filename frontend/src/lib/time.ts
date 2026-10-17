const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/// "just now", "5 min ago", "3 h ago", "2 days ago", or a date beyond a week.
export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const then = new Date(iso);
  const elapsed = now.getTime() - then.getTime();
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
