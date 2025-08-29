import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  writeBatch as firestoreWriteBatch,
} from "firebase/firestore";

// Firebase init shared with V1 project (no migrations). Paste your existing config into .env.
// Expected env vars:
// VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
// VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID, VITE_FIREBASE_MEASUREMENT_ID

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// README:
// Create a .env.local in project root with:
// VITE_FIREBASE_API_KEY="<from V1>"
// VITE_FIREBASE_AUTH_DOMAIN="cleveland-clean-portal.firebaseapp.com"
// VITE_FIREBASE_PROJECT_ID="cleveland-clean-portal"
// VITE_FIREBASE_STORAGE_BUCKET="cleveland-clean-portal.firebasestorage.app"
// VITE_FIREBASE_MESSAGING_SENDER_ID="938625547862"
// VITE_FIREBASE_APP_ID="1:938625547862:web:3655b2b380b858702705f7"
// VITE_FIREBASE_MEASUREMENT_ID="G-7KZMMKZ1XW"

/**
 * Compute the start and end of the calendar day for a given Timestamp/Date
 * in a specific IANA time zone, returning concrete UTC Date instances
 * suitable for Firestore range queries.
 */
export function makeDayBounds(
  ts: any,
  timeZone: string
): { start: Date; end: Date } {
  const date: Date = ts?.toDate
    ? ts.toDate()
    : ts instanceof Date
    ? ts
    : new Date();
  const ymdParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parseInt(
    ymdParts.find((p) => p.type === "year")?.value || "1970",
    10
  );
  const month = parseInt(
    ymdParts.find((p) => p.type === "month")?.value || "01",
    10
  );
  const day = parseInt(
    ymdParts.find((p) => p.type === "day")?.value || "01",
    10
  );

  // Determine the numeric GMT offset for the provided time zone at the given date.
  // Example values: "GMT-4", "GMT-5".
  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset",
    hour12: false,
  }).formatToParts(date);
  const tzName = tzParts.find((p) => p.type === "timeZoneName")?.value || "GMT";

  const offsetMs = parseGmtOffsetToMs(tzName);
  // Local midnight in target time zone expressed as UTC components
  const localStartMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const localEndMs = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  // Convert local wall time to absolute UTC instants.
  // local = UTC + offset  =>  UTC = local - offset
  const start = new Date(localStartMs - offsetMs);
  const end = new Date(localEndMs - offsetMs);
  return { start, end };
}

function parseGmtOffsetToMs(label: string): number {
  // Accept variants like "GMT", "GMT+0", "GMT-4", "UTC-05:00" etc.
  const m = label.match(/([+-]?)(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = parseInt(m[2] || "0", 10);
  const mins = parseInt(m[3] || "0", 10);
  const total = sign * (hours * 60 + mins) * 60 * 1000;
  // For labels like "GMT-4" the sign is negative meaning UTC-4; the above yields -4h.
  return total;
}

/**
 * Merge two arrays of items uniquely by `id`, preserving primary order first
 * and then appending any fallback items not present in primary.
 */
export function mergePhotoResults<T extends { id: string }>(
  primary: T[],
  fallback: T[]
): T[] {
  const seen = new Set(primary.map((p) => p.id));
  const merged: T[] = primary.slice();
  for (const f of fallback) {
    if (!seen.has(f.id)) merged.push(f);
  }
  return merged;
}

/**
 * Archive service records before a specific date
 */
export async function archiveServiceRecords(
  cutoffDate: Date
): Promise<{ archived: number; errors: number }> {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  try {
    // Query for records before the cutoff date that are not already archived
    // Note: We need to handle both undefined and false values for archived field
    const q = query(
      collection(db, "serviceHistory"),
      where("serviceDate", "<", Timestamp.fromDate(cutoffDate))
      // We'll filter out archived records in the code since Firestore doesn't handle undefined well
    );

    const snapshot = await getDocs(q);

    // Filter out already archived records (handle both undefined and false values)
    const docsToArchive = snapshot.docs.filter((doc) => {
      const data = doc.data();
      return data.archived !== true; // Only archive if archived is not explicitly true
    });

    console.log(`Found ${snapshot.size} total records before cutoff date`);
    console.log(
      `Found ${docsToArchive.length} records to archive (excluding already archived)`
    );

    const batchSize = 10; // Firestore batch write limit is 500, but we'll use smaller batches
    let archived = 0;
    let errors = 0;

    // Process in batches to avoid hitting Firestore limits
    for (let i = 0; i < docsToArchive.length; i += batchSize) {
      const batch = docsToArchive.slice(i, i + batchSize);
      const batchWrite = firestoreWriteBatch(db);

      batch.forEach((doc) => {
        batchWrite.update(doc.ref, {
          archived: true,
          archivedAt: Timestamp.now(),
          archivedBy: "system", // You might want to pass the current user here
        });
      });

      try {
        await batchWrite.commit();
        archived += batch.length;
      } catch (error) {
        console.error("Error archiving batch:", error);
        errors += batch.length;
      }
    }

    return { archived, errors };
  } catch (error) {
    console.error("Error archiving service records:", error);
    throw error;
  }
}
