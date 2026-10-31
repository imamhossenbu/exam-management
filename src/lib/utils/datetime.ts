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

/** Interface languages the formatters understand (kept here so this module has no i18n dependency). */
export type DateLocale = "bn" | "en";

// Bangla month names with Latin digits, matching the rest of the UI's numbers; 24-hour clock.
const INTL_LOCALE: Record<DateLocale, string> = { bn: "bn-BD-u-nu-latn", en: "en-GB" };

export function formatDateTime(iso: string | null | undefined, timeZone: string, opts?: { withZone?: boolean; locale?: DateLocale }) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(INTL_LOCALE[opts?.locale ?? "en"], {
    timeZone: safeZone(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(opts?.withZone ? { timeZoneName: "short" } : {}),
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined, timeZone: string, locale: DateLocale = "en") {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: safeZone(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

const UNITS: Record<DateLocale, { h: string; m: string; s: string; hours: string; minutes: string }> = {
  en: { h: "h", m: "m", s: "s", hours: "h", minutes: "min" },
  bn: { h: "ঘ", m: "মি", s: "সে", hours: "ঘণ্টা", minutes: "মিনিট" },
};

/** "1h 05m 09s" / "05m 09s" countdown text ("1ঘ 05মি 09সে" in Bangla). */
export function formatDuration(ms: number, locale: DateLocale = "en"): string {
  const u = UNITS[locale];
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}${u.h} ${pad(m)}${u.m} ${pad(s)}${u.s}` : `${pad(m)}${u.m} ${pad(s)}${u.s}`;
}

/** "30 min" / "2 h 30 min" ("30 মিনিট" / "2 ঘণ্টা 30 মিনিট" in Bangla). */
export function formatMinutes(minutes: number, locale: DateLocale = "en"): string {
  const u = UNITS[locale];
  if (minutes < 60) return `${minutes} ${u.minutes}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ${u.hours} ${m} ${u.minutes}` : `${h} ${u.hours}`;
}

/** Calendar days `from`..`to` (YYYY-MM-DD, inclusive) in `timeZone` as UTC instants; `to` is exclusive. */
export function localDayBounds(from: string, to: string, timeZone: string): { from: string | null; to: string | null } {
  let end: string | null = null;
  if (to) {
    const next = new Date(`${to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    end = zonedInputToUtc(`${next.toISOString().slice(0, 10)}T00:00`, timeZone);
  }
  return { from: from ? zonedInputToUtc(`${from}T00:00`, timeZone) : null, to: end };
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
  const b = localDayBounds(from, to, timeZone);
  if (b.from && t < new Date(b.from).getTime()) return false;
  if (b.to && t >= new Date(b.to).getTime()) return false;
  return true;
}

/** The formatters bound to one interface language. */
export function formatters(locale: DateLocale) {
  return {
    dateTime: (iso: string | null | undefined, timeZone: string, opts?: { withZone?: boolean }) => formatDateTime(iso, timeZone, { ...opts, locale }),
    date: (iso: string | null | undefined, timeZone: string) => formatDate(iso, timeZone, locale),
    minutes: (minutes: number) => formatMinutes(minutes, locale),
    duration: (ms: number) => formatDuration(ms, locale),
  };
}
export type Formatters = ReturnType<typeof formatters>;
