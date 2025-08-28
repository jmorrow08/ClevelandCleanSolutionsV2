import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  getDoc,
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseConfig } from "../firebase";

export type RunTotals = {
  byEmployee: Record<
    string,
    { hours: number; earnings: number; hourlyRate?: number }
  >;
  totalHours: number;
  totalEarnings: number;
};

function ensureApp() {
  if (!getApps().length) initializeApp(firebaseConfig);
}

async function getEffectiveHourlyRate(
  employeeId: string,
  effectiveAt: Timestamp
): Promise<number> {
  ensureApp();
  const db = getFirestore();
  const qy = query(
    collection(db, "employeeRates"),
    where("employeeId", "==", employeeId),
    where("effectiveDate", "<=", effectiveAt),
    orderBy("effectiveDate", "desc"),
    limit(1)
  );
  const snap = await getDocs(qy);
  if (snap.empty) return 0;
  const d = snap.docs[0].data() as Record<string, unknown>;
  return Number(d?.hourlyRate || 0) || 0;
}

export async function calculateRunTotals(runId: string): Promise<RunTotals> {
  if (!runId) throw new Error("runId required");
  ensureApp();
  const db = getFirestore();
  const runRef = doc(db, "payrollRuns", runId);
  const runSnap = await getDoc(runRef);
  if (!runSnap.exists()) throw new Error("Run not found");
  const run = runSnap.data() as Record<string, unknown>;
  const periodStart = run?.periodStart as Timestamp;
  const periodEnd = run?.periodEnd as Timestamp;
  if (!periodStart || !periodEnd) throw new Error("Run missing period");

  // Include only timesheets explicitly approved into this run
  const tsQ = query(
    collection(db, "timesheets"),
    where("approvedInRunId", "==", runId),
    orderBy("employeeId", "asc"),
    orderBy("start", "asc")
  );
  const tsSnap = await getDocs(tsQ);

  const totals: RunTotals = { byEmployee: {}, totalHours: 0, totalEarnings: 0 };
  const rateCache = new Map<string, number>();

  for (const d of tsSnap.docs) {
    const row = d.data() as Record<string, unknown>;
    const employeeId = row?.employeeId as string;
    const hours = Number(row?.hours || 0) || 0;
    const units = Number(row?.units || 1) || 1;
    if (!employeeId) continue;

    let earnings = 0;
    let rate = 0;

    // Check if we have a rate snapshot with type information
    const rateSnapshot = row?.rateSnapshot as {
      type: "per_visit" | "hourly";
      amount: number;
    } | null;

    if (rateSnapshot?.type === "per_visit") {
      // Piece-rate calculation: earnings = rate * units
      rate = Number(rateSnapshot.amount || 0);
      earnings = Math.round((rate * units + Number.EPSILON) * 100) / 100;
    } else {
      // Hourly calculation: earnings = hours * rate
      // Determine rate: prefer embedded snapshot
      const legacyRateSnapshot = row?.rateSnapshot as {
        hourlyRate?: number;
      } | null;
      rate =
        Number(rateSnapshot?.amount || legacyRateSnapshot?.hourlyRate || 0) ||
        0;
      if (!rate) {
        const startTs = row?.start as Timestamp;
        const cacheKey = `${employeeId}|${startTs?.seconds || "0"}`;
        if (rateCache.has(cacheKey)) rate = rateCache.get(cacheKey)!;
        else {
          rate = await getEffectiveHourlyRate(employeeId, startTs);
          rateCache.set(cacheKey, rate);
        }
      }
      earnings = Math.round((hours * rate + Number.EPSILON) * 100) / 100;
    }

    const cur = totals.byEmployee[employeeId] || {
      hours: 0,
      earnings: 0,
      hourlyRate: rate || undefined,
    };
    cur.hours += hours;
    cur.earnings = Math.round((cur.earnings + earnings) * 100) / 100;
    if (!cur.hourlyRate && rate) cur.hourlyRate = rate;
    totals.byEmployee[employeeId] = cur;
    totals.totalHours += hours;
    totals.totalEarnings =
      Math.round((totals.totalEarnings + earnings) * 100) / 100;
  }

  // Round totals
  totals.totalHours = Math.round(totals.totalHours * 100) / 100;
  totals.totalEarnings = Math.round(totals.totalEarnings * 100) / 100;
  return totals;
}

export async function approveTimesheets(
  runId: string,
  timesheetIds: string[]
): Promise<{ count: number }> {
  if (!runId) throw new Error("runId required");
  if (!Array.isArray(timesheetIds) || timesheetIds.length === 0)
    return { count: 0 };

  ensureApp();
  const functions = getFunctions();

  try {
    const approveTimesheetsCallable = httpsCallable(
      functions,
      "approveTimesheetsInRun"
    );
    const result = await approveTimesheetsCallable({ runId, timesheetIds });
    const data = result.data as Record<string, unknown>;
    return { count: Number(data?.count || 0) };
  } catch (error: unknown) {
    console.error("approveTimesheets error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to approve timesheets";
    throw new Error(errorMessage);
  }
}

export async function createPayrollRun(
  periodStart: Date,
  periodEnd: Date
): Promise<{ id: string }> {
  if (!periodStart || !periodEnd)
    throw new Error("periodStart and periodEnd are required");

  ensureApp();
  const functions = getFunctions();

  try {
    const createPayrollRunCallable = httpsCallable(
      functions,
      "createPayrollRun"
    );
    const result = await createPayrollRunCallable({
      periodStart: periodStart.getTime(),
      periodEnd: periodEnd.getTime(),
    });

    const data = result.data as Record<string, unknown>;
    if (!data || !data.id) {
      throw new Error("Invalid response from server");
    }

    return { id: String(data.id) };
  } catch (error: unknown) {
    console.error("createPayrollRun error:", error);

    // Handle Firebase Functions specific errors
    if (
      (error as Record<string, unknown>)?.code === "functions/unauthenticated"
    ) {
      throw new Error("You must be logged in to create payroll runs");
    } else if (
      (error as Record<string, unknown>)?.code === "functions/permission-denied"
    ) {
      throw new Error("You do not have permission to create payroll runs");
    } else if (
      (error as Record<string, unknown>)?.code === "functions/invalid-argument"
    ) {
      throw new Error("Invalid date range provided");
    } else if (
      (error as Record<string, unknown>)?.code === "functions/not-found"
    ) {
      throw new Error("Required data not found");
    }

    const errorMessage =
      error instanceof Error ? error.message : "Failed to create payroll run";
    throw new Error(errorMessage);
  }
}

export async function recalcPayrollRun(runId: string): Promise<RunTotals> {
  if (!runId) throw new Error("runId required");

  ensureApp();
  const functions = getFunctions();

  try {
    const recalcPayrollRunCallable = httpsCallable(
      functions,
      "recalcPayrollRun"
    );
    const result = await recalcPayrollRunCallable({ runId });

    const data = result.data as Record<string, unknown>;
    if (!data || !data.totals) {
      throw new Error("Invalid response from server");
    }

    return data.totals as RunTotals;
  } catch (error: unknown) {
    console.error("recalcPayrollRun error:", error);

    // Handle Firebase Functions specific errors
    if (
      (error as Record<string, unknown>)?.code === "functions/unauthenticated"
    ) {
      throw new Error("You must be logged in to recalculate payroll runs");
    } else if (
      (error as Record<string, unknown>)?.code === "functions/permission-denied"
    ) {
      throw new Error("You do not have permission to recalculate payroll runs");
    } else if (
      (error as Record<string, unknown>)?.code === "functions/invalid-argument"
    ) {
      throw new Error("Invalid run ID provided");
    } else if (
      (error as Record<string, unknown>)?.code === "functions/not-found"
    ) {
      throw new Error("Payroll run not found");
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to recalculate payroll run";
    throw new Error(errorMessage);
  }
}

// Helper function to get effective rate for an employee at a specific date
async function getEffectiveRate(
  employeeId: string,
  effectiveAt: Timestamp,
  locationId?: string,
  clientProfileId?: string
): Promise<{ type: "per_visit" | "hourly"; amount: number } | null> {
  ensureApp();
  const db = getFirestore();

  // First try to find scoped rates (location or client specific)
  let qy = query(
    collection(db, "employeeRates"),
    where("employeeId", "==", employeeId),
    where("effectiveDate", "<=", effectiveAt),
    orderBy("effectiveDate", "desc"),
    limit(1)
  );

  if (locationId) {
    qy = query(
      collection(db, "employeeRates"),
      where("employeeId", "==", employeeId),
      where("locationId", "==", locationId),
      where("effectiveDate", "<=", effectiveAt),
      orderBy("effectiveDate", "desc"),
      limit(1)
    );
  } else if (clientProfileId) {
    qy = query(
      collection(db, "employeeRates"),
      where("employeeId", "==", employeeId),
      where("clientProfileId", "==", clientProfileId),
      where("effectiveDate", "<=", effectiveAt),
      orderBy("effectiveDate", "desc"),
      limit(1)
    );
  }

  const snap = await getDocs(qy);
  if (!snap.empty) {
    const data = snap.docs[0].data() as Record<string, unknown>;
    if (data?.rateType === "per_visit" && data?.perVisitRate) {
      return { type: "per_visit", amount: Number(data.perVisitRate) || 0 };
    } else if (data?.rateType === "hourly" && data?.hourlyRate) {
      return { type: "hourly", amount: Number(data.hourlyRate) || 0 };
    }
  }

  // Fallback to global rates if no scoped rate found
  if (locationId || clientProfileId) {
    const globalQy = query(
      collection(db, "employeeRates"),
      where("employeeId", "==", employeeId),
      where("effectiveDate", "<=", effectiveAt),
      orderBy("effectiveDate", "desc"),
      limit(1)
    );
    const globalSnap = await getDocs(globalQy);
    if (!globalSnap.empty) {
      const data = globalSnap.docs[0].data() as Record<string, unknown>;
      if (data?.rateType === "per_visit" && data?.perVisitRate) {
        return { type: "per_visit", amount: Number(data.perVisitRate) || 0 };
      } else if (data?.rateType === "hourly" && data?.hourlyRate) {
        return { type: "hourly", amount: Number(data.hourlyRate) || 0 };
      }
    }
  }

  return null;
}

// Helper function to check if timesheet exists for employee+job+date
async function checkTimesheetExists(
  employeeId: string,
  jobId: string,
  serviceDate: Date
): Promise<boolean> {
  ensureApp();
  const db = getFirestore();

  const startOfDay = new Date(serviceDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(serviceDate);
  endOfDay.setHours(23, 59, 59, 999);

  const qy = query(
    collection(db, "timesheets"),
    where("employeeId", "==", employeeId),
    where("jobId", "==", jobId),
    where("start", ">=", Timestamp.fromDate(startOfDay)),
    where("start", "<=", Timestamp.fromDate(endOfDay))
  );

  const snap = await getDocs(qy);
  return !snap.empty;
}

export async function scanJobsForPeriod(
  periodStart: Date,
  periodEnd: Date
): Promise<{
  jobs: Array<{
    jobId: string;
    employeeId: string;
    serviceDate: Date;
    locationId?: string;
    clientProfileId?: string;
    duration?: number;
    existingTimesheet?: boolean;
  }>;
  drafts: Array<{
    employeeId: string;
    jobId: string;
    serviceDate: Date;
    locationId?: string;
    clientProfileId?: string;
    rateSnapshot: { type: "per_visit" | "hourly"; amount: number };
    units: number;
    hours?: number;
  }>;
  totalJobs: number;
  totalAssignments: number;
  missingRates: Array<{
    employeeId: string;
    jobId: string;
    locationId?: string;
  }>;
}> {
  if (!periodStart || !periodEnd) {
    throw new Error("periodStart and periodEnd are required");
  }

  ensureApp();
  const db = getFirestore();

  // Query serviceHistory for the period
  const qy = query(
    collection(db, "serviceHistory"),
    where("serviceDate", ">=", Timestamp.fromDate(periodStart)),
    where("serviceDate", "<", Timestamp.fromDate(periodEnd)),
    orderBy("serviceDate", "asc")
  );

  const snap = await getDocs(qy);
  const jobs: Record<string, unknown>[] = [];
  const jobAssignments: Array<{
    jobId: string;
    employeeId: string;
    serviceDate: Date;
    locationId?: string;
    clientProfileId?: string;
    duration?: number;
  }> = [];

  snap.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const serviceDate = (data.serviceDate as Timestamp)?.toDate
      ? (data.serviceDate as Timestamp).toDate()
      : new Date(data.serviceDate as string);

    // Get assigned employees - prefer assignedEmployees array, fallback to legacy employeeAssignments
    let assignedEmployees: string[] = [];
    if (Array.isArray(data.assignedEmployees)) {
      assignedEmployees = data.assignedEmployees;
    } else if (Array.isArray(data.employeeAssignments)) {
      assignedEmployees = data.employeeAssignments
        .filter((assignment: Record<string, unknown>) => assignment?.uid)
        .map((assignment: Record<string, unknown>) => assignment.uid as string);
    }

    jobs.push({
      id: doc.id,
      ...data,
      serviceDate,
    });

    // Create assignment entries for each employee
    assignedEmployees.forEach((employeeId: string) => {
      jobAssignments.push({
        jobId: doc.id,
        employeeId,
        serviceDate,
        locationId: data.locationId as string | undefined,
        clientProfileId: data.clientProfileId as string | undefined,
        duration: (data.duration || data.estimatedDuration) as
          | number
          | undefined,
      });
    });
  });

  // Check for existing timesheets and get rate snapshots
  const drafts: Array<{
    employeeId: string;
    jobId: string;
    serviceDate: Date;
    locationId?: string;
    clientProfileId?: string;
    rateSnapshot: { type: "per_visit" | "hourly"; amount: number };
    units: number;
    hours?: number;
  }> = [];

  const missingRates: Array<{
    employeeId: string;
    jobId: string;
    locationId?: string;
  }> = [];

  for (const assignment of jobAssignments) {
    // Check if timesheet already exists
    const existingTimesheet = await checkTimesheetExists(
      assignment.employeeId,
      assignment.jobId,
      assignment.serviceDate
    );

    if (existingTimesheet) {
      continue; // Skip if timesheet already exists
    }

    // Get effective rate for this assignment
    const rateSnapshot = await getEffectiveRate(
      assignment.employeeId,
      Timestamp.fromDate(assignment.serviceDate),
      assignment.locationId,
      assignment.clientProfileId
    );

    if (!rateSnapshot) {
      missingRates.push({
        employeeId: assignment.employeeId,
        jobId: assignment.jobId,
        locationId: assignment.locationId,
      });
      continue;
    }

    // Create draft timesheet
    const draft: {
      employeeId: string;
      jobId: string;
      serviceDate: Date;
      locationId?: string;
      clientProfileId?: string;
      rateSnapshot: { type: "per_visit" | "hourly"; amount: number };
      units: number;
      hours?: number;
    } = {
      employeeId: assignment.employeeId,
      jobId: assignment.jobId,
      serviceDate: assignment.serviceDate,
      locationId: assignment.locationId,
      clientProfileId: assignment.clientProfileId,
      rateSnapshot,
      units: 1,
    };

    if (rateSnapshot.type === "per_visit") {
      draft.units = 1;
    } else if (rateSnapshot.type === "hourly") {
      draft.hours = assignment.duration ? assignment.duration / 60 : 0; // Convert minutes to hours
    }

    drafts.push(draft);
  }

  return {
    jobs: jobAssignments,
    drafts,
    totalJobs: jobs.length,
    totalAssignments: jobAssignments.length,
    missingRates,
  };
}

export async function generateTimesheets(
  drafts: Array<{
    employeeId: string;
    jobId: string;
    serviceDate: Date;
    locationId?: string;
    clientProfileId?: string;
    rateSnapshot: { type: "per_visit" | "hourly"; amount: number };
    units: number;
    hours?: number;
  }>
): Promise<{ created: number }> {
  if (!drafts || drafts.length === 0) {
    return { created: 0 };
  }

  ensureApp();
  const db = getFirestore();

  let created = 0;

  for (const draft of drafts) {
    try {
      // Create timesheet entry
      const timesheetData = {
        employeeId: draft.employeeId,
        jobId: draft.jobId,
        start: Timestamp.fromDate(draft.serviceDate),
        end: Timestamp.fromDate(draft.serviceDate), // Same as start for now
        hours: draft.hours || 0,
        units: draft.units || 1,
        rateSnapshot: draft.rateSnapshot,
        employeeApproved: false,
        adminApproved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "timesheets"), timesheetData);
      created++;
    } catch (error) {
      console.error(
        `Failed to create timesheet for ${draft.employeeId} - ${draft.jobId}:`,
        error
      );
      // Continue with other drafts even if one fails
    }
  }

  return { created };
}

export async function backfillRateSnapshots(
  startDate: Date,
  endDate: Date
): Promise<{
  success: boolean;
  updated: number;
  skipped: number;
  errors: number;
  total: number;
}> {
  if (!startDate || !endDate) {
    throw new Error("startDate and endDate are required");
  }

  ensureApp();
  const functions = getFunctions();

  try {
    const backfillRateSnapshotsCallable = httpsCallable(
      functions,
      "backfillRateSnapshots"
    );
    const result = await backfillRateSnapshotsCallable({
      startDate: startDate.getTime(),
      endDate: endDate.getTime(),
    });

    const data = result.data as Record<string, unknown>;
    if (!data) {
      throw new Error("Invalid response from server");
    }

    return {
      success: Boolean(data.success),
      updated: Number(data.updated || 0),
      skipped: Number(data.skipped || 0),
      errors: Number(data.errors || 0),
      total: Number(data.total || 0),
    };
  } catch (error: unknown) {
    console.error("backfillRateSnapshots error:", error);

    // Handle Firebase Functions specific errors
    if (
      (error as Record<string, unknown>)?.code === "functions/unauthenticated"
    ) {
      throw new Error("You must be logged in to backfill rate snapshots");
    } else if (
      (error as Record<string, unknown>)?.code === "functions/permission-denied"
    ) {
      throw new Error("You do not have permission to backfill rate snapshots");
    } else if (
      (error as Record<string, unknown>)?.code === "functions/invalid-argument"
    ) {
      throw new Error("Invalid date range provided");
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to backfill rate snapshots";
    throw new Error(errorMessage);
  }
}

export async function isPayrollRunLocked(runId: string): Promise<boolean> {
  if (!runId) {
    return false;
  }

  ensureApp();
  const db = getFirestore();

  try {
    const runDoc = await getDoc(doc(db, "payrollRuns", runId));
    if (!runDoc.exists()) {
      return false;
    }

    const runData = runDoc.data() as Record<string, unknown>;
    return runData?.status === "locked";
  } catch (error) {
    console.error("Error checking payroll run lock status:", error);
    return false;
  }
}

export async function getLockedPayrollRunIds(): Promise<string[]> {
  ensureApp();
  const db = getFirestore();

  try {
    const lockedRunsQuery = query(
      collection(db, "payrollRuns"),
      where("status", "==", "locked")
    );

    const lockedRunsSnapshot = await getDocs(lockedRunsQuery);
    const lockedIds: string[] = [];

    lockedRunsSnapshot.forEach((doc) => {
      lockedIds.push(doc.id);
    });

    return lockedIds;
  } catch (error) {
    console.error("Error getting locked payroll run IDs:", error);
    return [];
  }
}
