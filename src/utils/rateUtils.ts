import { Timestamp } from "firebase/firestore";

export type RateSnapshot =
  | {
      type: "per_visit" | "hourly" | "monthly";
      amount: number;
      monthlyPayDay?: number; // Day of month for monthly payments (1-31)
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
  periodStart?: Date;
  periodEnd?: Date;
}): number {
  const hours = Number(timesheet.hours || 0) || 0;
  const units = Number(timesheet.units || 1) || 1;

  // Calculate earnings based on rate snapshot
  if (timesheet.rateSnapshot && "type" in timesheet.rateSnapshot) {
    const rate = Number((timesheet.rateSnapshot as any).amount || 0);

    if (timesheet.rateSnapshot.type === "per_visit") {
      return Math.round((rate * units + Number.EPSILON) * 100) / 100;
    } else if (timesheet.rateSnapshot.type === "hourly") {
      return Math.round((rate * hours + Number.EPSILON) * 100) / 100;
    } else if (timesheet.rateSnapshot.type === "monthly") {
      // Calculate prorated monthly amount based on the period
      if (timesheet.periodStart && timesheet.periodEnd) {
        const daysInPeriod = Math.ceil(
          (timesheet.periodEnd.getTime() - timesheet.periodStart.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        const monthlyPayDay =
          (timesheet.rateSnapshot as any).monthlyPayDay || 1;
        const prorationFactor = daysInPeriod / 30; // Approximate month as 30 days
        return (
          Math.round((rate * prorationFactor + Number.EPSILON) * 100) / 100
        );
      } else {
        // Default to full monthly amount if no period specified
        return Math.round((rate + Number.EPSILON) * 100) / 100;
      }
    } else {
      // Fallback: try to get rate from legacy format
      const legacyRate = (timesheet.rateSnapshot as any)?.hourlyRate;
      if (legacyRate) {
        const rate = Number(legacyRate || 0);
        return Math.round((rate * hours + Number.EPSILON) * 100) / 100;
      }
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
