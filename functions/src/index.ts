import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

type RunTotals = {
  byEmployee: Record<string, { hours: number; earnings: number; hourlyRate?: number }>;
  totalHours: number;
  totalEarnings: number;
};

type SummaryAggregate = {
  hoursTotal: number;
  grossPay: number;
  rateAtTime: number | null;
  timesheetRefs: string[];
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeTimestamp(value: any): admin.firestore.Timestamp | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) return value;
  if (typeof value.toDate === "function" && value.toDate() instanceof Date)
    return value as admin.firestore.Timestamp;
  if (value.seconds != null && value.nanoseconds != null) {
    return new admin.firestore.Timestamp(value.seconds, value.nanoseconds);
  }
  if (value instanceof Date) {
    return admin.firestore.Timestamp.fromDate(value);
  }
  if (typeof value === "number") {
    return admin.firestore.Timestamp.fromMillis(value);
  }
  return null;
}

async function resolveEmployeeProfileId(
  timesheet: FirebaseFirestore.DocumentData,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (
    typeof timesheet.employeeProfileId === "string" &&
    timesheet.employeeProfileId.trim() !== ""
  ) {
    return timesheet.employeeProfileId;
  }
  const employeeId =
    typeof timesheet.employeeId === "string" && timesheet.employeeId.trim() !== ""
      ? timesheet.employeeId
      : null;
  if (!employeeId) return null;
  if (cache.has(employeeId)) return cache.get(employeeId) || null;
  const snap = await db.collection("users").doc(employeeId).get();
  const data = snap.data() as { profileId?: string } | undefined;
  const profileId =
    typeof data?.profileId === "string" && data.profileId.trim() !== ""
      ? data.profileId
      : null;
  cache.set(employeeId, profileId);
  return profileId;
}

async function lookupEffectiveRate(
  employeeId: string,
  atTimestamp: admin.firestore.Timestamp,
  cache: Map<string, number>
): Promise<number> {
  const cacheKey = `${employeeId}|${atTimestamp.seconds}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) || 0;
  }
  let rate = 0;
  const effectiveQuery = await db
    .collection("employeeRates")
    .where("employeeId", "==", employeeId)
    .where("effectiveDate", "<=", atTimestamp)
    .orderBy("effectiveDate", "desc")
    .limit(1)
    .get();
  if (!effectiveQuery.empty) {
    const rateDoc = effectiveQuery.docs[0].data() as Record<string, unknown>;
    rate =
      Number((rateDoc as any).hourlyRate || (rateDoc as any).amount || 0) || 0;
  } else {
    const legacyQuery = await db
      .collection("employeeRates")
      .where("employeeId", "==", employeeId)
      .where("createdAt", "<=", atTimestamp)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    if (!legacyQuery.empty) {
      const legacyDoc = legacyQuery.docs[0].data() as Record<string, unknown>;
      rate =
        Number(
          (legacyDoc as any).hourlyRate || (legacyDoc as any).amount || 0
        ) || 0;
    }
  }
  cache.set(cacheKey, rate);
  return rate;
}

async function computeTimesheetCompensation(
  timesheet: FirebaseFirestore.DocumentData,
  rateCache: Map<string, number>
): Promise<{ hours: number; earnings: number; appliedRate: number | null }>
{
  const hours = Number(timesheet?.hours || 0) || 0;
  const units = Number(timesheet?.units || 1) || 1;
  let appliedRate: number | null = null;
  let earnings = 0;
  const snapshot = timesheet?.rateSnapshot as
    | { type?: string; amount?: number; hourlyRate?: number }
    | undefined;

  if (snapshot && typeof snapshot === "object") {
    const amount = Number(snapshot.amount || snapshot.hourlyRate || 0) || 0;
    if (snapshot.type === "per_visit") {
      appliedRate = amount;
      earnings = roundCurrency(amount * units);
    } else if (snapshot.type === "monthly") {
      appliedRate = amount;
      earnings = roundCurrency(amount);
    } else {
      appliedRate = amount;
      earnings = roundCurrency(hours * amount);
    }
  } else {
    let rate = Number(timesheet?.hourlyRate || 0) || 0;
    const employeeId =
      typeof timesheet?.employeeId === "string"
        ? timesheet.employeeId
        : null;
    const ts = normalizeTimestamp(timesheet?.start || timesheet?.clockInTime);
    if (!rate && employeeId && ts) {
      rate = await lookupEffectiveRate(employeeId, ts, rateCache);
    }
    appliedRate = rate || null;
    earnings = roundCurrency(hours * rate);
  }

  return {
    hours,
    earnings,
    appliedRate,
  };
}

async function computeRunArtifacts(
  runId: string,
  existingRunData?: FirebaseFirestore.DocumentData | null
): Promise<{
  runRef: FirebaseFirestore.DocumentReference;
  runData: FirebaseFirestore.DocumentData;
  totals: RunTotals;
  summaries: Map<string, SummaryAggregate>;
}> {
  const runRef = db.collection("payrollRuns").doc(runId);
  let runData = existingRunData || null;
  if (!runData) {
    const snap = await runRef.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError("not-found", "Payroll run not found");
    }
    runData = snap.data() || null;
  }
  if (!runData) {
    throw new functions.https.HttpsError("not-found", "Payroll run missing data");
  }

  const timesheetsSnapshot = await db
    .collection("timesheets")
    .where("approvedInRunId", "==", runId)
    .get();

  const totals: RunTotals = {
    byEmployee: {},
    totalHours: 0,
    totalEarnings: 0,
  };

  const summaries = new Map<string, SummaryAggregate>();
  const profileCache = new Map<string, string | null>();
  const rateCache = new Map<string, number>();

  for (const doc of timesheetsSnapshot.docs) {
    const data = doc.data();
    const employeeId =
      typeof data?.employeeId === "string" && data.employeeId.trim() !== ""
        ? data.employeeId
        : null;
    const profileId = await resolveEmployeeProfileId(data, profileCache);
    const { hours, earnings, appliedRate } = await computeTimesheetCompensation(
      data,
      rateCache
    );

    if (employeeId) {
      const current = totals.byEmployee[employeeId] || {
        hours: 0,
        earnings: 0,
        hourlyRate: appliedRate || undefined,
      };
      current.hours = roundCurrency(current.hours + hours);
      current.earnings = roundCurrency(current.earnings + earnings);
      if (!current.hourlyRate && appliedRate) current.hourlyRate = appliedRate;
      totals.byEmployee[employeeId] = current;
    }

    if (profileId) {
      const summary = summaries.get(profileId) || {
        hoursTotal: 0,
        grossPay: 0,
        rateAtTime: appliedRate || null,
        timesheetRefs: [] as string[],
      };
      summary.hoursTotal = roundCurrency(summary.hoursTotal + hours);
      summary.grossPay = roundCurrency(summary.grossPay + earnings);
      if (!summary.rateAtTime && appliedRate) summary.rateAtTime = appliedRate;
      summary.timesheetRefs.push(doc.id);
      summaries.set(profileId, summary);
    }

    totals.totalHours = roundCurrency(totals.totalHours + hours);
    totals.totalEarnings = roundCurrency(totals.totalEarnings + earnings);
  }

  return { runRef, runData, totals, summaries };
}

async function persistSummaries(
  runRef: FirebaseFirestore.DocumentReference,
  runData: FirebaseFirestore.DocumentData,
  summaries: Map<string, SummaryAggregate>
): Promise<void> {
  const periodStart = runData?.periodStart;
  const periodEnd = runData?.periodEnd;
  if (!periodStart || !periodEnd) {
    return;
  }
  const status = typeof runData?.status === "string" ? runData.status : "draft";
  const summariesRef = runRef.collection("summaries");
  const existing = await summariesRef.get();
  const keep = new Set<string>(summaries.keys());
  const batch = db.batch();
  let writes = 0;

  existing.forEach((doc) => {
    if (!keep.has(doc.id)) {
      batch.delete(doc.ref);
      writes += 1;
    }
  });

  summaries.forEach((value, profileId) => {
    batch.set(summariesRef.doc(profileId), {
      periodStart,
      periodEnd,
      hoursTotal: roundCurrency(value.hoursTotal),
      grossPay: roundCurrency(value.grossPay),
      rateAtTime: value.rateAtTime ?? null,
      status,
      timesheetRefs: value.timesheetRefs,
    });
    writes += 1;
  });

  if (writes > 0) {
    await batch.commit();
  }
}

async function refreshSummariesForRun(
  runId: string,
  existingRunData?: FirebaseFirestore.DocumentData | null
) {
  const { runRef, runData, summaries } = await computeRunArtifacts(
    runId,
    existingRunData
  );
  await persistSummaries(runRef, runData, summaries);
}

// Payroll Functions

// Helper to check whether the caller has finance/admin privileges.
async function userHasFinanceAdmin(
  context: functions.https.CallableContext
): Promise<boolean> {
  if (!context.auth) return false;

  // Prefer custom claims on the ID token
  const token = (context.auth.token || {}) as Record<string, unknown>;
  const claimAdmin = Boolean(token["admin"]);
  const claimOwner = Boolean(token["owner"]);
  const claimSuper = Boolean(token["super_admin"]);
  if (claimAdmin || claimOwner || claimSuper) return true;

  // Fallback to roles stored in the users document (supports legacy schemas)
  const userDoc = await db.collection("users").doc(context.auth.uid).get();
  if (!userDoc.exists) return false;
  const userData = userDoc.data() || {};
  const legacyFlags =
    Boolean((userData as any).admin) ||
    Boolean((userData as any).owner) ||
    Boolean((userData as any).super_admin);
  if (legacyFlags) return true;

  const role = ((userData as any).role as string) || "";
  if (role === "admin" || role === "owner" || role === "super_admin") {
    return true;
  }

  const roles = ((userData as any).roles as unknown as string[]) || [];
  if (
    Array.isArray(roles) &&
    roles.some((r) => ["admin", "owner", "super_admin"].includes(String(r)))
  ) {
    return true;
  }

  return false;
}

export const createPayrollRun = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    try {
      // Validate input
      const { periodStart, periodEnd } = data;
      if (!periodStart || !periodEnd) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "periodStart and periodEnd are required"
        );
      }

      // Validate user permissions
      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "User must be authenticated"
        );
      }

      const hasPermission = await userHasFinanceAdmin(context);
      if (!hasPermission) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Insufficient permissions"
        );
      }

      // Create payroll run document
      const payrollRunData = {
        periodStart: admin.firestore.Timestamp.fromMillis(periodStart),
        periodEnd: admin.firestore.Timestamp.fromMillis(periodEnd),
        status: "draft",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: context.auth!.uid,
        totalHours: 0,
        totalEarnings: 0,
        byEmployee: {},
      };

      const docRef = await db.collection("payrollRuns").add(payrollRunData);

      await refreshSummariesForRun(docRef.id, payrollRunData);

      return {
        id: docRef.id,
        success: true,
      };
    } catch (error) {
      console.error("createPayrollRun error:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to create payroll run"
      );
    }
  });

export const recalcPayrollRun = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    try {
      // Validate input
      const { runId } = data;
      if (!runId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "runId is required"
        );
      }

      // Validate user permissions
      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "User must be authenticated"
        );
      }

      const hasPermission = await userHasFinanceAdmin(context);
      if (!hasPermission) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Insufficient permissions"
        );
      }

      // Get the payroll run
      const runDoc = await db.collection("payrollRuns").doc(runId).get();
      if (!runDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Payroll run not found"
        );
      }

      const { runRef, runData, totals, summaries } = await computeRunArtifacts(
        runId,
        runDoc.data()
      );

      await runRef.update({
        totals,
        totalHours: totals.totalHours,
        totalEarnings: totals.totalEarnings,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid,
      });

      await persistSummaries(runRef, runData, summaries);

      return {
        success: true,
        totals,
      };
    } catch (error) {
      console.error("recalcPayrollRun error:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to recalculate payroll run"
      );
    }
  });

export const payrollScan = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    try {
      // Validate input
      const { periodStart, periodEnd } = data;
      if (!periodStart || !periodEnd) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "periodStart and periodEnd are required"
        );
      }

      // Validate user permissions
      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "User must be authenticated"
        );
      }

      const hasPermission = await userHasFinanceAdmin(context);
      if (!hasPermission) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Insufficient permissions"
        );
      }

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Query timesheets in the period
      const timesheetsSnapshot = await db
        .collection("timesheets")
        .where(
          "clockInTime",
          ">=",
          admin.firestore.Timestamp.fromDate(startDate)
        )
        .where("clockInTime", "<", admin.firestore.Timestamp.fromDate(endDate))
        .get();
      const timesheets: any[] = [];
      const missingRates: any[] = [];
      let totalHours = 0;
      let totalEarnings = 0;

      timesheetsSnapshot.forEach((doc) => {
        const timesheetData = doc.data();
        const timesheet = {
          id: doc.id,
          ...timesheetData,
        } as any;
        timesheets.push(timesheet);

        // Check for missing rates
        if (!timesheet.hourlyRate && timesheet.employeeProfileId) {
          missingRates.push({
            timesheetId: doc.id,
            employeeId: timesheet.employeeProfileId,
            date: timesheet.clockInTime,
          });
        }

        // Calculate totals
        if (timesheet.hours && timesheet.hourlyRate) {
          totalHours += timesheet.hours;
          totalEarnings += timesheet.hours * timesheet.hourlyRate;
        }
      });

      return {
        periodId: `${startDate.getTime()}-${endDate.getTime()}`,
        timesheetCount: timesheets.length,
        totalHours: Math.round(totalHours * 100) / 100,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        missingRates,
        timesheets: timesheets.map((t) => ({
          id: t.id,
          employeeProfileId: t.employeeProfileId,
          clockInTime: t.clockInTime,
          clockOutTime: t.clockOutTime,
          hours: t.hours,
          hourlyRate: t.hourlyRate,
        })),
      };
    } catch (error) {
      console.error("payrollScan error:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to scan payroll period"
      );
    }
  });

export const payrollGenerate = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    try {
      // Validate input
      const { periodStart, periodEnd, periodId } = data;
      if (!periodStart || !periodEnd) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "periodStart and periodEnd are required"
        );
      }

      // Validate user permissions
      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "User must be authenticated"
        );
      }

      const hasPermission = await userHasFinanceAdmin(context);
      if (!hasPermission) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Insufficient permissions"
        );
      }

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Query timesheets in the period
      const timesheetsSnapshot = await db
        .collection("timesheets")
        .where(
          "clockInTime",
          ">=",
          admin.firestore.Timestamp.fromDate(startDate)
        )
        .where("clockInTime", "<", admin.firestore.Timestamp.fromDate(endDate))
        .get();

      let created = 0;
      const batch = db.batch();

      timesheetsSnapshot.forEach((doc) => {
        const timesheetData = doc.data();
        const timesheet = {
          id: doc.id,
          ...timesheetData,
        } as any;

        // Create payroll run for each employee if it doesn't exist
        if (
          timesheet.employeeProfileId &&
          timesheet.hours &&
          timesheet.hourlyRate
        ) {
          const payrollRunRef = db.collection("payrollRuns").doc();
          const payrollRunData = {
            periodStart: admin.firestore.Timestamp.fromDate(startDate),
            periodEnd: admin.firestore.Timestamp.fromDate(endDate),
            periodId: periodId || `${startDate.getTime()}-${endDate.getTime()}`,
            status: "draft",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: context.auth!.uid,
            employeeProfileId: timesheet.employeeProfileId,
            hours: timesheet.hours,
            hourlyRate: timesheet.hourlyRate,
            earnings: timesheet.hours * timesheet.hourlyRate,
            timesheetId: timesheet.id,
          };

          batch.set(payrollRunRef, payrollRunData);
          created++;
        }
      });

      await batch.commit();

      return {
        success: true,
        created,
      };
    } catch (error) {
      console.error("payrollGenerate error:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to generate payroll runs"
      );
    }
  });

export const approveTimesheetsInRun = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    try {
      // Validate input
      const { runId, timesheetIds } = data;
      if (!runId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "runId is required"
        );
      }
      if (!Array.isArray(timesheetIds) || timesheetIds.length === 0) {
        return { count: 0 };
      }

      // Validate user permissions
      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "User must be authenticated"
        );
      }

      const hasPermission = await userHasFinanceAdmin(context);
      if (!hasPermission) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Insufficient permissions"
        );
      }

      // Verify payroll run exists
      const runDoc = await db.collection("payrollRuns").doc(runId).get();
      if (!runDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Payroll run not found"
        );
      }

      // Batch update timesheets
      const batch = db.batch();
      let count = 0;

      for (const id of timesheetIds) {
        if (!id) continue;
        const timesheetRef = db.collection("timesheets").doc(id);
        batch.update(timesheetRef, {
          approvedInRunId: runId,
          adminApproved: true, // Automatically set when approving into run
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        count += 1;
      }

      await batch.commit();

      await refreshSummariesForRun(runId, runDoc.data());

      return { count };
    } catch (error) {
      console.error("approveTimesheetsInRun error:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to approve timesheets"
      );
    }
  });

export const backfillRateSnapshots = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    try {
      // Validate input
      const { startDate, endDate } = data;
      if (!startDate || !endDate) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "startDate and endDate are required"
        );
      }

      // Validate user permissions
      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "User must be authenticated"
        );
      }

      const hasPermission = await userHasFinanceAdmin(context);
      if (!hasPermission) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Insufficient permissions"
        );
      }

      const startTimestamp = admin.firestore.Timestamp.fromMillis(startDate);
      const endTimestamp = admin.firestore.Timestamp.fromMillis(endDate);

      // Query timesheets in the date range that are missing rateSnapshot
      const timesheetsSnapshot = await db
        .collection("timesheets")
        .where("start", ">=", startTimestamp)
        .where("start", "<", endTimestamp)
        .get();

      const batch = db.batch();
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      const rateCache = new Map<string, any>();

      for (const doc of timesheetsSnapshot.docs) {
        const timesheet = doc.data();

        // Skip if timesheet already has rateSnapshot
        if (timesheet.rateSnapshot) {
          skipped++;
          continue;
        }

        const employeeId = timesheet.employeeId;
        const startTime = timesheet.start;

        if (!employeeId || !startTime) {
          errors++;
          continue;
        }

        try {
          // Get effective rate for employee at timesheet start time
          const cacheKey = `${employeeId}|${startTime.seconds || "0"}`;

          let rateSnapshot = rateCache.get(cacheKey);

          if (!rateSnapshot) {
            // Query for the most recent rate effective at or before the timesheet start
            const rateQuery = await db
              .collection("employeeRates")
              .where("employeeId", "==", employeeId)
              .where("effectiveDate", "<=", startTime)
              .orderBy("effectiveDate", "desc")
              .limit(1)
              .get();

            if (rateQuery.empty) {
              // No rate found, skip this timesheet
              skipped++;
              continue;
            }

            const rateDoc = rateQuery.docs[0].data();

            // Determine rate type and create snapshot
            if (rateDoc.rateType === "per_visit" && rateDoc.perVisitRate) {
              rateSnapshot = {
                type: "per_visit",
                amount: Number(rateDoc.perVisitRate) || 0,
              };
            } else if (rateDoc.rateType === "hourly" && rateDoc.hourlyRate) {
              rateSnapshot = {
                type: "hourly",
                amount: Number(rateDoc.hourlyRate) || 0,
              };
            } else if (rateDoc.hourlyRate) {
              // Legacy format - assume hourly
              rateSnapshot = {
                type: "hourly",
                amount: Number(rateDoc.hourlyRate) || 0,
              };
            } else {
              // No valid rate found
              skipped++;
              continue;
            }

            rateCache.set(cacheKey, rateSnapshot);
          }

          // Update timesheet with rate snapshot
          const timesheetRef = db.collection("timesheets").doc(doc.id);
          batch.update(timesheetRef, {
            rateSnapshot,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
            backfilledBy: context.auth!.uid,
          });

          updated++;
        } catch (error) {
          console.error(`Error processing timesheet ${doc.id}:`, error);
          errors++;
        }
      }

      // Commit all updates
      await batch.commit();

      return {
        success: true,
        updated,
        skipped,
        errors,
        total: timesheetsSnapshot.size,
      };
    } catch (error) {
      console.error("backfillRateSnapshots error:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to backfill rate snapshots"
      );
    }
  });

// RBAC: role management callable and mirror trigger
export { setUserRole, onUserRoleMirror } from "./claims";
export { grantSuperAdminByEmail } from "./bootstrap";
