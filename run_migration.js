#!/usr/bin/env node

/**
 * Migration Runner Script
 * This script runs the targeted payroll migration
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";

// Import Firebase config - you'll need to replace this with your actual config
const firebaseConfig = {
  // Replace with your actual Firebase config from firebase.ts
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log("🔄 Starting Payroll Migration...");
console.log("📅 Target: Jobs from 8/10/2025 onwards");
console.log("📦 Archiving: Jobs before 8/10/2025");

async function runMigration() {
  try {
    console.log("\n1️⃣ Analyzing current payroll state...");

    // Import and run analysis
    const { analyzePayrollState } = await import(
      "./src/services/payrollCleanup.js"
    );
    const analysis = await analyzePayrollState();
    console.log("✅ Analysis complete:", {
      jobs: analysis.jobs,
      payrollRuns: analysis.payrollRuns,
      timesheets: analysis.timesheets,
    });

    console.log("\n2️⃣ Archiving old jobs (before 8/10/2025)...");

    // Archive old jobs
    const { collection, query, where, getDocs, writeBatch } = await import(
      "firebase/firestore"
    );
    const cutoffDate = new Date("2025-08-10");

    const oldJobsQuery = query(
      collection(db, "serviceHistory"),
      where("serviceDate", "<", cutoffDate)
    );

    const oldJobsSnap = await getDocs(oldJobsQuery);
    const oldJobs = oldJobsSnap.docs;

    if (oldJobs.length > 0) {
      const batch = writeBatch(db);
      oldJobs.forEach((jobDoc) => {
        batch.update(jobDoc.ref, {
          archived: true,
          archivedAt: new Date(),
          payrollProcessed: false,
        });
      });
      await batch.commit();
      console.log(`✅ Archived ${oldJobs.length} old jobs`);
    } else {
      console.log("ℹ️ No old jobs found to archive");
    }

    console.log("\n3️⃣ Cleaning up incorrectly processed jobs...");

    const { cleanupProcessedJobsWithoutRuns } = await import(
      "./src/services/payrollCleanup.js"
    );
    const cleanupResult = await cleanupProcessedJobsWithoutRuns();
    console.log("✅ Cleanup result:", cleanupResult);

    console.log("\n4️⃣ Processing clock events from 8/10/2025 onwards...");

    const { processClockEventsForTimesheets } = await import(
      "./src/services/automation/timesheetAutomation.js"
    );
    const startDate = new Date("2025-08-10");
    const endDate = new Date();

    const clockResult = await processClockEventsForTimesheets(
      startDate,
      endDate
    );
    console.log("✅ Clock processing result:", clockResult);

    console.log("\n🎉 Migration Complete!");
    console.log("📋 Summary:");
    console.log(`   • Jobs archived: ${oldJobs.length}`);
    console.log(`   • Timesheets processed: ${clockResult.processed}`);
    console.log(`   • Timesheets skipped: ${clockResult.skipped}`);
    console.log("\n🚀 Ready for jobs from 8/10/2025 onwards!");
    console.log("\n💡 Next steps:");
    console.log("   1. Go to Finance → Weekly Review");
    console.log("   2. Go to Finance → Payroll Admin");
    console.log("   3. New jobs will auto-create timesheets from clock events");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
runMigration().catch(console.error);
