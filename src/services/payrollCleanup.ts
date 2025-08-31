import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { getFirestoreInstance } from "./firebase";

/**
 * Clean up jobs that are marked as payroll processed but don't have corresponding payroll runs
 */
export async function cleanupProcessedJobsWithoutRuns() {
  const db = getFirestoreInstance();

  console.log("Starting cleanup of processed jobs without runs...");

  // Find all jobs marked as payroll processed
  const processedJobsQuery = query(
    collection(db, "serviceHistory"),
    where("payrollProcessed", "==", true)
  );

  const processedJobsSnap = await getDocs(processedJobsQuery);
  const processedJobs = processedJobsSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  console.log(`Found ${processedJobs.length} jobs marked as payroll processed`);

  // Get all payroll runs
  const payrollRunsSnap = await getDocs(collection(db, "payrollRuns"));
  const payrollRuns = payrollRunsSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  console.log(`Found ${payrollRuns.length} payroll runs`);

  // Create a map of job IDs that are actually in payroll runs
  const jobsInRuns = new Set<string>();
  const timesheetsSnap = await getDocs(collection(db, "timesheets"));

  timesheetsSnap.forEach((doc) => {
    const data = doc.data();
    if (data.approvedInRunId && data.jobId) {
      jobsInRuns.add(data.jobId);
    }
  });

  console.log(`${jobsInRuns.size} jobs have timesheets in payroll runs`);

  // Find jobs that are marked as processed but don't have corresponding runs
  const jobsToUnprocess = processedJobs.filter(
    (job) => !jobsInRuns.has(job.id)
  );

  console.log(
    `${jobsToUnprocess.length} jobs need to be marked as not processed`
  );

  if (jobsToUnprocess.length === 0) {
    return {
      message:
        "No cleanup needed - all processed jobs have corresponding payroll runs",
      cleaned: 0,
    };
  }

  // Update these jobs to not be marked as processed
  const batch = writeBatch(db);
  jobsToUnprocess.forEach((job) => {
    batch.update(doc(db, "serviceHistory", job.id), {
      payrollProcessed: false,
      updatedAt: new Date(),
    });
  });

  await batch.commit();

  return {
    message: `Cleaned up ${jobsToUnprocess.length} jobs that were incorrectly marked as processed`,
    cleaned: jobsToUnprocess.length,
    jobs: jobsToUnprocess.map((job) => job.id),
  };
}

/**
 * Analyze the current state of payroll processing
 */
export async function analyzePayrollState() {
  const db = getFirestore();

  // Get counts of various payroll states
  const [processedJobs, totalJobs, payrollRuns, timesheets] = await Promise.all(
    [
      getDocs(
        query(
          collection(db, "serviceHistory"),
          where("payrollProcessed", "==", true)
        )
      ),
      getDocs(collection(db, "serviceHistory")),
      getDocs(collection(db, "payrollRuns")),
      getDocs(collection(db, "timesheets")),
    ]
  );

  // Analyze payroll runs
  const runStatuses: Record<string, number> = {};
  payrollRuns.forEach((doc) => {
    const status = doc.data().status || "unknown";
    runStatuses[status] = (runStatuses[status] || 0) + 1;
  });

  // Analyze timesheets
  const timesheetStats = {
    total: timesheets.size,
    approved: 0,
    pending: 0,
    withRuns: 0,
    withoutRuns: 0,
  };

  timesheets.forEach((doc) => {
    const data = doc.data();
    if (data.approvedInRunId) {
      timesheetStats.withRuns++;
      timesheetStats.approved++;
    } else {
      timesheetStats.withoutRuns++;
      if (data.adminApproved) {
        timesheetStats.approved++;
      } else {
        timesheetStats.pending++;
      }
    }
  });

  return {
    jobs: {
      total: totalJobs.size,
      processed: processedJobs.size,
      unprocessed: totalJobs.size - processedJobs.size,
    },
    payrollRuns: {
      total: payrollRuns.size,
      ...runStatuses,
    },
    timesheets: timesheetStats,
  };
}

/**
 * Reset all payroll processing flags (use with caution)
 */
export async function resetAllPayrollProcessing() {
  const db = getFirestore();

  console.log("⚠️  WARNING: Resetting all payroll processing flags...");

  const batch = writeBatch(db);
  const jobsSnap = await getDocs(collection(db, "serviceHistory"));

  jobsSnap.forEach((doc) => {
    const data = doc.data();
    if (data.payrollProcessed) {
      batch.update(doc.ref, {
        payrollProcessed: false,
        updatedAt: new Date(),
      });
    }
  });

  await batch.commit();

  return {
    message: "Reset all payroll processing flags",
    resetCount: jobsSnap.size,
  };
}
