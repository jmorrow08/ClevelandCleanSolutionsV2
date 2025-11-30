import { Timestamp } from 'firebase/firestore';

export type PayrollPeriodStatus = 'open' | 'finalized';

export type PayrollPeriodTotals = {
  gross: number;
  deductions: number;
  net: number;
};

export type PayrollPeriod = {
  id: string;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  payDate: Timestamp;
  status: PayrollPeriodStatus;
  totals: PayrollPeriodTotals;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  finalizedAt?: Timestamp;
  finalizedBy?: string;
};

export type PayrollEntryType = 'earning' | 'deduction';

export type PayrollEarningCategory = 'per_visit' | 'hourly' | 'monthly';

export type PayrollDeductionCategory =
  | 'missed_day'
  | 'uniform'
  | 'supplies'
  | 'advance'
  | 'manual_adjustment'
  | 'other';

export type PayrollEntryCategory = PayrollEarningCategory | PayrollDeductionCategory;

export type PayrollEntryOverride = {
  originalAmount: number;
  adjustedBy: string;
  adjustedAt: Timestamp;
  reason?: string;
};

export type PayrollEntry = {
  id: string;
  periodId: string;
  employeeId: string;
  jobId?: string;
  type: PayrollEntryType;
  category: PayrollEntryCategory;
  amount: number;
  hours?: number;
  units?: number;
  rateSnapshot?: {
    type: PayrollEarningCategory;
    amount: number;
  };
  description?: string;
  jobCompletedAt?: Timestamp;
  source?: string;
  createdAt: Timestamp;
  override?: PayrollEntryOverride;
};

export type PayrollEmployeeTotals = {
  employeeId: string;
  gross: number;
  deductions: number;
  net: number;
};

export type PayrollPeriodSummary = {
  period: PayrollPeriod;
  totals: PayrollPeriodTotals;
  byEmployee: PayrollEmployeeTotals[];
};
