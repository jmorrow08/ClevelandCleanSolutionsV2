export type CanonicalStatus =
  | "scheduled"
  | "in_progress"
  | "completed_pending_approval"
  | "approved"
  | "canceled"
  | "no_show";

const legacyToCanonical: Record<string, CanonicalStatus> = {
  Scheduled: "scheduled",
  "In Progress": "in_progress",
  "Pending Approval": "completed_pending_approval",
  Completed: "approved",
  Cancelled: "canceled",
};

export function mapLegacyStatus(
  status?: string | null
): CanonicalStatus | undefined {
  if (!status) return undefined;
  return legacyToCanonical[status] ?? undefined;
}

