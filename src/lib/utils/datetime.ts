/**
 * Timestamps are stored in UTC (timestamptz) and displayed in the user's
 * configured IANA timezone. datetime-local inputs are interpreted in that
 * timezone and converted to UTC before they reach the database.
 */

export const DEFAULT_TIMEZONE = "UTC";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function safeZone(tz: string | null | undefined) {
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** "2026-03-01T09:30" in `timeZone` → ISO UTC string. Returns null if unparsable. */
export function zonedInputToUtc(local: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number) as unknown as number[];
  const tz = safeZone(timeZone);
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  // Two passes resolve offsets correctly around DST transitions.
  let guess = naiveUtc - zoneOffsetMs(new Date(naiveUtc), tz);
  guess = naiveUtc - zoneOffsetMs(new Date(guess), tz);
  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

/** ISO UTC string → "YYYY-MM-DDTHH:mm" in `timeZone` (for datetime-local inputs). */
export function utcToZonedInput(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timeZone),
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatDateTime(iso: string | null | undefined, timeZone: string, opts?: { withZone?: boolean }) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: safeZone(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(opts?.withZone ? { timeZoneName: "short" } : {}),
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined, timeZone: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: safeZone(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** "1h 05m 09s" / "05m 09s" countdown text. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${pad(m)}m ${pad(s)}s`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Whether `iso` falls within the calendar days `from`..`to` (YYYY-MM-DD, inclusive) in `timeZone`.
 * Empty bounds are open. Compares instants, not strings.
 */
export function inLocalDayRange(iso: string | null | undefined, from: string, to: string, timeZone: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (from) {
    const start = zonedInputToUtc(`${from}T00:00`, timeZone);
    if (start && t < new Date(start).getTime()) return false;
  }
  if (to) {
    const next = new Date(`${to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const end = zonedInputToUtc(`${next.toISOString().slice(0, 10)}T00:00`, timeZone);
    if (end && t >= new Date(end).getTime()) return false;
  }
  return true;
}
