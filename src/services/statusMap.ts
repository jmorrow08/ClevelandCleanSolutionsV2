export type CanonicalStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "canceled"
  | "no_show";

const legacyToCanonical: Record<string, CanonicalStatus> = {
  Scheduled: "scheduled",
  "In Progress": "in_progress",
  // Legacy V1 semantics: Pending Approval = QA not yet approved; treat primary as in_progress for admin views.
  // We'll handle QA chip separately in derived UI models.
  "Pending Approval": "in_progress",
  // Legacy V1 Completed means QA approved; payroll may or may not be processed yet.
  Completed: "completed",
  Cancelled: "canceled",
};

export function mapLegacyStatus(
  status?: string | null
): CanonicalStatus | undefined {
  if (!status) return undefined;
  return legacyToCanonical[status] ?? undefined;
}

export type AdminUiStatus = {
  // Primary workflow state used for the main pill
  primary: CanonicalStatus; // scheduled | in_progress | completed | canceled | no_show
  // QA gate derived from legacy or explicit flag
  qa: "approved" | "needs_approval";
  // Payroll gate derived from payrollProcessed flag
  payroll: "processed" | "pending";
};

type LegacyJobLike = {
  status?: string | null; // V1 status string
  serviceDate?: any; // Firestore Timestamp-like or Date
  payrollProcessed?: boolean | null;
  qaApproved?: boolean | null; // optional future field
};

function toDateSafe(v: any): Date | null {
  try {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === "function") return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    const n = Number(v);
    if (Number.isFinite(n)) return new Date(n);
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// Convert a job into the admin UI model per agreed rules.
export function deriveAdminStatus(
  job: LegacyJobLike,
  now: Date = new Date(),
  tz: string = "America/New_York"
): AdminUiStatus {
  const legacy = (job?.status || "").trim();
  const planned = toDateSafe(job?.serviceDate);

  // Primary derivation
  let primary: CanonicalStatus = "scheduled";
  if (legacy === "Cancelled") primary = "canceled";
  else if (legacy === "Completed") primary = "completed";
  else if (legacy === "In Progress") primary = "in_progress";
  else if (legacy === "Pending Approval") primary = "in_progress";
  else if (legacy === "Scheduled") {
    // Auto-display in_progress when start time has arrived, without mutating data
    if (planned) {
      // NOTE: we do not convert timezone here; Firestore Timestamp is UTC and UI formats handle tz.
      // Using local comparison is acceptable for display-only transitions.
      if (now.getTime() >= planned.getTime()) primary = "in_progress";
      else primary = "scheduled";
    } else {
      primary = "scheduled";
    }
  } else {
    // Fallback to mapped canonical when unknown
    primary = mapLegacyStatus(legacy) || "scheduled";
  }

  // QA gate
  let qa: AdminUiStatus["qa"] = "approved";
  if (job?.qaApproved === true) qa = "approved";
  else if (legacy === "Pending Approval") qa = "needs_approval";
  else if (legacy !== "Completed")
    qa = "needs_approval"; // conservative until completed
  else qa = "approved";

  // Payroll gate
  const payroll: AdminUiStatus["payroll"] = job?.payrollProcessed
    ? "processed"
    : "pending";

  return { primary, qa, payroll };
}

// Client view collapses states to Upcoming, In Progress, Completed irrespective of payroll.
export type ClientStatus = "upcoming" | "in_progress" | "completed";

export function deriveClientStatus(
  job: LegacyJobLike,
  now: Date = new Date()
): ClientStatus {
  const legacy = (job?.status || "").trim();
  const planned = toDateSafe(job?.serviceDate);

  if (legacy === "Completed") return "completed";
  if (legacy === "In Progress" || legacy === "Pending Approval")
    return "in_progress";
  if (legacy === "Scheduled") {
    if (planned && now.getTime() >= planned.getTime()) return "in_progress";
    return "upcoming";
  }
  // Fallbacks
  const mapped = mapLegacyStatus(legacy);
  if (mapped === "completed") return "completed";
  if (mapped === "in_progress") return "in_progress";
  return "upcoming";
}
