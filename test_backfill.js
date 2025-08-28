const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} = require("firebase/firestore");
const {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} = require("firebase/functions");

// Firebase config (replace with your actual config)
const firebaseConfig = {
  apiKey: "test-api-key",
  authDomain: "test-project.firebaseapp.com",
  projectId: "test-project",
  storageBucket: "test-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "test-app-id",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const functions = getFunctions(app);

// Connect to emulator
connectFunctionsEmulator(functions, "localhost", 5001);

async function testBackfillRateSnapshots() {
  try {
    console.log("Testing backfillRateSnapshots function...");

    // Test data setup
    const testEmployeeId = "test-employee-123";
    const testDate = new Date("2024-01-15T10:00:00Z");

    // Create test employee rate
    console.log("Creating test employee rate...");
    const rateData = {
      employeeId: testEmployeeId,
      rateType: "hourly",
      hourlyRate: 25.0,
      effectiveDate: testDate,
      createdAt: new Date(),
    };

    const rateRef = await addDoc(collection(db, "employeeRates"), rateData);
    console.log("Created employee rate:", rateRef.id);

    // Create test timesheet without rateSnapshot
    console.log("Creating test timesheet without rateSnapshot...");
    const timesheetData = {
      employeeId: testEmployeeId,
      start: testDate,
      end: new Date(testDate.getTime() + 8 * 60 * 60 * 1000), // 8 hours later
      hours: 8,
      jobId: "test-job-123",
      employeeApproved: false,
      adminApproved: false,
      createdAt: new Date(),
    };

    const timesheetRef = await addDoc(
      collection(db, "timesheets"),
      timesheetData
    );
    console.log("Created timesheet:", timesheetRef.id);

    // Call backfill function
    console.log("Calling backfillRateSnapshots...");
    const backfillFunction = httpsCallable(functions, "backfillRateSnapshots");

    const startDate = new Date("2024-01-01");
    const endDate = new Date("2024-01-31");

    const result = await backfillFunction({
      startDate: startDate.getTime(),
      endDate: endDate.getTime(),
    });

    console.log("Backfill result:", result.data);

    // Verify the timesheet was updated
    console.log("Verifying timesheet was updated...");
    const updatedTimesheet = await getDoc(
      doc(db, "timesheets", timesheetRef.id)
    );
    const updatedData = updatedTimesheet.data();

    console.log("Updated timesheet data:", updatedData);

    if (updatedData.rateSnapshot) {
      console.log(
        "✅ SUCCESS: Timesheet now has rateSnapshot:",
        updatedData.rateSnapshot
      );
    } else {
      console.log("❌ FAILED: Timesheet still missing rateSnapshot");
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testBackfillRateSnapshots();
