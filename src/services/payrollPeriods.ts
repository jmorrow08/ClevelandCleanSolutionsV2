import { Timestamp } from "firebase/firestore";

export type PayrollFrequency = "weekly" | "biweekly" | "monthly";

export type PayrollCycle = {
  frequency?: PayrollFrequency;
  anchor?: any;
  anchorDayOfWeek?: number; // 0..6 (Sun..Sat)
  anchorDayOfMonth?: number; // 1..28
  anchorDate?: any; // Firestore Timestamp | Date | number
};

export type Period = { start: Date; end: Date };

function toDate(value: any): Date | null {
  try {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value.seconds === "number")
      return new Date(value.seconds * 1000);
    const n = Number(value);
    if (Number.isFinite(n)) return new Date(n);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function atStartOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonthsClampDay(d: Date, months: number, dayOfMonth: number): Date {
  const base = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const day = Math.min(Math.max(dayOfMonth, 1), 28);
  base.setDate(day);
  base.setHours(0, 0, 0, 0);
  return base;
}

export function computeLastCompletedPeriod(
  nowInput: Date | null | undefined,
  cycle: PayrollCycle | null | undefined
): Period | null {
  const now = atStartOfDay(nowInput ? nowInput : new Date());
  const frequency: PayrollFrequency = (cycle?.frequency || "biweekly") as any;

  if (frequency === "weekly") {
    const dow = Number.isInteger(cycle?.anchorDayOfWeek)
      ? (cycle!.anchorDayOfWeek as number)
      : 1; // default Monday
    // Find current week's anchor
    const cur = new Date(now);
    const diffToAnchor = (cur.getDay() - dow + 7) % 7;
    const curAnchor = addDays(cur, -diffToAnchor);
    const curEnd = addDays(curAnchor, 7);
    if (curEnd <= now) {
      return { start: curAnchor, end: curEnd };
    }
    const prevStart = addDays(curAnchor, -7);
    const prevEnd = curAnchor;
    return { start: prevStart, end: prevEnd };
  }

  if (frequency === "biweekly") {
    // Base anchor: a known start. Default: last Monday two weeks prior
    const base =
      toDate(cycle?.anchorDate) ||
      (() => {
        const tmp = addDays(now, -14);
        // move to Monday
        const diff = (tmp.getDay() - 1 + 7) % 7;
        return addDays(tmp, -diff);
      })();
    const baseStart = atStartOfDay(base);
    const millis = now.getTime() - baseStart.getTime();
    const days = Math.floor(millis / 86400000);
    const k = Math.floor(days / 14);
    let start = addDays(baseStart, k * 14);
    let end = addDays(start, 14);
    if (end > now) {
      start = addDays(start, -14);
      end = addDays(end, -14);
    }
    return { start, end };
  }

  if (frequency === "monthly") {
    const dom = Number.isInteger(cycle?.anchorDayOfMonth)
      ? (cycle!.anchorDayOfMonth as number)
      : 1; // default 1st
    const thisAnchor = addMonthsClampDay(now, 0, dom);
    const nextAnchor = addMonthsClampDay(now, 1, dom);
    if (nextAnchor <= now) {
      return { start: thisAnchor, end: nextAnchor };
    }
    const prevAnchor = addMonthsClampDay(now, -1, dom);
    return { start: prevAnchor, end: thisAnchor };
  }

  return null;
}

export function toTimestamp(d: Date): Timestamp {
  return Timestamp.fromDate(d);
}



