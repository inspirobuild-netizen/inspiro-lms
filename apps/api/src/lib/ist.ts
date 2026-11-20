// The academy's day is the Indian one: "today" for daily limits and the daily
// digest turns over at midnight IST, not midnight UTC (05:30 in the morning).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Midnight IST at the start of the day containing [now], as a UTC instant. */
export function startOfIstDay(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}
