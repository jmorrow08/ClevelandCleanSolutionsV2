export type Timesheet = {
  id: string;
  employeeId: string;
  jobId?: string | null;
  start?: any;
  end?: any;
  hours?: number;
  approvedInRunId?: string | null;
  // New approval fields
  employeeApproved?: boolean;
  employeeComment?: string | null;
  adminApproved?: boolean;
  // Enhanced rate support (including monthly)
  rateSnapshot?: {
    type: "per_visit" | "hourly" | "monthly";
    amount: number;
    monthlyPayDay?: number;
  } | null;
  units?: number;
  // Source tracking for automation
  source?: "manual" | "clock_event" | "payroll_prep";
};
