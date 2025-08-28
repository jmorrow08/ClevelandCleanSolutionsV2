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
  // New piece-rate support
  rateSnapshot?: { type: "per_visit" | "hourly"; amount: number } | null;
  units?: number;
};
