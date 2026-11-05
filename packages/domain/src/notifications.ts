const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** True inside the user's quiet window in their own timezone. Handles windows that cross midnight. */
export function applyQuietHours(now: Date, timezone: string, start?: string | null, end?: string | null): boolean {
  if (!start || !end || start === end) return false;
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const t = toMinutes(local);
  const [s, e] = [toMinutes(start), toMinutes(end)];
  return s < e ? t >= s && t < e : t >= s || t < e;
}
