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
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import { getFirebaseApp, getFirestoreInstance } from "../firebase";

export type RunTotals = {
  byEmployee: Record<
    string,
    { hours: number; earnings: number; hourlyRate?: number }
  >;
  totalHours: number;
  totalEarnings: number;
};

function getCallableFunctions() {
  const app = getFirebaseApp();
  // Always use explicit region to match deployed functions
  const fns = getFunctions(app, "us-central1");
  try {
    if (
      import.meta.env.DEV &&
      (import.meta.env as any).VITE_USE_FIREBASE_EMULATOR === "true"
    ) {
      connectFunctionsEmulator(fns, "127.0.0.1", 5001);
    }
  } catch {}
  return fns;
}

async function getEffectiveHourlyRate(
  employeeId: string,
  effectiveAt: Timestamp
): Promise<number> {
  const db = getFirestoreInstance();
  const qy = query(
    collection(db, "employeeRates"),
    where("employeeId", "==", employeeId),
    where("effectiveDate", "<=", effectiveAt),
    orderBy("effectiveDate", "desc"),
    limit(1)
  );
  const snap = await getDocs(qy);
  if (!snap.empty) {
    const d = snap.docs[0].data() as Record<string, unknown>;
    const amount =
      (typeof (d as any)?.hourlyRate === "number"
        ? (d as any).hourlyRate
        : null) ??
      (typeof (d as any)?.amount === "number" ? (d as any).amount : null) ??
      (typeof (d as any)?.rate === "number" ? (d as any).rate : null) ??
      0;
    return Number(amount || 0) || 0;
  }
  // Fallback to createdAt-based historical records (for legacy docs)
  const qyCreated = query(
    collection(db, "employeeRates"),
    where("employeeId", "==", employeeId),
    where("createdAt", "<=", effectiveAt),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  const snapCreated = await getDocs(qyCreated);
  if (snapCreated.empty) return 0;
  const d2 = snapCreated.docs[0].data() as Record<string, unknown>;
  const amount2 =
    (typeof (d2 as any)?.hourlyRate === "number"
      ? (d2 as any).hourlyRate
      : null) ??
    (typeof (d2 as any)?.amount === "number" ? (d2 as any).amount : null) ??
    (typeof (d2 as any)?.rate === "number" ? (d2 as any).rate : null) ??
    0;
  return Number(amount2 || 0) || 0;
}

export async function calculateRunTotals(runId: string): Promise<RunTotals> {
  if (!runId) throw new Error("runId required");

  const db = getFirestoreInstance();
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

  const functions = getCallableFunctions();

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

  const functions = getCallableFunctions();

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

  const functions = getCallableFunctions();

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

// Helper to normalize a rate document into a usable snapshot
function normalizeRateDoc(data: Record<string, unknown>) {
  const rawRateType = (data as any)?.rateType as
    | "per_visit"
    | "hourly"
    | "monthly"
    | undefined;
  const numericAmount =
    (typeof (data as any)?.amount === "number" ? (data as any).amount : null) ??
    (typeof (data as any)?.perVisitRate === "number"
      ? (data as any).perVisitRate
      : null) ??
    (typeof (data as any)?.hourlyRate === "number"
      ? (data as any).hourlyRate
      : null) ??
    (typeof (data as any)?.monthlyRate === "number"
      ? (data as any).monthlyRate
      : null) ??
    (typeof (data as any)?.rate === "number" ? (data as any).rate : null) ??
    0;

  let type: "per_visit" | "hourly" | "monthly";
  if (rawRateType) {
    type = rawRateType;
  } else if (typeof (data as any)?.monthlyRate === "number") {
    type = "monthly";
  } else if (typeof (data as any)?.hourlyRate === "number") {
    type = "hourly";
  } else {
    type = "per_visit";
  }

  const result: any = { type, amount: Number(numericAmount || 0) };

  // Include monthly pay day if available
  if (type === "monthly" && typeof (data as any)?.monthlyPayDay === "number") {
    result.monthlyPayDay = (data as any).monthlyPayDay;
  }

  return result;
}

// Helper function to get effective rate for an employee at a specific date
async function getEffectiveRate(
  employeeId: string,
  effectiveAt: Timestamp,
  locationId?: string,
  clientProfileId?: string
): Promise<{
  type: "per_visit" | "hourly" | "monthly";
  amount: number;
  monthlyPayDay?: number;
} | null> {
  const db = getFirestoreInstance();

  // We'll try two identifier fields for backward-compatibility:
  // 1) employeeId (newer schema)
  // 2) employeeProfileId (legacy schema where this equals the employee profile doc id)
  const idFields: Array<"employeeId" | "employeeProfileId"> = [
    "employeeId",
    "employeeProfileId",
  ];

  // Search order:
  // a) scoped by location/client using effectiveDate
  // b) scoped by location/client using createdAt (legacy)
  // c) global by effectiveDate
  // d) global by createdAt
  for (const idField of idFields) {
    // a) Scoped effectiveDate
    let qy = query(
      collection(db, "employeeRates"),
      where(idField, "==", employeeId),
      where("effectiveDate", "<=", effectiveAt),
      orderBy("effectiveDate", "desc"),
      limit(1)
    );
    if (locationId) {
      qy = query(
        collection(db, "employeeRates"),
        where(idField, "==", employeeId),
        where("locationId", "==", locationId),
        where("effectiveDate", "<=", effectiveAt),
        orderBy("effectiveDate", "desc"),
        limit(1)
      );
    } else if (clientProfileId) {
      qy = query(
        collection(db, "employeeRates"),
        where(idField, "==", employeeId),
        where("clientProfileId", "==", clientProfileId),
        where("effectiveDate", "<=", effectiveAt),
        orderBy("effectiveDate", "desc"),
        limit(1)
      );
    }
    const snap = await getDocs(qy);
    if (!snap.empty) return normalizeRateDoc(snap.docs[0].data() as any);

    // b) Scoped createdAt (legacy)
    let createdQy = query(
      collection(db, "employeeRates"),
      where(idField, "==", employeeId),
      where("createdAt", "<=", effectiveAt),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    if (locationId) {
      createdQy = query(
        collection(db, "employeeRates"),
        where(idField, "==", employeeId),
        where("locationId", "==", locationId),
        where("createdAt", "<=", effectiveAt),
        orderBy("createdAt", "desc"),
        limit(1)
      );
    } else if (clientProfileId) {
      createdQy = query(
        collection(db, "employeeRates"),
        where(idField, "==", employeeId),
        where("clientProfileId", "==", clientProfileId),
        where("createdAt", "<=", effectiveAt),
        orderBy("createdAt", "desc"),
        limit(1)
      );
    }
    const createdSnap = await getDocs(createdQy);
    if (!createdSnap.empty)
      return normalizeRateDoc(createdSnap.docs[0].data() as any);

    // c) Global by effectiveDate (only if scope provided)
    if (locationId || clientProfileId) {
      const globalQy = query(
        collection(db, "employeeRates"),
        where(idField, "==", employeeId),
        where("effectiveDate", "<=", effectiveAt),
        orderBy("effectiveDate", "desc"),
        limit(1)
      );
      const globalSnap = await getDocs(globalQy);
      if (!globalSnap.empty)
        return normalizeRateDoc(globalSnap.docs[0].data() as any);

      // d) Global by createdAt (legacy)
      const globalCreatedQy = query(
        collection(db, "employeeRates"),
        where(idField, "==", employeeId),
        where("createdAt", "<=", effectiveAt),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const globalCreatedSnap = await getDocs(globalCreatedQy);
      if (!globalCreatedSnap.empty)
        return normalizeRateDoc(globalCreatedSnap.docs[0].data() as any);
    }
  }

  return null;
}

// Helper function to check if timesheet exists for employee+job+date.
// Uses an index-friendly query on (employeeId, start range) and filters by jobId
// client-side to avoid requiring a 3-field composite index.
async function checkTimesheetExists(
  employeeId: string,
  jobId: string,
  serviceDate: Date
): Promise<boolean> {
  const db = getFirestoreInstance();

  const startOfDay = new Date(serviceDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(serviceDate);
  endOfDay.setHours(23, 59, 59, 999);

  const qy = query(
    collection(db, "timesheets"),
    where("employeeId", "==", employeeId),
    where("start", ">=", Timestamp.fromDate(startOfDay)),
    where("start", "<=", Timestamp.fromDate(endOfDay))
  );

  const snap = await getDocs(qy);
  let exists = false;
  snap.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    if (String(data?.jobId || "") === jobId) exists = true;
  });
  return exists;
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
    rateSnapshot: {
      type: "per_visit" | "hourly" | "monthly";
      amount: number;
      monthlyPayDay?: number;
    };
    units: number;
    hours?: number;
  }>;
  totalJobs: number;
  totalAssignments: number;
  missingRates: Array<{
    employeeId: string;
    jobId: string;
    locationId?: string;
    clientProfileId?: string;
    serviceDate?: Date;
  }>;
}> {
  if (!periodStart || !periodEnd) {
    throw new Error("periodStart and periodEnd are required");
  }

  const db = getFirestoreInstance();

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
    clientProfileId?: string;
    serviceDate?: Date;
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
        clientProfileId: assignment.clientProfileId,
        serviceDate: assignment.serviceDate,
      });
      continue;
    }

    // Skip monthly rates as they can't be converted to timesheets
    if (rateSnapshot.type === "monthly") {
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
      rateSnapshot: rateSnapshot as {
        type: "per_visit" | "hourly";
        amount: number;
      },
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

  const db = getFirestoreInstance();

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

  const functions = getCallableFunctions();

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

  const db = getFirestoreInstance();

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
  const db = getFirestoreInstance();

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
