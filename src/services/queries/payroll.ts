import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  getDoc,
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../firebase";

export type RunTotals = {
  byEmployee: Record<
    string,
    { hours: number; earnings: number; hourlyRate?: number }
  >;
  totalHours: number;
  totalEarnings: number;
};

function ensureApp() {
  if (!getApps().length) initializeApp(firebaseConfig);
}

async function getEffectiveHourlyRate(
  employeeId: string,
  effectiveAt: Timestamp
): Promise<number> {
  ensureApp();
  const db = getFirestore();
  const qy = query(
    collection(db, "employeeRates"),
    where("employeeId", "==", employeeId),
    where("effectiveDate", "<=", effectiveAt),
    orderBy("effectiveDate", "desc"),
    limit(1)
  );
  const snap = await getDocs(qy);
  if (snap.empty) return 0;
  const d = snap.docs[0].data() as any;
  return Number(d?.hourlyRate || 0) || 0;
}

export async function calculateRunTotals(runId: string): Promise<RunTotals> {
  if (!runId) throw new Error("runId required");
  ensureApp();
  const db = getFirestore();
  const runRef = doc(db, "payrollRuns", runId);
  const runSnap = await getDoc(runRef);
  if (!runSnap.exists()) throw new Error("Run not found");
  const run: any = runSnap.data();
  const periodStart: Timestamp = run?.periodStart;
  const periodEnd: Timestamp = run?.periodEnd;
  if (!periodStart || !periodEnd) throw new Error("Run missing period");

  // Include only timesheets explicitly approved into this run
  const tsQ = query(
    collection(db, "timesheets"),
    where("approvedInRunId", "==", runId),
    orderBy("employeeId", "asc"),
    orderBy("start", "asc")
  );
  const tsSnap = await getDocs(tsQ);

  const totals: RunTotals = { byEmployee: {}, totalHours: 0, totalEarnings: 0 };
  const rateCache = new Map<string, number>();

  for (const d of tsSnap.docs) {
    const row = d.data() as any;
    const employeeId: string = row?.employeeId;
    const hours = Number(row?.hours || 0) || 0;
    if (!employeeId || hours <= 0) continue;

    // Determine rate: prefer embedded snapshot
    let rate = Number(row?.rateSnapshot?.hourlyRate || 0) || 0;
    if (!rate) {
      const startTs: Timestamp = row?.start;
      const cacheKey = `${employeeId}|${startTs?.seconds || "0"}`;
      if (rateCache.has(cacheKey)) rate = rateCache.get(cacheKey)!;
      else {
        rate = await getEffectiveHourlyRate(employeeId, startTs);
        rateCache.set(cacheKey, rate);
      }
    }

    const earnings = Math.round((hours * rate + Number.EPSILON) * 100) / 100;
    const cur = totals.byEmployee[employeeId] || {
      hours: 0,
      earnings: 0,
      hourlyRate: rate || undefined,
    };
    cur.hours += hours;
    cur.earnings = Math.round((cur.earnings + earnings) * 100) / 100;
    if (!cur.hourlyRate && rate) cur.hourlyRate = rate;
    totals.byEmployee[employeeId] = cur;
    totals.totalHours += hours;
    totals.totalEarnings =
      Math.round((totals.totalEarnings + earnings) * 100) / 100;
  }

  // Round totals
  totals.totalHours = Math.round(totals.totalHours * 100) / 100;
  totals.totalEarnings = Math.round(totals.totalEarnings * 100) / 100;
  return totals;
}

export async function approveTimesheets(
  runId: string,
  timesheetIds: string[]
): Promise<{ count: number }> {
  if (!runId) throw new Error("runId required");
  if (!Array.isArray(timesheetIds) || timesheetIds.length === 0)
    return { count: 0 };
  ensureApp();
  const db = getFirestore();
  const batch = writeBatch(db);
  let count = 0;
  for (const id of timesheetIds) {
    if (!id) continue;
    batch.update(doc(db, "timesheets", id), {
      approvedInRunId: runId,
      updatedAt: Timestamp.now(),
    } as any);
    count += 1;
  }
  await batch.commit();
  return { count };
}
