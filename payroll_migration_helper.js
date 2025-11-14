/**
 * Payroll Migration Helper
 *
 * This script helps migrate existing payroll data to the new simplified system.
 * Run this in the browser console when logged in as an admin.
 *
 * To use: Copy and paste the entire contents of this file into your browser console
 */

// Browser-compatible version - copy and paste this entire block into your browser console
const PayrollMigrationHelper = {
  async archiveOldJobs() {
    console.log("📦 Archiving jobs before 8/10/2025...");

    try {
      const db =
        window.firebase?.firestore?.getFirestore?.() ||
        window.firebase?.firestore?.();
      if (!db) throw new Error("Firebase not available");

      const cutoffDate = new Date("2025-08-10");

      // Find jobs before the cutoff date
      const oldJobsQuery = db
        .collection("serviceHistory")
        .where(
          "serviceDate",
          "<",
          window.firebase.firestore.Timestamp.fromDate(cutoffDate)
        );

      const oldJobsSnap = await oldJobsQuery.get();
      const oldJobs = oldJobsSnap.docs;

      console.log(`Found ${oldJobs.length} jobs before 8/10/2025 to archive`);

      if (oldJobs.length === 0) {
        return { message: "No old jobs to archive", archived: 0 };
      }

      // Archive jobs in batches
      const batch = db.batch();
      let archivedCount = 0;

      oldJobs.forEach((jobDoc) => {
        batch.update(jobDoc.ref, {
          archived: true,
          archivedAt: new Date(),
          payrollProcessed: false,
        });
        archivedCount++;
      });

      await batch.commit();

      return {
        message: `Archived ${archivedCount} jobs before 8/10/2025`,
        archived: archivedCount,
      };
    } catch (error) {
      console.error("❌ Failed to archive old jobs:", error);
    }
  },

  async analyzePayrollState() {
    console.log("🔍 Analyzing current payroll state...");

    try {
      const db =
        window.firebase?.firestore?.getFirestore?.() ||
        window.firebase?.firestore?.();
      if (!db) throw new Error("Firebase not available");

      const [
        processedJobsSnap,
        totalJobsSnap,
        payrollRunsSnap,
        timesheetsSnap,
      ] = await Promise.all([
        db
          .collection("serviceHistory")
          .where("payrollProcessed", "==", true)
          .get(),
        db.collection("serviceHistory").get(),
        db.collection("payrollRuns").get(),
        db.collection("timesheets").get(),
      ]);

      const runStatuses = {};
      payrollRunsSnap.forEach((doc) => {
        const status = doc.data().status || "unknown";
        runStatuses[status] = (runStatuses[status] || 0) + 1;
      });

      const timesheetStats = {
        total: timesheetsSnap.size,
        approved: 0,
        pending: 0,
        withRuns: 0,
        withoutRuns: 0,
      };
      timesheetsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.approvedInRunId) {
          timesheetStats.withRuns++;
          timesheetStats.approved++;
        } else {
          timesheetStats.withoutRuns++;
          if (data.adminApproved) timesheetStats.approved++;
          else timesheetStats.pending++;
        }
      });

      const result = {
        jobs: {
          total: totalJobsSnap.size,
          processed: processedJobsSnap.size,
          unprocessed: totalJobsSnap.size - processedJobsSnap.size,
        },
        payrollRuns: { total: payrollRunsSnap.size, ...runStatuses },
        timesheets: timesheetStats,
      };

      console.log("📊 Payroll Analysis Results:", result);
      return result;
    } catch (error) {
      console.error("❌ Failed to analyze payroll state:", error);
    }
  },

  async cleanupProcessedJobs() {
    console.log("🧹 Cleaning up incorrectly processed jobs...");

    try {
      const db =
        window.firebase?.firestore?.getFirestore?.() ||
        window.firebase?.firestore?.();
      if (!db) throw new Error("Firebase not available");

      const processedJobsSnap = await db
        .collection("serviceHistory")
        .where("payrollProcessed", "==", true)
        .get();

      const jobsInRuns = new Set();
      const timesheetsSnap = await db.collection("timesheets").get();
      timesheetsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.approvedInRunId && data.jobId) {
          jobsInRuns.add(data.jobId);
        }
      });

      const jobsToUnprocess = processedJobsSnap.docs.filter(
        (job) => !jobsInRuns.has(job.id)
      );

      if (jobsToUnprocess.length > 0) {
        const batch = db.batch();
        jobsToUnprocess.forEach((jobDoc) => {
          batch.update(jobDoc.ref, { payrollProcessed: false });
        });
        await batch.commit();
      }

      return {
        message: `Cleaned up ${jobsToUnprocess.length} jobs`,
        cleaned: jobsToUnprocess.length,
        jobs: jobsToUnprocess.map((job) => job.id),
      };
    } catch (error) {
      console.error("❌ Failed to cleanup jobs:", error);
    }
  },

  async processRecentClockEvents() {
    console.log("⏰ Processing clock events from 8/10/2025 onwards...");

    try {
      const db =
        window.firebase?.firestore?.getFirestore?.() ||
        window.firebase?.firestore?.();
      if (!db) throw new Error("Firebase not available");

      const endDate = new Date();
      const startDate = new Date("2025-08-10");

      const clockQuery = db
        .collection("employeeTimeTracking")
        .where(
          "clockInTime",
          ">=",
          window.firebase.firestore.Timestamp.fromDate(startDate)
        )
        .where(
          "clockInTime",
          "<",
          window.firebase.firestore.Timestamp.fromDate(endDate)
        )
        .orderBy("clockInTime", "asc");

      const clockSnap = await clockQuery.get();
      const clockEvents = clockSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      console.log(`Found ${clockEvents.length} clock events to process`);

      // Get recent jobs
      const jobsQuery = db
        .collection("serviceHistory")
        .where(
          "serviceDate",
          ">=",
          window.firebase.firestore.Timestamp.fromDate(startDate)
        )
        .where(
          "serviceDate",
          "<",
          window.firebase.firestore.Timestamp.fromDate(endDate)
        );

      const jobsSnap = await jobsQuery.get();
      const jobAssignments = [];

      jobsSnap.forEach((doc) => {
        const data = doc.data();
        const assignedEmployees = data.assignedEmployees || [];
        const serviceDate = data.serviceDate?.toDate
          ? data.serviceDate.toDate()
          : new Date(data.serviceDate);

        assignedEmployees.forEach((employeeId) => {
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

      // Process clock events
      const batch = db.batch();
      let processedCount = 0;
      let skippedCount = 0;

      for (const clockEvent of clockEvents) {
        const matchingJob = this.findMatchingJobForClockEvent(
          clockEvent,
          jobAssignments
        );

        if (matchingJob) {
          const existingTimesheet = await this.checkTimesheetExists(
            clockEvent.employeeProfileId,
            matchingJob.jobId,
            matchingJob.serviceDate
          );

          if (!existingTimesheet) {
            const rateSnapshot = await this.getEffectiveRate(
              clockEvent.employeeProfileId,
              clockEvent.clockInTime,
              matchingJob.locationId,
              matchingJob.clientProfileId
            );

            if (rateSnapshot) {
              const hours = this.calculateHoursFromClockEvent(clockEvent);

              const timesheetData = {
                employeeId: clockEvent.employeeProfileId,
                jobId: matchingJob.jobId,
                start: clockEvent.clockInTime,
                end: clockEvent.clockOutTime,
                hours,
                units: rateSnapshot.type === "per_visit" ? 1 : undefined,
                rateSnapshot,
                employeeApproved: true,
                adminApproved: false,
                source: "clock_event",
                createdAt: window.firebase.firestore.Timestamp.now(),
                updatedAt: window.firebase.firestore.Timestamp.now(),
              };

              const timesheetRef = db.collection("timesheets").doc();
              batch.set(timesheetRef, timesheetData);
              processedCount++;
            }
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      }

      if (processedCount > 0) {
        await batch.commit();
      }

      return {
        processed: processedCount,
        skipped: skippedCount,
        total: clockEvents.length,
      };
    } catch (error) {
      console.error("❌ Failed to process clock events:", error);
    }
  },

  findMatchingJobForClockEvent(clockEvent, jobAssignments) {
    const employeeJobs = jobAssignments.filter(
      (job) => job.employeeId === clockEvent.employeeProfileId
    );

    if (employeeJobs.length === 0) return null;

    if (clockEvent.locationId) {
      const locationJobs = employeeJobs.filter(
        (job) => job.locationId === clockEvent.locationId
      );
      if (locationJobs.length > 0) return locationJobs[0];
    }

    return employeeJobs[0];
  },

  calculateHoursFromClockEvent(clockEvent) {
    if (!clockEvent.clockOutTime) return 0;
    const clockIn = clockEvent.clockInTime.toDate();
    const clockOut = clockEvent.clockOutTime.toDate();
    const diffMs = clockOut.getTime() - clockIn.getTime();
    return Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);
  },

  async checkTimesheetExists(employeeId, jobId, serviceDate) {
    const db =
      window.firebase?.firestore?.getFirestore?.() ||
      window.firebase?.firestore?.();
    const startOfDay = new Date(serviceDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(serviceDate);
    endOfDay.setHours(23, 59, 59, 999);

    const qy = db
      .collection("timesheets")
      .where("employeeId", "==", employeeId)
      .where(
        "start",
        ">=",
        window.firebase.firestore.Timestamp.fromDate(startOfDay)
      )
      .where(
        "start",
        "<=",
        window.firebase.firestore.Timestamp.fromDate(endOfDay)
      );

    const snap = await qy.get();
    let exists = false;
    snap.forEach((doc) => {
      const data = doc.data();
      if (data.jobId === jobId) exists = true;
    });
    return exists;
  },

  async getEffectiveRate(employeeId, effectiveAt, locationId, clientProfileId) {
    const db =
      window.firebase?.firestore?.getFirestore?.() ||
      window.firebase?.firestore?.();

    let rateQuery = db
      .collection("employeeRates")
      .where("employeeId", "==", employeeId)
      .where("effectiveDate", "<=", effectiveAt)
      .orderBy("effectiveDate", "desc")
      .limit(1);

    if (locationId) {
      rateQuery = db
        .collection("employeeRates")
        .where("employeeId", "==", employeeId)
        .where("locationId", "==", locationId)
        .where("effectiveDate", "<=", effectiveAt)
        .orderBy("effectiveDate", "desc")
        .limit(1);
    }

    const rateSnap = await rateQuery.get();
    if (!rateSnap.empty) {
      const data = rateSnap.docs[0].data();
      const rateSnapshot = {
        type: data.rateType || (data.hourlyRate ? "hourly" : "per_visit"),
        amount:
          data.amount || data.hourlyRate || data.perVisitRate || data.rate || 0,
      };

      // Only include monthlyPayDay if it's defined and not null
      if (data.monthlyPayDay !== undefined && data.monthlyPayDay !== null) {
        rateSnapshot.monthlyPayDay = data.monthlyPayDay;
      }

      return rateSnapshot;
    }
    return null;
  },

  async runTargetedMigration() {
    console.log(
      "🚀 Starting targeted payroll migration (8/10/2025 onwards)..."
    );

    try {
      console.log("Step 1: Analyzing current state...");
      const analysis = await this.analyzePayrollState();
      console.log("Analysis complete");

      console.log("Step 2: Archiving old jobs...");
      const archiveResult = await this.archiveOldJobs();
      console.log("Archive result:", archiveResult);

      console.log("Step 3: Cleaning up incorrectly processed recent jobs...");
      const cleanupResult = await this.cleanupProcessedJobs();
      console.log("Cleanup result:", cleanupResult);

      console.log("Step 4: Processing recent clock events...");
      const clockResult = await this.processRecentClockEvents();
      console.log("Clock processing result:", clockResult);

      console.log(
        "✅ Migration complete! Ready for jobs from 8/10/2025 onwards."
      );
      console.log("📋 Next steps:");
      console.log(
        "  1. Go to Finance → Weekly Review to see current timesheets"
      );
      console.log("  2. Go to Finance → Payroll Admin to run automation tools");
      console.log(
        "  3. New jobs will automatically create timesheets from clock events"
      );
    } catch (error) {
      console.error("❌ Migration failed:", error);
    }
  },
};

// Make it available globally
window.PayrollMigrationHelper = PayrollMigrationHelper;

console.log("💰 Payroll Migration Helper loaded!");
console.log("Available commands:");
console.log("  PayrollMigrationHelper.analyzePayrollState()");
console.log("  PayrollMigrationHelper.cleanupProcessedJobs()");
console.log("  PayrollMigrationHelper.processRecentClockEvents()");
console.log("  PayrollMigrationHelper.archiveOldJobs()");
console.log(
  "  PayrollMigrationHelper.runTargetedMigration()  // ⭐ RECOMMENDED"
);
console.log("  PayrollMigrationHelper.quickSetup()");
