import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { firebaseConfig } from "../../services/firebase";
import { getEmployeeNames } from "../../services/queries/resolvers";
import {
  mapLegacyStatus,
  type CanonicalStatus,
} from "../../services/statusMap";

type ServiceJob = {
  id: string;
  serviceDate?: any;
  status?: string | null;
  clientProfileId?: string | null;
  locationId?: string | null;
  assignedEmployees?: string[];
};

export type DateWindow = {
  start?: Date | null;
  end?: Date | null;
};

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  return null;
}

function formatYMD(d?: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function EmployeeJobsByWindow({
  window: selected,
}: {
  window?: DateWindow;
}) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [employeeNameMap, setEmployeeNameMap] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState<string | null>(null);

  // Compute normalized start/end (inclusive start, exclusive end)
  const { start, end } = useMemo(() => {
    const s = selected?.start ? new Date(selected.start) : null;
    const e = selected?.end ? new Date(selected.end) : null;
    if (s) s.setHours(0, 0, 0, 0);
    if (e) {
      // make end exclusive by adding one day and zeroing time
      const ex = new Date(e);
      ex.setDate(ex.getDate() + 1);
      ex.setHours(0, 0, 0, 0);
      return { start: s, end: ex } as const;
    }
    return { start: s, end: e } as const;
  }, [selected?.start, selected?.end]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        const parts: any[] = [];
        if (start)
          parts.push(where("serviceDate", ">=", Timestamp.fromDate(start)));
        if (end) parts.push(where("serviceDate", "<", Timestamp.fromDate(end)));
        parts.push(orderBy("serviceDate", "desc"));

        const qy = query(collection(db, "serviceHistory"), ...parts);
        const snap = await getDocs(qy);
        const rows: ServiceJob[] = [];
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
        setJobs(rows);
      } catch (e: any) {
        setError(e?.message || "Failed to load service history");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [start, end]);

  // Resolve employee names for all assignedEmployees
  useEffect(() => {
    (async () => {
      const allIds = Array.from(
        new Set(
          jobs
            .flatMap((j) =>
              Array.isArray(j.assignedEmployees) ? j.assignedEmployees : []
            )
            .filter((v): v is string => typeof v === "string" && !!v)
        )
      );
      if (allIds.length === 0) return;
      const names = await getEmployeeNames(allIds);
      setEmployeeNameMap((prev) => {
        const next = { ...prev } as Record<string, string>;
        allIds.forEach((id, i) => (next[id] = names[i] || id));
        return next;
      });
    })();
  }, [jobs]);

  // Group jobs by employee id
  const grouped = useMemo(() => {
    const map = new Map<string, ServiceJob[]>();
    for (const j of jobs) {
      const assigned = Array.isArray(j.assignedEmployees)
        ? j.assignedEmployees
        : [];
      if (assigned.length === 0) {
        const key = "(unassigned)";
        map.set(key, [...(map.get(key) || []), j]);
        continue;
      }
      for (const empId of assigned) {
        map.set(empId, [...(map.get(empId) || []), j]);
      }
    }
    // Sort each employee's jobs by date desc
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        const ad = toDate(a.serviceDate)?.getTime() || 0;
        const bd = toDate(b.serviceDate)?.getTime() || 0;
        return bd - ad;
      });
    }
    return map;
  }, [jobs]);

  const header = useMemo(() => {
    if (!selected?.start && !selected?.end) return "All Jobs";
    const s = formatYMD(selected?.start || null);
    const e = formatYMD(selected?.end || null);
    if (s && e) return `${s} → ${e}`;
    if (s) return `${s} →`;
    if (e) return `→ ${e}`;
    return "";
  }, [selected?.start, selected?.end]);

  return (
    <div className="space-y-3">
      <div className="text-sm text-zinc-500">{header}</div>
      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : grouped.size === 0 ? (
        <div className="text-sm text-zinc-500">No jobs found.</div>
      ) : (
        Array.from(grouped.entries()).map(([empId, list]) => {
          const label =
            empId === "(unassigned)" ? empId : employeeNameMap[empId] || empId;
          return (
            <div key={empId} className="rounded-lg card-bg shadow-elev-1">
              <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-700 font-medium">
                {label}
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
                {list.map((j) => {
                  const d = toDate(j.serviceDate);
                  const s: CanonicalStatus | undefined = mapLegacyStatus(
                    j.status || undefined
                  );
                  return (
                    <div
                      key={`${empId}-${j.id}`}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1 truncate">
                        <div className="text-zinc-900 dark:text-zinc-100">
                          {d ? d.toLocaleDateString() : "—"}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          {j.locationId || j.clientProfileId || j.id}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                          {s || "unknown"}
                        </span>
                        <Link
                          to={`/service-history/${j.id}`}
                          className="underline text-blue-600 dark:text-blue-400 text-xs"
                        >
                          Open Job
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
