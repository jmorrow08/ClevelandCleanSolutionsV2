const admin = require("firebase-admin");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

// Initialize Firebase Admin (you'll need to set up service account)
// initializeApp({
//   credential: admin.credential.applicationDefault(),
//   projectId: 'your-project-id'
// });

const db = getFirestore();

// Test data constants
const TEST_DATA = {
  employees: {
    employeeA: "employee-a-001",
    employeeB: "employee-b-001",
  },
  locations: {
    locationX: "location-x-001",
    locationY: "location-y-001",
  },
  rates: {
    employeeAPerVisit: 25.0,
    employeeBHourly: 18.5,
  },
};

// Helper functions
function log(message, data = null) {
  console.log(`[${new Date().toISOString()}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

async function cleanupTestData() {
  log("Cleaning up test data...");

  // Clean up test rates
  const ratesQuery = await db
    .collection("employeeRates")
    .where("employeeId", "in", [
      TEST_DATA.employees.employeeA,
      TEST_DATA.employees.employeeB,
    ])
    .get();

  const batch = db.batch();
  ratesQuery.docs.forEach((doc) => batch.delete(doc.ref));

  // Clean up test jobs
  const jobsQuery = await db
    .collection("serviceHistory")
    .where("assignedEmployees", "array-contains", TEST_DATA.employees.employeeA)
    .get();

  jobsQuery.docs.forEach((doc) => batch.delete(doc.ref));

  // Clean up test timesheets
  const timesheetsQuery = await db
    .collection("timesheets")
    .where("employeeId", "in", [
      TEST_DATA.employees.employeeA,
      TEST_DATA.employees.employeeB,
    ])
    .get();

  timesheetsQuery.docs.forEach((doc) => batch.delete(doc.ref));

  // Clean up test payroll runs
  const runsQuery = await db
    .collection("payrollRuns")
    .where("createdBy", "==", "test-script")
    .get();

  runsQuery.docs.forEach((doc) => batch.delete(doc.ref));

  await batch.commit();
  log("Test data cleanup completed");
}

async function step1_SetupRates() {
  log("Step 1: Setting up employee rates...");

  const batch = db.batch();

  // Add per_visit rate for Employee A scoped to Location X
  const employeeARateRef = db.collection("employeeRates").doc();
  batch.set(employeeARateRef, {
    employeeId: TEST_DATA.employees.employeeA,
    rateType: "per_visit",
    amount: TEST_DATA.rates.employeeAPerVisit,
    locationId: TEST_DATA.locations.locationX,
    effectiveDate: Timestamp.fromDate(new Date("2024-01-01")),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // Add hourly rate for Employee B (global)
  const employeeBRateRef = db.collection("employeeRates").doc();
  batch.set(employeeBRateRef, {
    employeeId: TEST_DATA.employees.employeeB,
    rateType: "hourly",
    amount: TEST_DATA.rates.employeeBHourly,
    effectiveDate: Timestamp.fromDate(new Date("2024-01-01")),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  await batch.commit();
  log("Employee rates setup completed");

  // Verify rates were created
  const ratesQuery = await db
    .collection("employeeRates")
    .where("employeeId", "in", [
      TEST_DATA.employees.employeeA,
      TEST_DATA.employees.employeeB,
    ])
    .get();

  log(`Created ${ratesQuery.size} rate records`);
  ratesQuery.docs.forEach((doc) => {
    const data = doc.data();
    log(`Rate: ${data.employeeId} - ${data.rateType} - $${data.amount}`);
  });
}

async function step2_CreateJobs() {
  log("Step 2: Creating test jobs...");

  const lastPeriodStart = new Date();
  lastPeriodStart.setDate(lastPeriodStart.getDate() - 14); // 2 weeks ago
  const lastPeriodEnd = new Date(lastPeriodStart);
  lastPeriodEnd.setDate(lastPeriodEnd.getDate() + 14);

  const batch = db.batch();

  // Job 1: Location X, Employee A, Duration: 2 hours
  const job1Ref = db.collection("serviceHistory").doc();
  batch.set(job1Ref, {
    serviceDate: Timestamp.fromDate(
      new Date(lastPeriodStart.getTime() + 24 * 60 * 60 * 1000)
    ), // Day 1
    locationId: TEST_DATA.locations.locationX,
    assignedEmployees: [TEST_DATA.employees.employeeA],
    duration: 120, // 2 hours in minutes
    status: "completed",
    createdAt: Timestamp.now(),
  });

  // Job 2: Location X, Employee A, Duration: 1.5 hours
  const job2Ref = db.collection("serviceHistory").doc();
  batch.set(job2Ref, {
    serviceDate: Timestamp.fromDate(
      new Date(lastPeriodStart.getTime() + 2 * 24 * 60 * 60 * 1000)
    ), // Day 2
    locationId: TEST_DATA.locations.locationX,
    assignedEmployees: [TEST_DATA.employees.employeeA],
    duration: 90, // 1.5 hours in minutes
    status: "completed",
    createdAt: Timestamp.now(),
  });

  // Job 3: Location Y, Employee B, Duration: 3 hours
  const job3Ref = db.collection("serviceHistory").doc();
  batch.set(job3Ref, {
    serviceDate: Timestamp.fromDate(
      new Date(lastPeriodStart.getTime() + 3 * 24 * 60 * 60 * 1000)
    ), // Day 3
    locationId: TEST_DATA.locations.locationY,
    assignedEmployees: [TEST_DATA.employees.employeeB],
    duration: 180, // 3 hours in minutes
    status: "completed",
    createdAt: Timestamp.now(),
  });

  await batch.commit();
  log("Test jobs created");

  // Verify jobs were created
  const jobsQuery = await db
    .collection("serviceHistory")
    .where("assignedEmployees", "array-contains", TEST_DATA.employees.employeeA)
    .get();

  log(`Created ${jobsQuery.size} jobs for Employee A`);

  const jobsQueryB = await db
    .collection("serviceHistory")
    .where("assignedEmployees", "array-contains", TEST_DATA.employees.employeeB)
    .get();

  log(`Created ${jobsQueryB.size} jobs for Employee B`);
}

async function step3_ScanAndGenerateTimesheets() {
  log("Step 3: Scanning jobs and generating timesheets...");

  const lastPeriodStart = new Date();
  lastPeriodStart.setDate(lastPeriodStart.getDate() - 14);
  const lastPeriodEnd = new Date(lastPeriodStart);
  lastPeriodEnd.setDate(lastPeriodEnd.getDate() + 14);

  // Query serviceHistory for the period
  const jobsQuery = await db
    .collection("serviceHistory")
    .where("serviceDate", ">=", Timestamp.fromDate(lastPeriodStart))
    .where("serviceDate", "<", Timestamp.fromDate(lastPeriodEnd))
    .get();

  log(`Found ${jobsQuery.size} jobs in period`);

  const batch = db.batch();
  let createdCount = 0;

  for (const jobDoc of jobsQuery.docs) {
    const jobData = jobDoc.data();
    const assignedEmployees = jobData.assignedEmployees || [];

    for (const employeeId of assignedEmployees) {
      // Check if timesheet already exists
      const existingTimesheetQuery = await db
        .collection("timesheets")
        .where("employeeId", "==", employeeId)
        .where("jobId", "==", jobDoc.id)
        .get();

      if (!existingTimesheetQuery.empty) {
        log(`Timesheet already exists for ${employeeId} - ${jobDoc.id}`);
        continue;
      }

      // Get effective rate for this employee
      const rateQuery = await db
        .collection("employeeRates")
        .where("employeeId", "==", employeeId)
        .where("effectiveDate", "<=", jobData.serviceDate)
        .orderBy("effectiveDate", "desc")
        .limit(1)
        .get();

      if (rateQuery.empty) {
        log(`No rate found for ${employeeId}`);
        continue;
      }

      const rateData = rateQuery.docs[0].data();
      const rateSnapshot = {
        type: rateData.rateType,
        amount: rateData.amount,
      };

      // Create timesheet
      const timesheetRef = db.collection("timesheets").doc();
      const timesheetData = {
        employeeId: employeeId,
        jobId: jobDoc.id,
        start: jobData.serviceDate,
        end: jobData.serviceDate,
        hours:
          rateData.rateType === "hourly" ? (jobData.duration || 0) / 60 : 0,
        units: rateData.rateType === "per_visit" ? 1 : 1,
        rateSnapshot: rateSnapshot,
        employeeApproved: false,
        adminApproved: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      batch.set(timesheetRef, timesheetData);
      createdCount++;
    }
  }

  await batch.commit();
  log(`Generated ${createdCount} timesheet drafts`);

  // Verify timesheets were created
  const timesheetsQuery = await db
    .collection("timesheets")
    .where("employeeId", "in", [
      TEST_DATA.employees.employeeA,
      TEST_DATA.employees.employeeB,
    ])
    .get();

  log(`Total timesheets: ${timesheetsQuery.size}`);
  timesheetsQuery.docs.forEach((doc) => {
    const data = doc.data();
    log(
      `Timesheet: ${data.employeeId} - ${data.rateSnapshot.type} - $${data.rateSnapshot.amount}`
    );
  });
}

async function step4_EmployeeApprovals() {
  log("Step 4: Processing employee approvals...");

  // Get timesheets for Employee A
  const employeeATimesheetsQuery = await db
    .collection("timesheets")
    .where("employeeId", "==", TEST_DATA.employees.employeeA)
    .get();

  const batch = db.batch();

  // Employee A approves both entries
  employeeATimesheetsQuery.docs.forEach((doc) => {
    batch.update(doc.ref, {
      employeeApproved: true,
      updatedAt: Timestamp.now(),
    });
  });

  // Employee B requests change (adds comment)
  const employeeBTimesheetsQuery = await db
    .collection("timesheets")
    .where("employeeId", "==", TEST_DATA.employees.employeeB)
    .get();

  employeeBTimesheetsQuery.docs.forEach((doc) => {
    batch.update(doc.ref, {
      employeeComment: "Requesting change - hours seem incorrect",
      updatedAt: Timestamp.now(),
    });
  });

  await batch.commit();
  log("Employee approvals processed");

  // Verify approvals
  const approvedQuery = await db
    .collection("timesheets")
    .where("employeeApproved", "==", true)
    .get();

  log(`Employee approved timesheets: ${approvedQuery.size}`);
}

async function step5_AdminApprovals() {
  log("Step 5: Processing admin approvals...");

  const batch = db.batch();

  // Admin approves Employee A's entries
  const employeeATimesheetsQuery = await db
    .collection("timesheets")
    .where("employeeId", "==", TEST_DATA.employees.employeeA)
    .get();

  employeeATimesheetsQuery.docs.forEach((doc) => {
    batch.update(doc.ref, {
      adminApproved: true,
      updatedAt: Timestamp.now(),
    });
  });

  // Leave Employee B's entries unapproved
  log("Employee B timesheets left unapproved");

  await batch.commit();
  log("Admin approvals processed");

  // Verify admin approvals
  const adminApprovedQuery = await db
    .collection("timesheets")
    .where("adminApproved", "==", true)
    .get();

  log(`Admin approved timesheets: ${adminApprovedQuery.size}`);
}

async function step6_CreatePayrollRun() {
  log("Step 6: Creating payroll run...");

  const lastPeriodStart = new Date();
  lastPeriodStart.setDate(lastPeriodStart.getDate() - 14);
  const lastPeriodEnd = new Date(lastPeriodStart);
  lastPeriodEnd.setDate(lastPeriodEnd.getDate() + 14);

  // Create payroll run
  const runRef = await db.collection("payrollRuns").add({
    periodStart: Timestamp.fromDate(lastPeriodStart),
    periodEnd: Timestamp.fromDate(lastPeriodEnd),
    status: "draft",
    createdAt: Timestamp.now(),
    createdBy: "test-script",
    totalHours: 0,
    totalEarnings: 0,
    byEmployee: {},
  });

  log(`Created payroll run: ${runRef.id}`);

  // Approve Employee A's timesheets into the run
  const employeeATimesheetsQuery = await db
    .collection("timesheets")
    .where("employeeId", "==", TEST_DATA.employees.employeeA)
    .where("adminApproved", "==", true)
    .where("employeeApproved", "==", true)
    .get();

  const batch = db.batch();
  employeeATimesheetsQuery.docs.forEach((doc) => {
    batch.update(doc.ref, {
      approvedInRunId: runRef.id,
      updatedAt: Timestamp.now(),
    });
  });

  await batch.commit();
  log(`Approved ${employeeATimesheetsQuery.size} timesheets into run`);

  return runRef.id;
}

async function step7_CalculateTotals(runId) {
  log("Step 7: Calculating payroll run totals...");

  // Get approved timesheets for this run
  const timesheetsQuery = await db
    .collection("timesheets")
    .where("approvedInRunId", "==", runId)
    .get();

  const totals = {
    byEmployee: {},
    totalHours: 0,
    totalEarnings: 0,
  };

  timesheetsQuery.docs.forEach((doc) => {
    const timesheet = doc.data();
    const employeeId = timesheet.employeeId;
    const hours = Number(timesheet.hours || 0);
    const units = Number(timesheet.units || 1);

    let earnings = 0;
    let rate = 0;

    if (timesheet.rateSnapshot?.type === "per_visit") {
      rate = Number(timesheet.rateSnapshot.amount || 0);
      earnings = Math.round((rate * units + Number.EPSILON) * 100) / 100;
    } else if (timesheet.rateSnapshot?.type === "hourly") {
      rate = Number(timesheet.rateSnapshot.amount || 0);
      earnings = Math.round((rate * hours + Number.EPSILON) * 100) / 100;
    }

    const current = totals.byEmployee[employeeId] || {
      hours: 0,
      earnings: 0,
      hourlyRate: rate || undefined,
    };

    current.hours += hours;
    current.earnings = Math.round((current.earnings + earnings) * 100) / 100;
    if (!current.hourlyRate && rate) current.hourlyRate = rate;

    totals.byEmployee[employeeId] = current;
    totals.totalHours += hours;
    totals.totalEarnings =
      Math.round((totals.totalEarnings + earnings) * 100) / 100;
  });

  // Round totals
  totals.totalHours = Math.round(totals.totalHours * 100) / 100;
  totals.totalEarnings = Math.round(totals.totalEarnings * 100) / 100;

  // Update run with totals and lock it
  await db.collection("payrollRuns").doc(runId).update({
    status: "locked",
    totals: totals,
    totalEarnings: totals.totalEarnings,
    updatedAt: Timestamp.now(),
  });

  log("Payroll run locked with totals:", totals);

  return totals;
}

async function step8_VerifyResults() {
  log("Step 8: Verifying final results...");

  // Get locked payroll runs
  const runsQuery = await db
    .collection("payrollRuns")
    .where("status", "==", "locked")
    .where("createdBy", "==", "test-script")
    .get();

  if (runsQuery.empty) {
    log("No locked payroll runs found");
    return;
  }

  const run = runsQuery.docs[0].data();
  log("Final payroll run totals:", run.totals);

  // Manual verification
  const expectedEmployeeA = TEST_DATA.rates.employeeAPerVisit * 2; // 2 jobs
  const actualEmployeeA =
    run.totals.byEmployee[TEST_DATA.employees.employeeA]?.earnings || 0;

  log(
    `Employee A expected: $${expectedEmployeeA}, actual: $${actualEmployeeA}`
  );
  log(
    `Employee A hours expected: 0, actual: ${
      run.totals.byEmployee[TEST_DATA.employees.employeeA]?.hours || 0
    }`
  );

  // Employee B should not be in totals since not approved
  const employeeBInTotals =
    run.totals.byEmployee[TEST_DATA.employees.employeeB];
  log(
    `Employee B in totals: ${employeeBInTotals ? "Yes" : "No"} (should be No)`
  );

  log(`Total earnings: $${run.totals.totalEarnings}`);
  log(`Total hours: ${run.totals.totalHours}`);

  // Success criteria
  const success = actualEmployeeA === expectedEmployeeA && !employeeBInTotals;
  log(`Payroll loop verification: ${success ? "SUCCESS" : "FAILED"}`);

  return success;
}

async function runFullPayrollLoopTest() {
  try {
    log("Starting full payroll loop verification test...");

    await cleanupTestData();
    await step1_SetupRates();
    await step2_CreateJobs();
    await step3_ScanAndGenerateTimesheets();
    await step4_EmployeeApprovals();
    await step5_AdminApprovals();
    const runId = await step6_CreatePayrollRun();
    await step7_CalculateTotals(runId);
    const success = await step8_VerifyResults();

    log("Full payroll loop test completed");
    return success;
  } catch (error) {
    log("Error during payroll loop test:", error);
    return false;
  }
}

// Export for use in other scripts
module.exports = {
  runFullPayrollLoopTest,
  cleanupTestData,
  TEST_DATA,
};

// Run test if called directly
if (require.main === module) {
  runFullPayrollLoopTest()
    .then((success) => {
      console.log(`Test completed with ${success ? "SUCCESS" : "FAILURE"}`);
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Test failed:", error);
      process.exit(1);
    });
}
