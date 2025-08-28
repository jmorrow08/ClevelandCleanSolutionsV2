import { Timestamp } from "firebase/firestore";

export type RateSnapshot =
  | {
      type: "per_visit" | "hourly";
      amount: number;
    }
  | {
      hourlyRate?: number;
    }
  | null;

/**
 * Calculate earnings for a timesheet entry based on its rate snapshot
 */
export function calculateTimesheetEarnings(timesheet: {
  hours?: number;
  units?: number;
  rateSnapshot?: RateSnapshot;
}): number {
  const hours = Number(timesheet.hours || 0) || 0;
  const units = Number(timesheet.units || 1) || 1;

  // Calculate earnings based on rate snapshot
  if (timesheet.rateSnapshot?.type === "per_visit") {
    const rate = Number((timesheet.rateSnapshot as any).amount || 0);
    return Math.round((rate * units + Number.EPSILON) * 100) / 100;
  } else if (timesheet.rateSnapshot?.type === "hourly") {
    const rate = Number((timesheet.rateSnapshot as any).amount || 0);
    return Math.round((rate * hours + Number.EPSILON) * 100) / 100;
  } else {
    // Fallback: try to get rate from legacy format
    const legacyRate = (timesheet.rateSnapshot as any)?.hourlyRate;
    if (legacyRate) {
      const rate = Number(legacyRate || 0);
      return Math.round((rate * hours + Number.EPSILON) * 100) / 100;
    }
  }

  return 0;
}

/**
 * Format currency amount for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}
