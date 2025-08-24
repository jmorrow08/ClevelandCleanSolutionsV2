import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
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

export async function getEmployeeNames(
  employeeIds?: Array<string | null | undefined>
): Promise<string[]> {
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) return [];
  const ids = employeeIds.filter(
    (v): v is string => typeof v === "string" && !!v
  );
  const promises = ids.map((id) => getEmployeeName(id));
  const names = await Promise.all(promises);
  return names.filter(Boolean);
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
