/**
 * Timezone-aware date utilities for Cleveland Clean Solutions V2
 *
 * This module provides consistent date/time handling across all portals.
 * Key principles:
 * - All dates are handled in the business timezone (America/New_York)
 * - Firestore queries use proper timezone-aware date boundaries
 * - Display formatting respects the business timezone
 * - UTC conversion is explicit and controlled
 */

import { Timestamp } from "firebase/firestore";
import {
  startOfDay,
  endOfDay,
  addDays,
  format as dateFnsFormat,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isToday,
} from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

// Business timezone - can be made configurable later
export const BUSINESS_TIMEZONE = "America/New_York";

/**
 * Convert a Date or Timestamp to a Date in the business timezone
 */
export function toBusinessTimezone(
  date: Date | Timestamp | string | null | undefined
): Date {
  if (!date) return new Date();

  let jsDate: Date;
  if (date instanceof Timestamp) {
    jsDate = date.toDate();
  } else if (typeof date === "string") {
    jsDate = parseISO(date);
  } else {
    jsDate = date;
  }

  // Convert to business timezone
  return toZonedTime(jsDate, BUSINESS_TIMEZONE);
}

/**
 * Convert a date in business timezone to UTC for Firestore storage
 */
export function toUTC(date: Date): Date {
  // Use Intl.DateTimeFormat to properly convert to UTC
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === "year")?.value || "1970");
  const month =
    parseInt(parts.find((p) => p.type === "month")?.value || "01") - 1;
  const day = parseInt(parts.find((p) => p.type === "day")?.value || "01");
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "00");
  const minute = parseInt(
    parts.find((p) => p.type === "minute")?.value || "00"
  );
  const second = parseInt(
    parts.find((p) => p.type === "second")?.value || "00"
  );

  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

/**
 * Get the start and end of today in business timezone (as UTC dates for Firestore)
 */
export function getTodayBounds(): { start: Date; end: Date } {
  const now = new Date();
  const businessNow = toBusinessTimezone(now);
  const start = startOfDay(businessNow);
  const end = endOfDay(businessNow);
  return {
    start: toUTC(start),
    end: toUTC(end),
  };
}

/**
 * Get the start and end of tomorrow in business timezone (as UTC dates for Firestore)
 */
export function getTomorrowBounds(): { start: Date; end: Date } {
  const now = new Date();
  const businessNow = toBusinessTimezone(now);
  const tomorrow = addDays(businessNow, 1);
  const start = startOfDay(tomorrow);
  const end = endOfDay(tomorrow);
  return {
    start: toUTC(start),
    end: toUTC(end),
  };
}

/**
 * Get date range for today and tomorrow combined (as UTC dates for Firestore)
 */
export function getTodayTomorrowBounds(): { start: Date; end: Date } {
  const today = getTodayBounds();
  const tomorrow = getTomorrowBounds();
  return {
    start: today.start,
    end: tomorrow.end,
  };
}

/**
 * Get week bounds in business timezone (as UTC dates for Firestore)
 * Returns Sunday to Saturday (7 days total)
 */
export function getWeekBounds(date?: Date): { start: Date; end: Date } {
  const businessDate = date
    ? toBusinessTimezone(date)
    : toBusinessTimezone(new Date());

  // Start of week (Sunday)
  const start = startOfWeek(businessDate, { weekStartsOn: 0 });

  // End of week (Saturday) - use endOfDay to include the full Saturday
  const endOfSaturday = endOfWeek(businessDate, { weekStartsOn: 0 });

  return {
    start: toUTC(start),
    end: toUTC(endOfSaturday),
  };
}

/**
 * Get month bounds in business timezone (as UTC dates for Firestore)
 */
export function getMonthBounds(date?: Date): { start: Date; end: Date } {
  const businessDate = date
    ? toBusinessTimezone(date)
    : toBusinessTimezone(new Date());
  const start = startOfMonth(businessDate);
  const end = endOfMonth(businessDate);
  return {
    start: toUTC(start),
    end: toUTC(end),
  };
}

/**
 * Format a date for display in business timezone
 */
export function formatBusinessDate(
  date: Date | Timestamp | string | null | undefined,
  formatStr: string = "EEEE, MMMM d"
): string {
  if (!date) return "—";

  const businessDate = toBusinessTimezone(date);
  return dateFnsFormat(businessDate, formatStr);
}

/**
 * Format a time for display in business timezone
 */
export function formatBusinessTime(
  date: Date | Timestamp | string | null | undefined,
  formatStr: string = "h:mm a"
): string {
  if (!date) return "—";

  return formatInTimeZone(
    date instanceof Timestamp ? date.toDate() : date,
    BUSINESS_TIMEZONE,
    formatStr
  );
}

/**
 * Get a date key in business timezone (YYYY-MM-DD format)
 */
export function getBusinessDateKey(
  date: Date | Timestamp | string | null | undefined
): string {
  if (!date) return "";

  const businessDate = toBusinessTimezone(date);
  return dateFnsFormat(businessDate, "yyyy-MM-dd");
}

/**
 * Check if a date is today in business timezone
 */
export function isBusinessToday(
  date: Date | Timestamp | string | null | undefined
): boolean {
  if (!date) return false;

  const businessDate = toBusinessTimezone(date);
  return isToday(businessDate);
}

/**
 * Check if a date is tomorrow in business timezone
 */
export function isBusinessTomorrow(
  date: Date | Timestamp | string | null | undefined
): boolean {
  if (!date) return false;

  const businessDate = toBusinessTimezone(date);
  const tomorrow = addDays(toBusinessTimezone(new Date()), 1);
  return (
    dateFnsFormat(businessDate, "yyyy-MM-dd") ===
    dateFnsFormat(tomorrow, "yyyy-MM-dd")
  );
}

/**
 * Group jobs by business date
 */
export function groupJobsByBusinessDate<T extends { serviceDate?: any }>(
  jobs: T[]
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};

  jobs.forEach((job) => {
    const key = getBusinessDateKey(job.serviceDate);
    if (!key) return;

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(job);
  });

  return groups;
}

/**
 * Get relative date label (Today, Tomorrow, or formatted date)
 */
export function getRelativeDateLabel(
  date: Date | Timestamp | string | null | undefined
): string {
  if (!date) return "—";

  if (isBusinessToday(date)) return "Today";
  if (isBusinessTomorrow(date)) return "Tomorrow";

  return formatBusinessDate(date);
}

/**
 * Create Firestore timestamp from business timezone date
 */
export function toFirestoreTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(toUTC(date));
}

/**
 * Convert Firestore timestamp to business timezone date
 */
export function fromFirestoreTimestamp(timestamp: Timestamp): Date {
  return toBusinessTimezone(timestamp.toDate());
}

/**
 * Get current date/time in business timezone
 */
export function getBusinessNow(): Date {
  return toBusinessTimezone(new Date());
}

/**
 * Get current date in business timezone as YYYY-MM-DD string
 */
export function getCurrentBusinessDateKey(): string {
  return getBusinessDateKey(new Date());
}

/**
 * Parse a date string in business timezone
 */
export function parseBusinessDate(dateStr: string): Date {
  // Assume dateStr is in YYYY-MM-DD format
  const [year, month, day] = dateStr.split("-").map(Number);
  const businessDate = new Date(year, month - 1, day);
  return toUTC(businessDate);
}
