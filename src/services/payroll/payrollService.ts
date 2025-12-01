import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';

import { getFirestoreInstance } from '@/services/firebase';
import type {
  PayrollEntry,
  PayrollEntryCategory,
  PayrollEntryOverride,
  PayrollEntryType,
  PayrollPeriod,
  PayrollPeriodSummary,
  PayrollPeriodTotals,
} from '@/types/payroll';
import type { SemiMonthlyPeriod } from '@/services/payroll/semiMonthlyPeriods';
import {
  getSemiMonthlyPeriodForWorkDate,
  getSemiMonthlyPeriodForPayDate,
  semiMonthlyPeriodId,
  semiMonthlyPeriodToFirestorePayload,
} from '@/services/payroll/semiMonthlyPeriods';

function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned as T;
}

type CreatePayrollEntryInput = {
  periodId: string;
  employeeId: string;
  jobId?: string;
  type: PayrollEntryType;
  category: PayrollEntryCategory;
  amount: number;
  hours?: number;
  units?: number;
  rateSnapshot?: {
    type: 'per_visit' | 'hourly' | 'monthly';
    amount: number;
  };
  description?: string;
  jobCompletedAt?: Date | Timestamp | null;
  override?: PayrollEntryOverride;
  source?: string;
};

type JobAssignment = {
  employeeId: string;
  jobId: string;
  serviceDate: Date;
  locationId?: string | null;
  clientProfileId?: string | null;
  durationMinutes?: number | null;
};

const EARNING_CATEGORIES = new Set<PayrollEntryCategory>(['per_visit', 'hourly', 'monthly']);

const DEDUCTION_CATEGORIES = new Set<PayrollEntryCategory>([
  'missed_day',
  'uniform',
  'supplies',
  'advance',
  'manual_adjustment',
  'other',
]);

const ZERO_TOTALS: PayrollPeriodTotals = {
  gross: 0,
  deductions: 0,
  net: 0,
};

const PAYROLL_RELEVANT_STATUSES = new Set([
  'completed',
  'pending approval',
  'in progress',
  'started',
]);

type FirestorePayrollPeriod = Omit<PayrollPeriod, 'id'>;
type FirestorePayrollEntry = Omit<PayrollEntry, 'id'>;
type JobData = Record<string, any> & { id: string };

// Cache for owner lookups to avoid repeated reads per session
const OWNER_ROLE_CACHE = new Map<string, boolean>();

async function isOwnerEmployeeId(employeeId: string): Promise<boolean> {
  if (!employeeId) return false;
  if (OWNER_ROLE_CACHE.has(employeeId)) {
    return OWNER_ROLE_CACHE.get(employeeId) as boolean;
  }
  const db = getFirestoreInstance();
  const userRef = doc(db, 'users', employeeId);
  const snap = await getDoc(userRef);
  const isOwnerRole = snap.exists() && (snap.data() as any)?.role === 'owner';
  OWNER_ROLE_CACHE.set(employeeId, isOwnerRole);
  return isOwnerRole;
}

function storedPeriodToSemi(period: PayrollPeriod): SemiMonthlyPeriod {
  const toDate = (value: Timestamp | Date | string) =>
    value instanceof Timestamp ? value.toDate() : value instanceof Date ? value : new Date(value);
  return {
    periodId: period.id,
    workPeriodStart: toDate(period.periodStart as Timestamp),
    workPeriodEnd: toDate(period.periodEnd as Timestamp),
    payDate: toDate(period.payDate as Timestamp),
  };
}

async function fetchJobsForPeriod(period: SemiMonthlyPeriod): Promise<JobData[]> {
  const db = getFirestoreInstance();
  const jobsSnap = await getDocs(
    query(
      collection(db, 'serviceHistory'),
      where('serviceDate', '>=', Timestamp.fromDate(period.workPeriodStart)),
      where('serviceDate', '<=', Timestamp.fromDate(period.workPeriodEnd)),
    ),
  );

  return jobsSnap.docs.map((docSnap) => ({
    ...(docSnap.data() as Record<string, any>),
    id: docSnap.id,
  }));
}

function normalizeAmount(type: PayrollEntryType, amount: number) {
  const abs = Math.abs(amount);
  if (type === 'earning') {
    return {
      storedAmount: abs,
      grossDelta: abs,
      deductionsDelta: 0,
      netDelta: abs,
    };
  }
  const deduction = abs;
  return {
    storedAmount: -deduction,
    grossDelta: 0,
    deductionsDelta: deduction,
    netDelta: -deduction,
  };
}

async function ensurePayrollPeriod(period: SemiMonthlyPeriod) {
  const db = getFirestoreInstance();
  const periodRef = doc(db, 'payrollPeriods', period.periodId);

  // First check if the period already exists (read-only operation)
  try {
    const existingSnap = await getDoc(periodRef);
    if (existingSnap.exists()) {
      // Period already exists, nothing to do
      return;
    }
  } catch (readError: unknown) {
    // If we can't read, we might not have permissions at all - log and continue
    // The transaction below will also fail, but we'll handle it gracefully
    console.warn('Could not read payroll period, attempting to create:', readError);
  }

  // Try to create the period using a transaction
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(periodRef);
      if (!snap.exists()) {
        transaction.set(periodRef, semiMonthlyPeriodToFirestorePayload(period));
      }
    });
  } catch (error: unknown) {
    // Handle permission errors gracefully
    const isPermissionError =
      error instanceof Error &&
      (error.message.includes('permission') ||
        error.message.includes('PERMISSION_DENIED') ||
        (error as any).code === 'permission-denied');

    if (isPermissionError) {
      // Try one more read to see if the period exists (might have been created by someone else)
      try {
        const retrySnap = await getDoc(periodRef);
        if (retrySnap.exists()) {
          // Period exists, we just couldn't create it - that's fine
          console.info('Payroll period exists but user lacks create permission (read-only access)');
          return;
        }
      } catch {
        // Can't read either - user doesn't have permissions to this collection
      }

      // Period doesn't exist and user can't create it
      throw new Error(
        'You do not have permission to create payroll periods. Please contact an administrator.',
      );
    }

    // Re-throw non-permission errors
    throw error;
  }
}

export async function ensurePayrollPeriodExists(period: SemiMonthlyPeriod) {
  await ensurePayrollPeriod(period);
}

export async function getPayrollPeriodById(periodId: string): Promise<PayrollPeriod | null> {
  const db = getFirestoreInstance();
  const periodRef = doc(db, 'payrollPeriods', periodId);
  const snap = await getDoc(periodRef);
  if (!snap.exists()) return null;
  const data = snap.data() as FirestorePayrollPeriod;
  return { id: snap.id, ...data };
}

export async function listPayrollPeriods(limit = 20): Promise<PayrollPeriod[]> {
  const db = getFirestoreInstance();
  const q = query(collection(db, 'payrollPeriods'), orderBy('payDate', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.slice(0, limit).map((docSnap) => {
    const data = docSnap.data() as FirestorePayrollPeriod;
    return {
      id: docSnap.id,
      ...data,
    };
  });
}

export async function addPayrollEntry(input: CreatePayrollEntryInput): Promise<string> {
  if (!EARNING_CATEGORIES.has(input.category) && input.type === 'earning') {
    throw new Error(`Invalid earning category "${input.category}"`);
  }
  if (!DEDUCTION_CATEGORIES.has(input.category) && input.type === 'deduction') {
    throw new Error(`Invalid deduction category "${input.category}"`);
  }

  const db = getFirestoreInstance();
  const periodRef = doc(db, 'payrollPeriods', input.periodId);
  const entriesRef = collection(db, 'payrollEntries');

  const { storedAmount, grossDelta, deductionsDelta, netDelta } = normalizeAmount(
    input.type,
    input.amount,
  );

  const entryPayloadRaw: Omit<PayrollEntry, 'id'> = {
    periodId: input.periodId,
    employeeId: input.employeeId,
    jobId: input.jobId,
    type: input.type,
    category: input.category,
    amount: storedAmount,
    hours:
      typeof input.hours === 'number' && Number.isFinite(input.hours) ? input.hours : undefined,
    units:
      typeof input.units === 'number' && Number.isFinite(input.units) ? input.units : undefined,
    rateSnapshot: input.rateSnapshot,
    description: input.description,
    jobCompletedAt: input.jobCompletedAt
      ? input.jobCompletedAt instanceof Timestamp
        ? input.jobCompletedAt
        : Timestamp.fromDate(input.jobCompletedAt)
      : undefined,
    source: input.source,
    createdAt: Timestamp.now(),
    override: input.override,
  };

  // Firestore forbids undefined field values. Strip them before writing.
  const entryPayload = omitUndefined(entryPayloadRaw);

  const entryId = await runTransaction(db, async (transaction) => {
    const periodSnap = await transaction.get(periodRef);
    if (!periodSnap.exists()) {
      throw new Error(
        `Payroll period ${input.periodId} does not exist. Call ensurePayrollPeriod first.`,
      );
    }
    const periodData = periodSnap.data() as PayrollPeriod;
    const totals = periodData?.totals ? { ...periodData.totals } : { ...ZERO_TOTALS };

    totals.gross = Number((totals.gross + grossDelta).toFixed(2));
    totals.deductions = Number((totals.deductions + deductionsDelta).toFixed(2));
    totals.net = Number((totals.net + netDelta).toFixed(2));

    transaction.update(periodRef, {
      totals,
      updatedAt: serverTimestamp(),
    });

    const newEntryRef = doc(entriesRef);
    transaction.set(newEntryRef, entryPayload);
    return newEntryRef.id;
  });

  return entryId;
}

export async function recalcPayrollPeriodTotals(periodId: string) {
  const db = getFirestoreInstance();
  const entriesSnap = await getDocs(
    query(collection(db, 'payrollEntries'), where('periodId', '==', periodId)),
  );

  let gross = 0;
  let deductions = 0;

  entriesSnap.forEach((docSnap) => {
    const entry = docSnap.data() as PayrollEntry;
    if (entry.type === 'earning') {
      gross += entry.amount;
    } else {
      deductions += Math.abs(entry.amount);
    }
  });

  const totals: PayrollPeriodTotals = {
    gross: Number(gross.toFixed(2)),
    deductions: Number(deductions.toFixed(2)),
    net: Number((gross - deductions).toFixed(2)),
  };

  await runTransaction(db, async (transaction) => {
    const periodRef = doc(db, 'payrollPeriods', periodId);
    const snap = await transaction.get(periodRef);
    if (!snap.exists()) return;
    transaction.update(periodRef, {
      totals,
      updatedAt: serverTimestamp(),
    });
  });

  return totals;
}

export function listenToPayrollEntries(
  periodId: string,
  callback: (entries: PayrollEntry[]) => void,
): Unsubscribe {
  const db = getFirestoreInstance();
  let unsub: Unsubscribe | null = null;

  const subscribe = (withOrder: boolean) => {
    const constraints: QueryConstraint[] = [where('periodId', '==', periodId)];
    if (withOrder) constraints.push(orderBy('createdAt', 'asc'));
    const q = query(collection(db, 'payrollEntries'), ...constraints);
    unsub = onSnapshot(
      q,
      (snap) => {
        const entries = snap.docs.map((docSnap) => {
          const data = docSnap.data() as FirestorePayrollEntry;
          return { id: docSnap.id, ...data };
        });
        callback(entries);
      },
      (error) => {
        // If index is missing for the ordered query, fall back to unordered
        const code = (error as any)?.code || (error as any)?.name;
        if (withOrder && (code === 'failed-precondition' || code === 'FAILED_PRECONDITION')) {
          if (unsub) unsub();
          // Retry without order to avoid blocking the UI; entries will be unsorted.
          subscribe(false);
          return;
        }
        console.warn('listenToPayrollEntries error:', code || error);
        callback([]);
      },
    );
  };

  subscribe(true);
  return () => {
    if (unsub) unsub();
  };
}

export function listenToPayrollPeriod(
  periodId: string,
  callback: (period: PayrollPeriod | null) => void,
): Unsubscribe {
  const db = getFirestoreInstance();
  const periodRef = doc(db, 'payrollPeriods', periodId);
  return onSnapshot(
    periodRef,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      const data = snap.data() as FirestorePayrollPeriod;
      callback({ id: snap.id, ...data });
    },
    (error) => {
      // Avoid crashing the UI on permission issues; surface null state instead.
      console.warn('listenToPayrollPeriod error:', (error as any)?.code || error);
      callback(null);
    },
  );
}

function extractAssignedEmployees(jobData: Record<string, any>): JobAssignment[] {
  const assignedEmployees: JobAssignment[] = [];
  const jobId = jobData.id as string;

  const serviceDateRaw = jobData.serviceDate;
  const serviceDate =
    serviceDateRaw instanceof Timestamp ? serviceDateRaw.toDate() : new Date(serviceDateRaw);

  const assignedList: string[] = Array.isArray(jobData.assignedEmployees)
    ? jobData.assignedEmployees
    : Array.isArray(jobData.employeeAssignments)
    ? jobData.employeeAssignments
        .map((assignment: Record<string, any>) => assignment?.uid)
        .filter(Boolean)
    : [];

  for (const employeeId of assignedList) {
    assignedEmployees.push({
      employeeId,
      jobId,
      serviceDate,
      locationId: jobData.locationId ?? null,
      clientProfileId: jobData.clientProfileId ?? null,
      durationMinutes:
        typeof jobData.duration === 'number'
          ? jobData.duration
          : typeof jobData.estimatedDuration === 'number'
          ? jobData.estimatedDuration
          : null,
    });
  }
  return assignedEmployees;
}

function resolveJobStatus(jobData: Record<string, any>): string {
  if (typeof jobData.status === 'string' && jobData.status.length) {
    return jobData.status;
  }
  if (typeof jobData.statusLegacy === 'string' && jobData.statusLegacy.length) {
    return jobData.statusLegacy;
  }
  return '';
}

async function getEffectiveRateSnapshot(
  employeeId: string,
  effectiveAt: Timestamp,
  locationId?: string | null,
  clientProfileId?: string | null,
) {
  const db = getFirestoreInstance();
  const idCandidates: Array<'employeeId' | 'employeeProfileId'> = [
    'employeeId',
    'employeeProfileId',
  ];

  const queryByScope = async (
    orderField: 'effectiveDate' | 'createdAt',
    idField: 'employeeId' | 'employeeProfileId',
    scopeField?: 'locationId' | 'clientProfileId',
  ) => {
    const constraints = [
      where(idField, '==', employeeId),
      orderField === 'effectiveDate'
        ? where(orderField, '<=', effectiveAt)
        : where(orderField, '<=', effectiveAt),
      orderBy(orderField, 'desc'),
    ];
    if (scopeField === 'locationId' && locationId) {
      constraints.splice(1, 0, where('locationId', '==', locationId));
    }
    if (scopeField === 'clientProfileId' && clientProfileId) {
      constraints.splice(1, 0, where('clientProfileId', '==', clientProfileId));
    }
    const snap = await getDocs(query(collection(db, 'employeeRates'), ...constraints, limit(1)));
    if (!snap.empty) {
      return snap.docs[0].data() as Record<string, any>;
    }
    return null;
  };

  for (const idField of idCandidates) {
    if (locationId) {
      const scoped = await queryByScope('effectiveDate', idField, 'locationId');
      if (scoped) return normalizeRateDocument(scoped);
    }
    if (clientProfileId) {
      const scoped = await queryByScope('effectiveDate', idField, 'clientProfileId');
      if (scoped) return normalizeRateDocument(scoped);
    }
    const global = await queryByScope('effectiveDate', idField);
    if (global) return normalizeRateDocument(global);
  }

  // Legacy fallback using createdAt
  for (const idField of idCandidates) {
    if (locationId) {
      const scoped = await queryByScope('createdAt', idField, 'locationId');
      if (scoped) return normalizeRateDocument(scoped);
    }
    if (clientProfileId) {
      const scoped = await queryByScope('createdAt', idField, 'clientProfileId');
      if (scoped) return normalizeRateDocument(scoped);
    }
    const global = await queryByScope('createdAt', idField);
    if (global) return normalizeRateDocument(global);
  }

  return null;
}

// Minimum expected rates to catch data issues (e.g., accidental $1 entries)
const MIN_EXPECTED_RATES = {
  per_visit: 5, // Minimum $5 per visit
  hourly: 5, // Minimum $5/hour
  monthly: 100, // Minimum $100/month
};

function normalizeRateDocument(docData: Record<string, any>) {
  const type: 'per_visit' | 'hourly' | 'monthly' =
    docData.rateType === 'per_visit' || docData.rateType === 'hourly' || docData.rateType === 'monthly'
      ? docData.rateType
      : typeof docData.monthlyRate === 'number'
      ? 'monthly'
      : typeof docData.hourlyRate === 'number'
      ? 'hourly'
      : 'per_visit';

  // Check all possible field names for the amount
  const amount =
    typeof docData.amount === 'number'
      ? docData.amount
      : typeof docData.rate === 'number'
      ? docData.rate
      : typeof docData.perVisitRate === 'number'
      ? docData.perVisitRate
      : typeof docData.hourlyRate === 'number'
      ? docData.hourlyRate
      : typeof docData.monthlyRate === 'number'
      ? docData.monthlyRate
      : 0;

  const finalAmount = Number(amount);

  // Warn if rate is suspiciously low (likely a data entry error)
  const minExpected = MIN_EXPECTED_RATES[type] || 5;
  if (finalAmount > 0 && finalAmount < minExpected) {
    console.warn(
      `[PayrollService] Suspiciously low ${type} rate detected: $${finalAmount}. ` +
        `Expected minimum: $${minExpected}. Rate doc ID: ${docData.id || 'unknown'}. ` +
        `Employee: ${docData.employeeId || docData.employeeProfileId || 'unknown'}`,
    );
  }

  return {
    type,
    amount: finalAmount,
  } as { type: 'per_visit' | 'hourly' | 'monthly'; amount: number };
}

function calculateEarningForAssignment(
  rateSnapshot: { type: 'per_visit' | 'hourly' | 'monthly'; amount: number },
  assignment: JobAssignment,
) {
  if (rateSnapshot.type === 'per_visit') {
    return {
      amount: Number(rateSnapshot.amount.toFixed(2)),
      hours: undefined,
      units: 1,
    };
  }

  if (rateSnapshot.type === 'hourly') {
    const minutes = assignment.durationMinutes ?? 0;
    const hours = minutes > 0 ? Number((minutes / 60).toFixed(2)) : 0;
    const amount = Number((hours * rateSnapshot.amount).toFixed(2));
    return {
      amount,
      hours,
      units: undefined,
    };
  }

  // Monthly salaries are handled separately (base earnings + deductions)
  return {
    amount: 0,
    hours: undefined,
    units: undefined,
  };
}

async function findMissingRateEmployeeIdsForJob(job: JobData): Promise<string[]> {
  const assignments = extractAssignedEmployees(job);
  if (!assignments.length) return [];

  const missing = new Set<string>();
  const rateCache = new Map<string, boolean>();

  for (const assignment of assignments) {
    // Skip owner from payroll rate validation; owner may be assigned for compliance only.
    if (await isOwnerEmployeeId(assignment.employeeId)) {
      continue;
    }

    const cacheKey = [
      assignment.employeeId,
      assignment.serviceDate.getTime(),
      assignment.locationId ?? '',
      assignment.clientProfileId ?? '',
    ].join('|');

    if (rateCache.has(cacheKey)) {
      if (!rateCache.get(cacheKey)) {
        missing.add(assignment.employeeId);
      }
      continue;
    }

    const rateSnapshot = await getEffectiveRateSnapshot(
      assignment.employeeId,
      Timestamp.fromDate(assignment.serviceDate),
      assignment.locationId ?? undefined,
      assignment.clientProfileId ?? undefined,
    );

    const hasRate = !!rateSnapshot;
    rateCache.set(cacheKey, hasRate);
    if (!hasRate) {
      missing.add(assignment.employeeId);
    }
  }

  return Array.from(missing);
}

export async function createPayrollEntriesForJob(jobId: string) {
  const db = getFirestoreInstance();
  const jobRef = doc(db, 'serviceHistory', jobId);
  const jobSnap = await getDoc(jobRef);
  if (!jobSnap.exists()) {
    throw new Error(`Job ${jobId} not found`);
  }

  const jobData: JobData = {
    ...(jobSnap.data() as Record<string, any>),
    id: jobId,
  };
  const assignments = extractAssignedEmployees(jobData);
  if (!assignments.length) {
    return { created: 0 };
  }

  const period = getSemiMonthlyPeriodForWorkDate(assignments[0].serviceDate);
  await ensurePayrollPeriod(period);

  const existingEarningKeys = new Set<string>();
  const existingEntriesSnap = await getDocs(
    query(collection(db, 'payrollEntries'), where('jobId', '==', jobId)),
  );
  existingEntriesSnap.forEach((docSnap) => {
    const existing = docSnap.data() as PayrollEntry;
    if (existing.type === 'earning') {
      existingEarningKeys.add(`${existing.employeeId}:${existing.category}`);
    }
  });

  let created = 0;
  let monthlyAssignmentsDetected = false;
  for (const assignment of assignments) {
    // Skip owner from auto payroll entries; owner pay is handled manually.
    if (await isOwnerEmployeeId(assignment.employeeId)) {
      continue;
    }

    const rateSnapshot = await getEffectiveRateSnapshot(
      assignment.employeeId,
      Timestamp.fromDate(assignment.serviceDate),
      assignment.locationId ?? undefined,
      assignment.clientProfileId ?? undefined,
    );

    if (!rateSnapshot) continue;

    const { amount, hours, units } = calculateEarningForAssignment(rateSnapshot, assignment);

    if (rateSnapshot.type === 'monthly') {
      // Monthly earnings recorded during period processing, but attendance matters.
      // Flag it but don't call syncMonthlyMissedWorkDeductions here - let the caller handle it once.
      monthlyAssignmentsDetected = true;
      continue;
    }

    const earningKey = `${assignment.employeeId}:${rateSnapshot.type}`;
    if (existingEarningKeys.has(earningKey)) continue;

    if (amount <= 0) continue;

    const locationLabel =
      typeof jobData.locationName === 'string' && jobData.locationName.length
        ? jobData.locationName
        : typeof jobData.locationId === 'string'
        ? jobData.locationId
        : undefined;

    await addPayrollEntry({
      periodId: period.periodId,
      employeeId: assignment.employeeId,
      jobId: assignment.jobId,
      type: 'earning',
      category: rateSnapshot.type,
      amount,
      hours,
      units,
      rateSnapshot,
      jobCompletedAt:
        jobData.completedAt instanceof Timestamp ? jobData.completedAt : assignment.serviceDate,
      description: locationLabel ? `Job completed at ${locationLabel}` : undefined,
    });
    existingEarningKeys.add(earningKey);
    created += 1;
  }

  // Only recalc if we actually created per-visit/hourly entries.
  // Monthly sync is handled by the caller (syncPayrollEntriesForPeriod) once for the entire period.
  if (created > 0) {
    await recalcPayrollPeriodTotals(period.periodId);
  }

  return { created, periodId: period.periodId, hasMonthlyAssignments: monthlyAssignmentsDetected };
}

export async function validateJobPayrollReadiness(jobId: string): Promise<string[]> {
  const db = getFirestoreInstance();
  const jobRef = doc(db, 'serviceHistory', jobId);
  const jobSnap = await getDoc(jobRef);
  if (!jobSnap.exists()) {
    throw new Error(`Job ${jobId} not found`);
  }
  const jobData: JobData = {
    ...(jobSnap.data() as Record<string, any>),
    id: jobId,
  };
  return findMissingRateEmployeeIdsForJob(jobData);
}

export async function syncPayrollEntriesForPeriod(periodId: string): Promise<{
  processedJobs: number;
  createdEntries: number;
  skippedJobs: number;
  missingRateEmployeeIds: string[];
  errors: string[];
}> {
  const period = await getPayrollPeriodById(periodId);
  let workingPeriod: SemiMonthlyPeriod;

  if (period) {
    workingPeriod = storedPeriodToSemi(period);
  } else {
    // Parse YYYY-MM-DD as a LOCAL date to avoid timezone shifts that change the calendar day.
    const [y, m, d] = String(periodId)
      .split('-')
      .map((x) => Number(x));
    const payDate =
      Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
        ? new Date(y, m - 1, d, 12, 0, 0, 0) // Midday local to guarantee date-of-month
        : new Date(`${periodId}T00:00:00`);
    if (Number.isNaN(payDate.getTime())) {
      throw new Error(`Payroll period ${periodId} not found`);
    }
    workingPeriod = getSemiMonthlyPeriodForPayDate(payDate);
    await ensurePayrollPeriod(workingPeriod);
  }

  const jobs = await fetchJobsForPeriod(workingPeriod);
  let processedJobs = 0;
  let createdEntries = 0;
  let skippedJobs = 0;
  let hasAnyMonthlyAssignments = false;
  const missingRateEmployeeIds = new Set<string>();
  const errors: string[] = [];

  for (const job of jobs) {
    const status = resolveJobStatus(job).toLowerCase();
    if (status !== 'completed') continue;

    processedJobs += 1;
    const missingForJob = await findMissingRateEmployeeIdsForJob(job);
    if (missingForJob.length) {
      missingForJob.forEach((id) => missingRateEmployeeIds.add(id));
      skippedJobs += 1;
      continue;
    }

    try {
      const result = await createPayrollEntriesForJob(job.id);
      createdEntries += result.created;
      if (result.hasMonthlyAssignments) {
        hasAnyMonthlyAssignments = true;
      }
    } catch (error) {
      console.error('Failed to backfill payroll for job', job.id, error);
      errors.push(job.id);
    }
  }

  // Sync monthly base earnings and missed-day deductions ONCE for the entire period
  // (not per-job, which was causing duplicate entries and corrupted totals)
  if (hasAnyMonthlyAssignments) {
    await syncMonthlyMissedWorkDeductions(workingPeriod);
  }

  // Final recalc to ensure totals are accurate
  await recalcPayrollPeriodTotals(workingPeriod.periodId);

  return {
    processedJobs,
    createdEntries,
    skippedJobs,
    missingRateEmployeeIds: Array.from(missingRateEmployeeIds),
    errors,
  };
}

export async function findMissingRateEmployeeIdsForPeriod(
  period: SemiMonthlyPeriod,
): Promise<string[]> {
  const jobs = await fetchJobsForPeriod(period);
  const missing = new Set<string>();

  for (const job of jobs) {
    const status = resolveJobStatus(job).toLowerCase();
    if (!PAYROLL_RELEVANT_STATUSES.has(status)) continue;
    const missingForJob = await findMissingRateEmployeeIdsForJob(job);
    missingForJob.forEach((id) => missing.add(id));
  }

  return Array.from(missing);
}

export async function syncMonthlyMissedWorkDeductions(
  period: SemiMonthlyPeriod,
): Promise<{ created: number; removed: number }> {
  const db = getFirestoreInstance();

  const existingAutoMissedSnap = await getDocs(
    query(
      collection(db, 'payrollEntries'),
      where('periodId', '==', period.periodId),
      where('source', '==', 'auto:missed_day'),
    ),
  );

  const existingAutoBaseSnap = await getDocs(
    query(
      collection(db, 'payrollEntries'),
      where('periodId', '==', period.periodId),
      where('source', '==', 'auto:monthly_base'),
    ),
  );

  let removed = 0;
  const cleanupBatch = writeBatch(db);

  if (!existingAutoMissedSnap.empty) {
    existingAutoMissedSnap.forEach((docSnap) => {
      cleanupBatch.delete(docSnap.ref);
      removed += 1;
    });
  }

  if (!existingAutoBaseSnap.empty) {
    existingAutoBaseSnap.forEach((docSnap) => {
      cleanupBatch.delete(docSnap.ref);
      removed += 1;
    });
  }

  if (removed > 0) {
    await cleanupBatch.commit();
    await recalcPayrollPeriodTotals(period.periodId);
  }

  const jobsSnap = await getDocs(
    query(
      collection(db, 'serviceHistory'),
      where('serviceDate', '>=', Timestamp.fromDate(period.workPeriodStart)),
      where('serviceDate', '<=', Timestamp.fromDate(period.workPeriodEnd)),
    ),
  );

  type Attendance = {
    monthlyAmount: number;
    scheduledDates: Set<string>;
    completedDates: Set<string>;
  };

  const attendanceByEmployee = new Map<string, Attendance>();

  for (const docSnap of jobsSnap.docs) {
    const data = docSnap.data() as Record<string, any>;
    const job: JobData = {
      ...data,
      id: docSnap.id,
    };
    const status = resolveJobStatus(job).toLowerCase();
    const assignments = extractAssignedEmployees(job);
    if (!assignments.length) continue;

    for (const assignment of assignments) {
      // Skip owner from monthly salary and missed-day deductions; owner is off automated payroll.
      if (await isOwnerEmployeeId(assignment.employeeId)) {
        continue;
      }

      const rateSnapshot = await getEffectiveRateSnapshot(
        assignment.employeeId,
        Timestamp.fromDate(assignment.serviceDate),
        assignment.locationId ?? undefined,
        assignment.clientProfileId ?? undefined,
      );
      if (!rateSnapshot || rateSnapshot.type !== 'monthly') continue;

      const dayKey = assignment.serviceDate.toISOString().slice(0, 10);
      const record =
        attendanceByEmployee.get(assignment.employeeId) ??
        ({
          monthlyAmount: rateSnapshot.amount,
          scheduledDates: new Set<string>(),
          completedDates: new Set<string>(),
        } as Attendance);

      record.monthlyAmount = Math.max(record.monthlyAmount, rateSnapshot.amount);
      record.scheduledDates.add(dayKey);
      if (status === 'completed') {
        record.completedDates.add(dayKey);
      }
      attendanceByEmployee.set(assignment.employeeId, record);
    }
  }

  let created = 0;
  for (const [employeeId, record] of attendanceByEmployee.entries()) {
    if (!Number.isFinite(record.monthlyAmount) || record.monthlyAmount <= 0) continue;

    const semiMonthlyAmount = Number((record.monthlyAmount / 2).toFixed(2));
    if (!Number.isFinite(semiMonthlyAmount) || semiMonthlyAmount <= 0) continue;

    // 1) Ensure base semi-monthly earning is recorded
    await addPayrollEntry({
      periodId: period.periodId,
      employeeId,
      type: 'earning',
      category: 'monthly',
      amount: semiMonthlyAmount,
      description: 'Base monthly salary for period',
      source: 'auto:monthly_base',
    });
    created += 1;

    // 2) Attendance-based missed-day deduction (if applicable)
    const scheduled = record.scheduledDates.size;
    if (scheduled === 0) continue;

    const completed = record.completedDates.size;
    const missed = scheduled - completed;
    if (missed <= 0) continue;

    const dailyRate = semiMonthlyAmount / scheduled;
    const deduction = Number((dailyRate * missed).toFixed(2));
    if (deduction <= 0) continue;

    await addPayrollEntry({
      periodId: period.periodId,
      employeeId,
      type: 'deduction',
      category: 'missed_day',
      amount: deduction,
      description: `Missed ${missed} scheduled workday${
        missed === 1 ? '' : 's'
      } (${completed}/${scheduled} completed)`,
      source: 'auto:missed_day',
    });
    created += 1;
  }

  return { created, removed };
}

export async function overridePayrollEntryAmount(
  entryId: string,
  newAmount: number,
  adjustedBy: string,
  reason?: string,
) {
  const db = getFirestoreInstance();
  const entryRef = doc(db, 'payrollEntries', entryId);

  await runTransaction(db, async (transaction) => {
    const entrySnap = await transaction.get(entryRef);
    if (!entrySnap.exists()) {
      throw new Error('Payroll entry not found');
    }
    const entry = entrySnap.data() as PayrollEntry;
    const periodRef = doc(db, 'payrollPeriods', entry.periodId);
    const periodSnap = await transaction.get(periodRef);
    if (!periodSnap.exists()) {
      throw new Error('Payroll period not found for entry');
    }

    const magnitude = Math.abs(newAmount);
    const newStoredAmount = Number((entry.type === 'earning' ? magnitude : -magnitude).toFixed(2));

    const prevContribution =
      entry.type === 'earning'
        ? {
            gross: entry.amount,
            deductions: 0,
            net: entry.amount,
          }
        : {
            gross: 0,
            deductions: Math.abs(entry.amount),
            net: -Math.abs(entry.amount),
          };

    const newContribution =
      entry.type === 'earning'
        ? {
            gross: newStoredAmount,
            deductions: 0,
            net: newStoredAmount,
          }
        : {
            gross: 0,
            deductions: Math.abs(newStoredAmount),
            net: -Math.abs(newStoredAmount),
          };

    const grossDelta = newContribution.gross - prevContribution.gross;
    const deductionsDelta = newContribution.deductions - prevContribution.deductions;
    const netDelta = newContribution.net - prevContribution.net;

    const periodData = periodSnap.data() as PayrollPeriod;
    const totals = periodData?.totals ? { ...periodData.totals } : { ...ZERO_TOTALS };

    totals.gross = Number((totals.gross + grossDelta).toFixed(2));
    totals.deductions = Number((totals.deductions + deductionsDelta).toFixed(2));
    totals.net = Number((totals.net + netDelta).toFixed(2));

    transaction.update(periodRef, {
      totals,
      updatedAt: serverTimestamp(),
    });

    const originalAmount =
      typeof entry.override?.originalAmount === 'number'
        ? entry.override.originalAmount
        : entry.amount;

    const overridePayload: PayrollEntryOverride = {
      originalAmount,
      adjustedBy,
      adjustedAt: Timestamp.now(),
      reason: reason ?? entry.override?.reason,
    };

    transaction.update(entryRef, {
      amount: newStoredAmount,
      override: overridePayload,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function getPayrollSummary(periodId: string): Promise<PayrollPeriodSummary | null> {
  const db = getFirestoreInstance();
  const periodSnap = await getDoc(doc(db, 'payrollPeriods', periodId));
  if (!periodSnap.exists()) return null;

  const entriesSnap = await getDocs(
    query(collection(db, 'payrollEntries'), where('periodId', '==', periodId)),
  );

  const byEmployee = new Map<string, { gross: number; deductions: number; net: number }>();

  entriesSnap.forEach((entryDoc) => {
    const entry = entryDoc.data() as PayrollEntry;
    if (!byEmployee.has(entry.employeeId)) {
      byEmployee.set(entry.employeeId, { gross: 0, deductions: 0, net: 0 });
    }
    const totals = byEmployee.get(entry.employeeId)!;
    if (entry.type === 'earning') {
      totals.gross += entry.amount;
      totals.net += entry.amount;
    } else {
      const deduction = Math.abs(entry.amount);
      totals.deductions += deduction;
      totals.net -= deduction;
    }
  });

  const periodData = periodSnap.data() as FirestorePayrollPeriod;

  return {
    period: { id: periodSnap.id, ...periodData },
    totals: periodData?.totals ?? ZERO_TOTALS,
    byEmployee: Array.from(byEmployee.entries()).map(([employeeId, totals]) => ({
      employeeId,
      gross: Number(totals.gross.toFixed(2)),
      deductions: Number(totals.deductions.toFixed(2)),
      net: Number(totals.net.toFixed(2)),
    })),
  };
}

export function getPeriodForWorkDate(workDate: Date): SemiMonthlyPeriod {
  return getSemiMonthlyPeriodForWorkDate(workDate);
}

export function getPeriodForPayDate(payDate: Date): SemiMonthlyPeriod {
  return getSemiMonthlyPeriodForPayDate(payDate);
}

export { semiMonthlyPeriodId };

export async function finalizePayrollPeriod(
  periodId: string,
  finalizedBy: string,
): Promise<{
  totals: PayrollPeriodTotals;
  expenseCreated: boolean;
  expenseId?: string;
  alreadyFinalized: boolean;
}> {
  const db = getFirestoreInstance();
  await recalcPayrollPeriodTotals(periodId);

  const period = await getPayrollPeriodById(periodId);
  if (!period) throw new Error('Payroll period not found');

  if (period.status === 'finalized') {
    return {
      totals: period.totals,
      expenseCreated: false,
      alreadyFinalized: true,
    };
  }

  const payDate = period.payDate.toDate();
  const workStart = period.periodStart.toDate();
  const workEnd = period.periodEnd.toDate();

  let expenseId: string | undefined;
  const netAmount = Number(period.totals.net || 0);
  const alreadyFinalizedInTxn = await runTransaction(db, async (transaction) => {
    const periodRef = doc(db, 'payrollPeriods', periodId);
    const snap = await transaction.get(periodRef);
    if (!snap.exists()) throw new Error('Payroll period not found');
    const current = snap.data() as PayrollPeriod;
    if (current.status === 'finalized') return true;
    transaction.update(periodRef, {
      status: 'finalized',
      finalizedAt: serverTimestamp(),
      finalizedBy,
      updatedAt: serverTimestamp(),
    });
    return false;
  });

  if (alreadyFinalizedInTxn) {
    return {
      totals: period.totals,
      expenseCreated: false,
      alreadyFinalized: true,
    };
  }

  if (Math.abs(netAmount) > 0.005) {
    const existingExpenseSnap = await getDocs(
      query(collection(db, 'expenses'), where('payrollPeriodId', '==', periodId), limit(1)),
    );

    if (existingExpenseSnap.empty) {
      const memo = `Payroll for ${workStart.toLocaleDateString()} – ${workEnd.toLocaleDateString()}`;
      const expenseDoc = await addDoc(collection(db, 'expenses'), {
        vendor: 'Payroll',
        category: 'Payroll',
        amount: Number(netAmount.toFixed(2)),
        paidAt: Timestamp.fromDate(payDate),
        memo,
        payrollPeriodId: periodId,
        createdAt: serverTimestamp(),
      });
      expenseId = expenseDoc.id;
    }
  }

  return {
    totals: period.totals,
    expenseCreated: !!expenseId,
    expenseId,
    alreadyFinalized: false,
  };
}

/**
 * Refresh rate snapshots on existing payroll entries from the current employeeRates.
 * This is useful for fixing entries that were created with incorrect rates.
 * Only affects entries that have a jobId (job-based earnings).
 */
export async function refreshPayrollEntryRates(
  periodId: string,
  minAmount?: number,
): Promise<{
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const db = getFirestoreInstance();

  // Get all entries for this period
  const entriesSnap = await getDocs(
    query(
      collection(db, 'payrollEntries'),
      where('periodId', '==', periodId),
      where('type', '==', 'earning'),
    ),
  );

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entryDoc of entriesSnap.docs) {
    const entry = entryDoc.data() as PayrollEntry;

    // Only process entries with a jobId (job-based earnings)
    if (!entry.jobId) {
      skipped++;
      continue;
    }

    // If minAmount is specified, only update entries below that threshold
    if (typeof minAmount === 'number' && entry.amount >= minAmount) {
      skipped++;
      continue;
    }

    try {
      // Get the job to find service date and location
      const jobSnap = await getDoc(doc(db, 'serviceHistory', entry.jobId));
      if (!jobSnap.exists()) {
        errors.push(`Job ${entry.jobId} not found for entry ${entryDoc.id}`);
        continue;
      }

      const jobData = jobSnap.data() as Record<string, any>;
      const serviceDateRaw = jobData.serviceDate;
      const serviceDate =
        serviceDateRaw instanceof Timestamp
          ? serviceDateRaw
          : Timestamp.fromDate(new Date(serviceDateRaw));

      // Get fresh rate snapshot
      const freshRate = await getEffectiveRateSnapshot(
        entry.employeeId,
        serviceDate,
        jobData.locationId ?? undefined,
        jobData.clientProfileId ?? undefined,
      );

      if (!freshRate) {
        errors.push(`No rate found for employee ${entry.employeeId} on entry ${entryDoc.id}`);
        continue;
      }

      // Skip if rate type changed (shouldn't happen, but be safe)
      if (freshRate.type !== entry.category) {
        errors.push(
          `Rate type mismatch for entry ${entryDoc.id}: was ${entry.category}, now ${freshRate.type}`,
        );
        continue;
      }

      // Calculate new amount
      const oldAmount = entry.amount;
      let newAmount: number;

      if (freshRate.type === 'per_visit') {
        newAmount = freshRate.amount;
      } else if (freshRate.type === 'hourly') {
        const hours = entry.hours ?? 0;
        newAmount = Number((hours * freshRate.amount).toFixed(2));
      } else {
        // Monthly - skip, handled separately
        skipped++;
        continue;
      }

      // Only update if amount changed significantly
      if (Math.abs(newAmount - oldAmount) < 0.01) {
        skipped++;
        continue;
      }

      // Track the override for audit trail
      const overridePayload: PayrollEntryOverride = {
        originalAmount: oldAmount,
        adjustedBy: 'system:rate_refresh',
        adjustedAt: Timestamp.now(),
        reason: `Rate refreshed from $${oldAmount.toFixed(2)} to $${newAmount.toFixed(
          2,
        )} (fresh rate: $${freshRate.amount})`,
      };

      // Update the entry
      await runTransaction(db, async (transaction) => {
        const periodRef = doc(db, 'payrollPeriods', periodId);
        const periodSnap = await transaction.get(periodRef);
        if (!periodSnap.exists()) return;

        const periodData = periodSnap.data() as PayrollPeriod;
        const totals = periodData?.totals
          ? { ...periodData.totals }
          : { gross: 0, deductions: 0, net: 0 };

        // Adjust totals
        const delta = newAmount - oldAmount;
        totals.gross = Number((totals.gross + delta).toFixed(2));
        totals.net = Number((totals.net + delta).toFixed(2));

        transaction.update(periodRef, {
          totals,
          updatedAt: serverTimestamp(),
        });

        transaction.update(entryDoc.ref, {
          amount: newAmount,
          rateSnapshot: freshRate,
          override: overridePayload,
          updatedAt: serverTimestamp(),
        });
      });

      console.log(
        `[refreshPayrollEntryRates] Updated entry ${entryDoc.id}: $${oldAmount} -> $${newAmount} (employee: ${entry.employeeId})`,
      );
      updated++;
    } catch (error) {
      console.error(`Error refreshing entry ${entryDoc.id}:`, error);
      errors.push(
        `Error on entry ${entryDoc.id}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  // Final recalc to ensure totals are accurate
  await recalcPayrollPeriodTotals(periodId);

  return { updated, skipped, errors };
}
