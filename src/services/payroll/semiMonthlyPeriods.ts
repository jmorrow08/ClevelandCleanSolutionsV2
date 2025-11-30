import { Timestamp } from 'firebase/firestore';

import type { PayrollPeriod } from '@/types/payroll';

export type SemiMonthlyPeriod = {
  periodId: string;
  workPeriodStart: Date;
  workPeriodEnd: Date;
  payDate: Date;
};

const pad = (value: number) => value.toString().padStart(2, '0');

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const lastDayOfMonth = (year: number, monthIndex: number) => new Date(year, monthIndex + 1, 0);

export function getSemiMonthlyPeriodForWorkDate(workDateInput: Date): SemiMonthlyPeriod {
  const workDate = startOfDay(workDateInput);
  const year = workDate.getFullYear();
  const month = workDate.getMonth();
  const day = workDate.getDate();

  if (day <= 15) {
    const workPeriodStart = startOfDay(new Date(year, month, 1));
    const workPeriodEnd = endOfDay(new Date(year, month, 15));
    const payDate = startOfDay(new Date(year, month, 15));
    return {
      periodId: toDateKey(payDate),
      workPeriodStart,
      workPeriodEnd,
      payDate,
    };
  }

  const workPeriodStart = startOfDay(new Date(year, month, 16));
  const workPeriodEnd = endOfDay(lastDayOfMonth(year, month));
  const payDate = startOfDay(new Date(year, month + 1, 1));
  return {
    periodId: toDateKey(payDate),
    workPeriodStart,
    workPeriodEnd,
    payDate,
  };
}

export function getSemiMonthlyPeriodForPayDate(payDateInput: Date): SemiMonthlyPeriod {
  const payDate = startOfDay(payDateInput);
  const year = payDate.getFullYear();
  const month = payDate.getMonth();
  const day = payDate.getDate();

  if (day === 15) {
    // Pay date of 15th => work period is 1st - 15th of same month
    const workPeriodStart = startOfDay(new Date(year, month, 1));
    const workPeriodEnd = endOfDay(new Date(year, month, 15));
    return {
      periodId: toDateKey(payDate),
      workPeriodStart,
      workPeriodEnd,
      payDate,
    };
  }

  if (day === 1) {
    // Pay date of 1st => work period is 16th - end of previous month
    const prevMonth = new Date(year, month - 1, 1);
    const prevYear = prevMonth.getFullYear();
    const prevMonthIndex = prevMonth.getMonth();
    const workPeriodStart = startOfDay(new Date(prevYear, prevMonthIndex, 16));
    const workPeriodEnd = endOfDay(lastDayOfMonth(prevYear, prevMonthIndex));

    return {
      periodId: toDateKey(payDate),
      workPeriodStart,
      workPeriodEnd,
      payDate,
    };
  }

  // Invalid pay date - semi-monthly periods only support 1st and 15th as pay dates
  throw new Error(
    `Invalid pay date: ${payDateInput.toISOString()}. Semi-monthly pay dates must be the 1st or 15th of the month.`,
  );
}

export function getCurrentSemiMonthlyPeriod(referenceDate: Date = new Date()): SemiMonthlyPeriod {
  return getSemiMonthlyPeriodForWorkDate(referenceDate);
}

export function getPreviousSemiMonthlyPeriod(period: SemiMonthlyPeriod): SemiMonthlyPeriod {
  const prevPayDate =
    period.payDate.getDate() === 15
      ? new Date(period.payDate.getFullYear(), period.payDate.getMonth(), 1)
      : new Date(period.payDate.getFullYear(), period.payDate.getMonth() - 1, 15);
  return getSemiMonthlyPeriodForPayDate(prevPayDate);
}

export function getNextSemiMonthlyPeriod(period: SemiMonthlyPeriod): SemiMonthlyPeriod {
  const nextPayDate =
    period.payDate.getDate() === 15
      ? new Date(period.payDate.getFullYear(), period.payDate.getMonth() + 1, 1)
      : new Date(period.payDate.getFullYear(), period.payDate.getMonth(), 15);
  return getSemiMonthlyPeriodForPayDate(nextPayDate);
}

export function semiMonthlyPeriodToFirestorePayload(
  period: SemiMonthlyPeriod,
): Pick<
  PayrollPeriod,
  'id' | 'periodStart' | 'periodEnd' | 'payDate' | 'status' | 'totals' | 'createdAt'
> {
  return {
    id: period.periodId,
    periodStart: Timestamp.fromDate(period.workPeriodStart),
    periodEnd: Timestamp.fromDate(period.workPeriodEnd),
    payDate: Timestamp.fromDate(period.payDate),
    status: 'open',
    totals: { gross: 0, deductions: 0, net: 0 },
    createdAt: Timestamp.now(),
  };
}

export function semiMonthlyPeriodId(payDate: Date | string): string {
  if (typeof payDate === 'string') return payDate;
  return toDateKey(startOfDay(payDate));
}
