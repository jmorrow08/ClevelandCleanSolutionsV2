import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  documentId,
} from "firebase/firestore";
import { firebaseConfig } from "../firebase";

// Lightweight in-memory caches for the session
const clientNameCache = new Map<string, string>();
const locationNameCache = new Map<string, string>();
const employeeNameCache = new Map<string, string>();

// Deduplicate concurrent lookups
const pendingClientLookups = new Map<string, Promise<string>>();
const pendingLocationLookups = new Map<string, Promise<string>>();
const pendingEmployeeLookups = new Map<string, Promise<string>>();

function ensureApp() {
  if (!getApps().length) initializeApp(firebaseConfig);
}

export async function getClientName(clientId?: string | null): Promise<string> {
  if (!clientId) return "Client";
  if (clientNameCache.has(clientId)) return clientNameCache.get(clientId)!;
  if (pendingClientLookups.has(clientId))
    return pendingClientLookups.get(clientId)!;

  ensureApp();
  const db = getFirestore();
  const p = (async () => {
    try {
      const ref = doc(db, "clientMasterList", clientId);
      const snap = await getDoc(ref);
      const d = snap.data() || {};
      const name = (d as any).companyName || (d as any).name || "Client";
      clientNameCache.set(clientId, name);
      return name;
    } catch (e) {
      const fallback = clientId;
      clientNameCache.set(clientId, fallback);
      return fallback;
    } finally {
      pendingClientLookups.delete(clientId);
    }
  })();
  pendingClientLookups.set(clientId, p);
  return p;
}

// Allow priming new values so UI can reflect immediately after creation
export function primeClientName(clientId: string, name: string) {
  if (!clientId) return;
  clientNameCache.set(clientId, name || clientId);
}

export async function getLocationName(
  locationId?: string | null
): Promise<string> {
  if (!locationId) return "Location";
  if (locationNameCache.has(locationId))
    return locationNameCache.get(locationId)!;
  if (pendingLocationLookups.has(locationId))
    return pendingLocationLookups.get(locationId)!;

  ensureApp();
  const db = getFirestore();
  const p = (async () => {
    try {
      const ref = doc(db, "locations", locationId);
      const snap = await getDoc(ref);
      const d = snap.data() || {};
      const name = (d as any).locationName || (d as any).name || "Location";
      locationNameCache.set(locationId, name);
      return name;
    } catch (e) {
      const fallback = locationId;
      locationNameCache.set(locationId, fallback);
      return fallback;
    } finally {
      pendingLocationLookups.delete(locationId);
    }
  })();
  pendingLocationLookups.set(locationId, p);
  return p;
}

export function primeLocationName(locationId: string, name: string) {
  if (!locationId) return;
  locationNameCache.set(locationId, name || locationId);
}

async function getEmployeeName(employeeId: string): Promise<string> {
  if (employeeNameCache.has(employeeId))
    return employeeNameCache.get(employeeId)!;
  if (pendingEmployeeLookups.has(employeeId))
    return pendingEmployeeLookups.get(employeeId)!;

  ensureApp();
  const db = getFirestore();
  const p = (async () => {
    try {
      // Primary source: employeeMasterList
      const ref = doc(db, "employeeMasterList", employeeId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data() || {};
        const name = (d as any).fullName || (d as any).name || "Employee";
        employeeNameCache.set(employeeId, name);
        return name;
      }
      // Fallback: users collection by uid
      const userRef = doc(db, "users", employeeId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const u = userSnap.data() || {};
        const name = (u as any).displayName || (u as any).name || "Employee";
        employeeNameCache.set(employeeId, name);
        return name;
      }
      const fallback = employeeId;
      employeeNameCache.set(employeeId, fallback);
      return fallback;
    } catch (e) {
      const fallback = employeeId;
      employeeNameCache.set(employeeId, fallback);
      return fallback;
    } finally {
      pendingEmployeeLookups.delete(employeeId);
    }
  })();
  pendingEmployeeLookups.set(employeeId, p);
  return p;
}

// Utility: chunk an array into groups of a maximum size
function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }
  return result;
}

// Batched client names with cache and deduplication
export async function getClientNames(
  clientIds?: Array<string | null | undefined>
): Promise<string[]> {
  if (!Array.isArray(clientIds) || clientIds.length === 0) return [];
  const ids = clientIds.filter(
    (v): v is string => typeof v === "string" && !!v
  );

  // Determine which IDs we still need to fetch from the backend
  const uniqueIds = Array.from(new Set(ids));
  const toAwait: Array<Promise<void>> = [];
  const toFetch: string[] = [];

  for (const id of uniqueIds) {
    if (clientNameCache.has(id)) continue;
    if (pendingClientLookups.has(id)) {
      toAwait.push(
        pendingClientLookups.get(id)!.then((name) => {
          clientNameCache.set(id, name);
        })
      );
      continue;
    }
    toFetch.push(id);
  }

  if (toFetch.length) {
    ensureApp();
    const db = getFirestore();
    const col = collection(db, "clientMasterList");
    // Firestore `in` supports up to 10 values per query
    const batches = chunkArray(toFetch, 10);
    const batchPromises = batches.map(async (batchIds) => {
      const qy = query(col, where(documentId(), "in", batchIds));
      const snap = await getDocs(qy);
      const found = new Set<string>();
      snap.forEach((d) => {
        const data = d.data() as any;
        const name = data?.companyName || data?.name || d.id;
        clientNameCache.set(d.id, name);
        found.add(d.id);
      });
      // Fallbacks for missing docs
      batchIds.forEach((id) => {
        if (!found.has(id)) clientNameCache.set(id, id);
      });
    });
    const pending = Promise.all(batchPromises).finally(() => {
      // Clear pending markers for this batch
      batchIdsClear(pendingClientLookups, toFetch);
    });
    // Mark all pending to avoid duplicate concurrent queries
    toFetch.forEach((id) =>
      pendingClientLookups.set(
        id,
        pending.then(() => clientNameCache.get(id)!)
      )
    );
    await Promise.all([pending, ...toAwait]);
  } else if (toAwait.length) {
    await Promise.all(toAwait);
  }

  // Return names in the same order as provided
  return ids.map((id) => clientNameCache.get(id) || id);
}

// Batched location names with cache and deduplication
export async function getLocationNames(
  locationIds?: Array<string | null | undefined>
): Promise<string[]> {
  if (!Array.isArray(locationIds) || locationIds.length === 0) return [];
  const ids = locationIds.filter(
    (v): v is string => typeof v === "string" && !!v
  );

  const uniqueIds = Array.from(new Set(ids));
  const toAwait: Array<Promise<void>> = [];
  const toFetch: string[] = [];

  for (const id of uniqueIds) {
    if (locationNameCache.has(id)) continue;
    if (pendingLocationLookups.has(id)) {
      toAwait.push(
        pendingLocationLookups.get(id)!.then((name) => {
          locationNameCache.set(id, name);
        })
      );
      continue;
    }
    toFetch.push(id);
  }

  if (toFetch.length) {
    ensureApp();
    const db = getFirestore();
    const col = collection(db, "locations");
    const batches = chunkArray(toFetch, 10);
    const batchPromises = batches.map(async (batchIds) => {
      const qy = query(col, where(documentId(), "in", batchIds));
      const snap = await getDocs(qy);
      const found = new Set<string>();
      snap.forEach((d) => {
        const data = d.data() as any;
        const name = data?.locationName || data?.name || d.id;
        locationNameCache.set(d.id, name);
        found.add(d.id);
      });
      batchIds.forEach((id) => {
        if (!found.has(id)) locationNameCache.set(id, id);
      });
    });
    const pending = Promise.all(batchPromises).finally(() => {
      batchIdsClear(pendingLocationLookups, toFetch);
    });
    toFetch.forEach((id) =>
      pendingLocationLookups.set(
        id,
        pending.then(() => locationNameCache.get(id)!)
      )
    );
    await Promise.all([pending, ...toAwait]);
  } else if (toAwait.length) {
    await Promise.all(toAwait);
  }

  return ids.map((id) => locationNameCache.get(id) || id);
}

// Helper to clear pending maps after batch resolution
function batchIdsClear(map: Map<string, any>, ids: string[]) {
  ids.forEach((id) => map.delete(id));
}

// Batched employee names (keeps return order). Uses employeeMasterList first, then users.
export async function getEmployeeNames(
  employeeIds?: Array<string | null | undefined>
): Promise<string[]> {
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) return [];
  const ids = employeeIds.filter(
    (v): v is string => typeof v === "string" && !!v
  );

  const uniqueIds = Array.from(new Set(ids));
  const toAwait: Array<Promise<void>> = [];
  const toFetch: string[] = [];

  for (const id of uniqueIds) {
    if (employeeNameCache.has(id)) continue;
    if (pendingEmployeeLookups.has(id)) {
      toAwait.push(
        pendingEmployeeLookups.get(id)!.then((name) => {
          employeeNameCache.set(id, name);
        })
      );
      continue;
    }
    toFetch.push(id);
  }

  if (toFetch.length) {
    ensureApp();
    const db = getFirestore();
    const masterCol = collection(db, "employeeMasterList");
    const userCol = collection(db, "users");
    const batches = chunkArray(toFetch, 10);
    const batchPromises = batches.map(async (batchIds) => {
      const found = new Set<string>();
      // First: employeeMasterList
      const masterQ = query(masterCol, where(documentId(), "in", batchIds));
      const masterSnap = await getDocs(masterQ);
      masterSnap.forEach((d) => {
        const v = d.data() as any;
        const name = v?.fullName || v?.name || d.id;
        employeeNameCache.set(d.id, name);
        found.add(d.id);
      });
      // Fallback to users
      const missing = batchIds.filter((id) => !found.has(id));
      if (missing.length) {
        const userQ = query(userCol, where(documentId(), "in", missing));
        const userSnap = await getDocs(userQ);
        const userFound = new Set<string>();
        userSnap.forEach((d) => {
          const v = d.data() as any;
          const name = v?.displayName || v?.name || d.id;
          employeeNameCache.set(d.id, name);
          userFound.add(d.id);
        });
        missing.forEach((id) => {
          if (!userFound.has(id)) employeeNameCache.set(id, id);
        });
      }
    });
    const pending = Promise.all(batchPromises).finally(() => {
      batchIdsClear(pendingEmployeeLookups, toFetch);
    });
    toFetch.forEach((id) =>
      pendingEmployeeLookups.set(
        id,
        pending.then(() => employeeNameCache.get(id)!)
      )
    );
    await Promise.all([pending, ...toAwait]);
  } else if (toAwait.length) {
    await Promise.all(toAwait);
  }

  return ids.map((id) => employeeNameCache.get(id) || id);
}

// === Analytics resolvers ===
import {
  initializeApp as initApp,
  getApps as getClientApps,
} from "firebase/app";
import {
  getFirestore as getFs,
  collection as fsCollection,
  query as fsQuery,
  orderBy as fsOrderBy,
  limit as fsLimit,
  getDocs as fsGetDocs,
  where as fsWhere,
} from "firebase/firestore";
import { firebaseConfig as fbConfig } from "../firebase";

function ensureClientApp() {
  if (!getClientApps().length) initApp(fbConfig);
}

export type DailyKpis = {
  revenue: number;
  arBuckets: {
    current: number;
    "30": number;
    "60": number;
    "90": number;
    totalOutstanding: number;
  };
  payrollCost?: number;
  payrollPct: number;
  jobsCompleted: number;
  newLeads: number;
  churnRate: number;
};

export type AnalyticsDailyDoc = {
  date?: any;
  dateKey?: number;
  kpis?: DailyKpis;
  meta?: { computedAt?: any; version?: number; sourceLagDays?: number };
};

export async function getLatestDailyAnalytics(): Promise<AnalyticsDailyDoc | null> {
  ensureClientApp();
  const db = getFs();
  const q = fsQuery(
    fsCollection(db, "analyticsDaily"),
    fsOrderBy("dateKey", "desc"),
    fsLimit(1)
  );
  const snap = await fsGetDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as any;
}

export async function getDailyRange(startKey: number, endKey: number) {
  ensureClientApp();
  const db = getFs();
  const q = fsQuery(
    fsCollection(db, "analyticsDaily"),
    fsWhere("dateKey", ">=", startKey),
    fsWhere("dateKey", "<=", endKey),
    fsOrderBy("dateKey", "asc")
  );
  const snap = await fsGetDocs(q);
  return snap.docs.map((d) => d.data() as any);
}

export async function getMonthlyRange(
  startMonthKey: number,
  endMonthKey: number
) {
  ensureClientApp();
  const db = getFs();
  const q = fsQuery(
    fsCollection(db, "analyticsMonthly"),
    fsWhere("monthKey", ">=", startMonthKey),
    fsWhere("monthKey", "<=", endMonthKey),
    fsOrderBy("monthKey", "asc")
  );
  const snap = await fsGetDocs(q);
  return snap.docs.map((d) => d.data() as any);
}
