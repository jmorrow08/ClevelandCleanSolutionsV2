/**
 * Time utilities for displaying job windows using the V1 model.
 */

/**
 * Compute start and end of the calendar day for a given Timestamp/Date
 * in a specific IANA time zone. Returns UTC Date instances.
 */
export function makeDayBounds(
  ts: any,
  tz: string = "America/New_York"
): { start: Date; end: Date } {
  const date: Date = ts?.toDate
    ? ts.toDate()
    : ts instanceof Date
    ? ts
    : new Date();

  const ymdParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parseInt(
    ymdParts.find((p) => p.type === "year")?.value || "1970",
    10
  );
  const month = parseInt(
    ymdParts.find((p) => p.type === "month")?.value || "01",
    10
  );
  const day = parseInt(
    ymdParts.find((p) => p.type === "day")?.value || "01",
    10
  );

  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset",
    hour12: false,
  }).formatToParts(date);
  const tzName = tzParts.find((p) => p.type === "timeZoneName")?.value || "GMT";

  const offsetMs = parseGmtOffsetToMs(tzName);
  const localStartMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const localEndMs = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  const start = new Date(localStartMs - offsetMs);
  const end = new Date(localEndMs - offsetMs);
  return { start, end };
}

function parseGmtOffsetToMs(label: string): number {
  const m = label.match(/([+-]?)(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = parseInt(m[2] || "0", 10);
  const mins = parseInt(m[3] || "0", 10);
  return sign * (hours * 60 + mins) * 60 * 1000;
}

/**
 * Format a job window given a serviceDate and optional shift object.
 * - If shift has start/end: formats "h:mm a – h:mm a" (or a single time if end missing).
 * - Otherwise uses serviceDate as single time: "h:mm a".
 */
export function formatJobWindow(
  serviceDate: any,
  shift?: { start?: any; end?: any },
  tz: string = "America/New_York"
): string {
  const startDate: Date | null = toDate(serviceDate);
  if (!startDate) return "—";

  const shiftStart = toDate(shift?.start);
  const shiftEnd = toDate(shift?.end);

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);

  if (shiftStart) {
    if (shiftEnd) return `${fmt(shiftStart)} – ${fmt(shiftEnd)}`;
    return fmt(shiftStart);
  }
  return fmt(startDate);
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v?.toDate) return v.toDate();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
  if (typeof v === "number") return new Date(v);
  return null;
}
