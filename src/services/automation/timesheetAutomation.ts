import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
  serverTimestamp,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { getFirestoreInstance } from '../firebase';

// Type definitions
type ClockEvent = {
  id: string;
  employeeProfileId: string;
  locationId?: string;
  clockInTime: Timestamp;
  clockOutTime?: Timestamp;
  latitude?: number;
  longitude?: number;
};

type JobAssignment = {
  jobId: string;
  employeeId: string;
  locationId?: string;
  clientProfileId?: string;
  serviceDate: Date;
};

type RateSnapshot = {
  type: 'per_visit' | 'hourly' | 'monthly';
  amount: number;
  monthlyPayDay?: number;
};

/**
 * Automatically create timesheets from clock events
 */
export async function processClockEventsForTimesheets(startDate: Date, endDate: Date) {
  const db = getFirestoreInstance();

  // 1. Get all clock events in the date range
  const clockQuery = query(
    collection(db, 'employeeTimeTracking'),
    where('clockInTime', '>=', Timestamp.fromDate(startDate)),
    where('clockInTime', '<', Timestamp.fromDate(endDate)),
    orderBy('clockInTime', 'asc'),
  );

  const clockSnap = await getDocs(clockQuery);
  const clockEvents: ClockEvent[] = [];
  clockSnap.forEach((doc) => {
    clockEvents.push({ id: doc.id, ...(doc.data() as any) });
  });

  console.log(`Found ${clockEvents.length} clock events to process`);

  // 2. Get relevant jobs for the same period
  const jobsQuery = query(
    collection(db, 'serviceHistory'),
    where('serviceDate', '>=', Timestamp.fromDate(startDate)),
    where('serviceDate', '<', Timestamp.fromDate(endDate)),
  );

  const jobsSnap = await getDocs(jobsQuery);
  const jobAssignments: JobAssignment[] = [];

  jobsSnap.forEach((doc) => {
    const data = doc.data() as any;
    const assignedEmployees = data.assignedEmployees || [];
    const serviceDate = data.serviceDate?.toDate
      ? data.serviceDate.toDate()
      : new Date(data.serviceDate);

    assignedEmployees.forEach((employeeId: string) => {
      jobAssignments.push({
        jobId: doc.id,
        employeeId,
        locationId: data.locationId,
        clientProfileId: data.clientProfileId,
        serviceDate,
      });
    });
  });

  console.log(`Found ${jobAssignments.length} job assignments`);

  // 3. Match clock events to jobs and create timesheets
  const batch = writeBatch(db);
  let processedCount = 0;
  let skippedCount = 0;

  for (const clockEvent of clockEvents) {
    // Find matching job assignment
    const matchingJob = findMatchingJobForClockEvent(clockEvent, jobAssignments);

    if (matchingJob) {
      // Check if timesheet already exists
      const existingTimesheet = await checkTimesheetExists(
        clockEvent.employeeProfileId,
        matchingJob.jobId,
        matchingJob.serviceDate,
      );

      if (!existingTimesheet) {
        // Get effective rate for this assignment
        const rateSnapshot = await getEffectiveRate(
          clockEvent.employeeProfileId,
          clockEvent.clockInTime,
          matchingJob.locationId,
          matchingJob.clientProfileId,
        );

        if (rateSnapshot) {
          // Calculate hours from clock event
          const hours = calculateHoursFromClockEvent(clockEvent);

          // Create timesheet
          const timesheetData = {
            employeeId: clockEvent.employeeProfileId,
            jobId: matchingJob.jobId,
            start: clockEvent.clockInTime,
            end: clockEvent.clockOutTime,
            hours,
            units: rateSnapshot.type === 'per_visit' ? 1 : undefined,
            rateSnapshot,
            employeeApproved: true, // Auto-approved for clock-based entries
            adminApproved: false, // Still needs admin verification
            source: 'clock_event',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          const timesheetRef = doc(collection(db, 'timesheets'));
          batch.set(timesheetRef, timesheetData);
          processedCount++;
        } else {
          console.warn(`No rate found for employee ${clockEvent.employeeProfileId}`);
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    } else {
      console.warn(`No matching job found for clock event ${clockEvent.id}`);
      skippedCount++;
    }
  }

  // Commit the batch
  if (processedCount > 0) {
    await batch.commit();
  }

  return {
    processed: processedCount,
    skipped: skippedCount,
    total: clockEvents.length,
  };
}

/**
 * Find the best matching job for a clock event
 */
function findMatchingJobForClockEvent(
  clockEvent: ClockEvent,
  jobAssignments: JobAssignment[],
): JobAssignment | null {
  // Find jobs for the same employee and date
  const employeeJobs = jobAssignments.filter(
    (job) => job.employeeId === clockEvent.employeeProfileId,
  );

  if (employeeJobs.length === 0) return null;

  // Find jobs at the same location (if location is specified)
  if (clockEvent.locationId) {
    const locationJobs = employeeJobs.filter((job) => job.locationId === clockEvent.locationId);
    if (locationJobs.length > 0) {
      // Return the first matching job (could be enhanced with time proximity)
      return locationJobs[0];
    }
  }

  // Fallback to first job for the employee on that date
  return employeeJobs[0];
}

/**
 * Calculate hours from clock event
 */
function calculateHoursFromClockEvent(clockEvent: ClockEvent): number {
  if (!clockEvent.clockOutTime) return 0;

  const clockIn = clockEvent.clockInTime.toDate();
  const clockOut = clockEvent.clockOutTime.toDate();

  const diffMs = clockOut.getTime() - clockIn.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  return Math.max(0, Math.round(diffHours * 100) / 100);
}

/**
 * Check if timesheet already exists for employee+job+date
 */
async function checkTimesheetExists(
  employeeId: string,
  jobId: string,
  serviceDate: Date,
): Promise<boolean> {
  const db = getFirestoreInstance();

  const startOfDay = new Date(serviceDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(serviceDate);
  endOfDay.setHours(23, 59, 59, 999);

  const qy = query(
    collection(db, 'timesheets'),
    where('employeeId', '==', employeeId),
    where('start', '>=', Timestamp.fromDate(startOfDay)),
    where('start', '<=', Timestamp.fromDate(endOfDay)),
  );

  const snap = await getDocs(qy);
  let exists = false;
  snap.forEach((doc) => {
    const data = doc.data() as any;
    if (String(data?.jobId || '') === jobId) exists = true;
  });
  return exists;
}

/**
 * Get effective rate for an employee at a specific date
 */
async function getEffectiveRate(
  employeeId: string,
  effectiveAt: Timestamp,
  locationId?: string,
  clientProfileId?: string,
): Promise<RateSnapshot | null> {
  const db = getFirestoreInstance();

  // Try scoped rates first (location/client specific)
  let rateQuery = query(
    collection(db, 'employeeRates'),
    where('employeeId', '==', employeeId),
    where('effectiveDate', '<=', effectiveAt),
    orderBy('effectiveDate', 'desc'),
    limit(1),
  );

  if (locationId) {
    rateQuery = query(
      collection(db, 'employeeRates'),
      where('employeeId', '==', employeeId),
      where('locationId', '==', locationId),
      where('effectiveDate', '<=', effectiveAt),
      orderBy('effectiveDate', 'desc'),
      limit(1),
    );
  } else if (clientProfileId) {
    rateQuery = query(
      collection(db, 'employeeRates'),
      where('employeeId', '==', employeeId),
      where('clientProfileId', '==', clientProfileId),
      where('effectiveDate', '<=', effectiveAt),
      orderBy('effectiveDate', 'desc'),
      limit(1),
    );
  }

  const rateSnap = await getDocs(rateQuery);
  if (!rateSnap.empty) {
    const data = rateSnap.docs[0].data() as any;
    const rateSnapshot: RateSnapshot = {
      type: data.rateType || (data.hourlyRate ? 'hourly' : 'per_visit'),
      amount: data.amount || data.hourlyRate || data.perVisitRate || data.rate || 0,
    };

    // Only include monthlyPayDay if it's defined and not null
    if (data.monthlyPayDay !== undefined && data.monthlyPayDay !== null) {
      rateSnapshot.monthlyPayDay = data.monthlyPayDay;
    }

    return rateSnapshot;
  }

  return null;
}

/**
 * Update timesheet earnings when job is completed
 */
export async function updateTimesheetEarningsOnJobCompletion(jobId: string) {
  const db = getFirestoreInstance();

  // Get all timesheets for this job
  const timesheetsQuery = query(
    collection(db, 'timesheets'),
    where('jobId', '==', jobId),
    where('source', '==', 'clock_event'),
    where('adminApproved', '==', false),
  );

  const timesheetsSnap = await getDocs(timesheetsQuery);

  if (timesheetsSnap.empty) return { updated: 0, timesheetIds: [] as string[] };

  const batch = writeBatch(db);
  let updatedCount = 0;
  const updatedTimesheetIds: string[] = [];

  timesheetsSnap.forEach((docSnap) => {
    const data = docSnap.data() as any;
    // Mark as admin approved and update earnings calculation
    batch.update(docSnap.ref, {
      adminApproved: true,
      updatedAt: serverTimestamp(),
    });
    updatedCount++;
    updatedTimesheetIds.push(docSnap.id);
  });

  if (updatedCount > 0) {
    await batch.commit();
  }

  return { updated: updatedCount, timesheetIds: updatedTimesheetIds };
}

export async function rollbackTimesheetEarningsOnJobCompletion(timesheetIds: string[]) {
  if (!Array.isArray(timesheetIds) || timesheetIds.length === 0) {
    return;
  }

  const db = getFirestoreInstance();
  await runTransaction(db, async (transaction) => {
    for (const timesheetId of timesheetIds) {
      const timesheetRef = doc(db, 'timesheets', timesheetId);
      const snap = await transaction.get(timesheetRef);
      if (!snap.exists()) continue;
      const data = snap.data() as any;
      // Only revert auto-generated clock event approvals
      if (data?.source !== 'clock_event') continue;
      transaction.update(timesheetRef, {
        adminApproved: false,
        updatedAt: serverTimestamp(),
      });
    }
  });
}
