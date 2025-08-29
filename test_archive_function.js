// Test script for archiveServiceRecords function
// Run with: node test_archive_function.js

const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} = require("firebase/firestore");

// Firebase config (you'll need to provide your actual config)
const firebaseConfig = {
  // Add your Firebase config here
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  // ... other config
};

async function testArchiveQuery() {
  console.log("Testing archive function query logic...");

  try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    // Test: Count records before 8/1/2025 that are not archived
    const cutoffDate = new Date("2025-08-01T00:00:00");
    const q = query(
      collection(db, "serviceHistory"),
      where("serviceDate", "<", Timestamp.fromDate(cutoffDate)),
      where("archived", "!=", true)
    );

    const snapshot = await getDocs(q);
    console.log(
      `Found ${snapshot.size} records that would be archived (before 8/1/2025, not already archived)`
    );

    // Show a few sample records
    if (snapshot.size > 0) {
      console.log("Sample records to be archived:");
      snapshot.docs.slice(0, 3).forEach((doc, index) => {
        const data = doc.data();
        console.log(
          `${index + 1}. ID: ${doc.id}, Date: ${data.serviceDate
            ?.toDate()
            ?.toLocaleDateString()}`
        );
      });
    }

    console.log("Query test completed successfully!");
  } catch (error) {
    console.error("Error testing archive query:", error);
  }
}

// Run the test
testArchiveQuery();
