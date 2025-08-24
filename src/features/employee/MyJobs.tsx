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
  doc,
  getDoc,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import {
  makeDayBounds as makeDayBoundsUtil,
  formatJobWindow,
} from "../../utils/time";

type JobItem = {
  id: string;
  clientName?: string;
  locationId?: string;
  locationName?: string;
  serviceDate?: any;
  serviceType?: string;
  notes?: string;
};

type StatusFilter = "all" | "scheduled" | "inprogress" | "completed";

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day; // week starts Sunday to mirror V1
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(0, 0, 0, 0);
  return end; // exclusive upper bound
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(dt?: Date | null): string {
  if (!dt) return "No date";
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(dt?: Date | null): string {
  if (!dt) return "No time";
  return dt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MyJobs() {
  const { user } = useAuth();

  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [rows, setRows] = useState<JobItem[]>([]);
  const [timeWindows, setTimeWindows] = useState<Record<string, string>>({});

  // Default dates to this week
  useEffect(() => {
    const s = startOfWeek(new Date());
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    setStart(toDateInputValue(s));
    setEnd(toDateInputValue(e));
  }, []);

  useEffect(() => {
    (async () => {
      if (!user?.uid || !start || !end) return;
      try {
        setLoading(true);
        setError("");
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Resolve employee profileId if available (for legacy assignments)
        let profileId: string | null = null;
        try {
          const us = await getDoc(doc(db, "users", user.uid));
          profileId =
            us.exists() && typeof (us.data() as any).profileId === "string"
              ? (us.data() as any).profileId
              : null;
        } catch {}

        // Build range
        const startDate = new Date(start);
        const endDate = new Date(end);
        // make end exclusive by adding one day
        endDate.setDate(endDate.getDate() + 1);
        endDate.setHours(0, 0, 0, 0);

        // Primary query: UID assigned
        const qPrimary = query(
          collection(db, "serviceHistory"),
          where("assignedEmployees", "array-contains", user.uid),
          where("serviceDate", ">=", Timestamp.fromDate(startDate)),
          where("serviceDate", "<", Timestamp.fromDate(endDate)),
          orderBy("serviceDate", "asc")
        );
        const map = new Map<string, JobItem>();
        const snap1 = await getDocs(qPrimary);
        snap1.forEach((d) => map.set(d.id, { id: d.id, ...(d.data() as any) }));

        // Secondary: profileId assigned
        if (profileId) {
          const qSecondary = query(
            collection(db, "serviceHistory"),
            where("assignedEmployees", "array-contains", profileId),
            where("serviceDate", ">=", Timestamp.fromDate(startDate)),
            where("serviceDate", "<", Timestamp.fromDate(endDate)),
            orderBy("serviceDate", "asc")
          );
          const snap2 = await getDocs(qSecondary);
          snap2.forEach((d) =>
            map.set(d.id, { id: d.id, ...(d.data() as any) })
          );
        }

        // Fallback: legacy employeeAssignments
        if (map.size === 0) {
          const qFallback = query(
            collection(db, "serviceHistory"),
            where("serviceDate", ">=", Timestamp.fromDate(startDate)),
            where("serviceDate", "<", Timestamp.fromDate(endDate)),
            orderBy("serviceDate", "asc")
          );
          const snapF = await getDocs(qFallback);
          snapF.forEach((d) => {
            const data = d.data() as any;
            const arr = Array.isArray(data.employeeAssignments)
              ? data.employeeAssignments
              : [];
            const match = arr.some(
              (a: any) =>
                a?.uid === user.uid ||
                (profileId &&
                  (a?.employeeId === profileId ||
                    a?.employeeProfileId === profileId))
            );
            if (match) map.set(d.id, { id: d.id, ...data });
          });
        }

        let list = Array.from(map.values());

        // Client-side search
        const qStr = search.trim().toLowerCase();
        if (qStr) {
          list = list.filter((j) => {
            const client = (j.clientName || "").toLowerCase();
            const loc = (
              (j.locationName || j.locationId || "") as string
            ).toLowerCase();
            return client.includes(qStr) || loc.includes(qStr);
          });
        }

        // Status filter
        if (status !== "all") {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          list = list.filter((j) => {
            const sd = j.serviceDate;
            let dt: Date | null = null;
            if (sd?.toDate) dt = sd.toDate();
            else if (sd?.seconds) dt = new Date(sd.seconds * 1000);
            if (!dt) return status === "scheduled"; // unknown treated as future
            const day = new Date(dt);
            day.setHours(0, 0, 0, 0);
            if (status === "completed") return day < today;
            if (status === "inprogress")
              return day.getTime() === today.getTime();
            if (status === "scheduled") return day > today;
            return true;
          });
        }

        // Sort by serviceDate asc
        list.sort((a, b) => {
          const ad = a.serviceDate?.toDate
            ? a.serviceDate.toDate()
            : a.serviceDate?.seconds
            ? new Date(a.serviceDate.seconds * 1000)
            : null;
          const bd = b.serviceDate?.toDate
            ? b.serviceDate.toDate()
            : b.serviceDate?.seconds
            ? new Date(b.serviceDate.seconds * 1000)
            : null;
          return (ad?.getTime() || 0) - (bd?.getTime() || 0);
        });

        setRows(list);
      } catch (e: any) {
        setError(e?.message || "Failed to load jobs.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid, start, end, search, status]);

  // Compute time windows for each job row
  useEffect(() => {
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const map: Record<string, string> = {};
        for (const j of rows) {
          const dt: Date | null = j.serviceDate?.toDate
            ? j.serviceDate.toDate()
            : (j as any).serviceDate?.seconds
            ? new Date((j as any).serviceDate.seconds * 1000)
            : null;
          if (!dt || !j.locationId) {
            map[j.id] = formatJobWindow((j as any).serviceDate);
            continue;
          }
          const { start, end } = makeDayBoundsUtil(dt, "America/New_York");
          try {
            const qref = query(
              collection(db, "employeeTimeTracking"),
              where("locationId", "==", j.locationId),
              where("clockInTime", ">=", Timestamp.fromDate(start)),
              where("clockInTime", "<=", Timestamp.fromDate(end)),
              orderBy("clockInTime", "asc"),
              limit(10)
            );
            const snap = await getDocs(qref);
            const rowsT: any[] = [];
            snap.forEach((d) => rowsT.push({ id: d.id, ...(d.data() as any) }));
            const assigned = Array.isArray((j as any).assignedEmployees)
              ? ((j as any).assignedEmployees as unknown as string[])
              : [];
            let rec = rowsT.find((r) =>
              assigned.includes((r as any).employeeProfileId || "")
            );
            if (!rec) rec = rowsT[0];
            if (rec?.clockInTime?.toDate && rec?.clockOutTime?.toDate) {
              map[j.id] = formatJobWindow((j as any).serviceDate, {
                start: rec.clockInTime,
                end: rec.clockOutTime,
              });
            } else if (rec?.clockInTime?.toDate && !rec?.clockOutTime) {
              map[j.id] = formatJobWindow((j as any).serviceDate);
            } else {
              map[j.id] = formatJobWindow((j as any).serviceDate);
            }
          } catch {
            map[j.id] = formatJobWindow((j as any).serviceDate);
          }
        }
        setTimeWindows(map);
      } catch {}
    })();
  }, [rows]);

  const selectedRangeText = useMemo(() => {
    try {
      const s = new Date(start);
      const e = new Date(end);
      return `${s.toLocaleDateString()} — ${e.toLocaleDateString()}`;
    } catch {
      return "";
    }
  }, [start, end]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My Jobs</h1>
        <div className="text-xs text-zinc-500">{selectedRangeText}</div>
      </div>

      {/* Filters */}
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block text-sm">
            <div className="text-xs text-zinc-500">Start date</div>
            <input
              type="date"
              className="mt-1 w-full px-2 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <div className="text-xs text-zinc-500">End date</div>
            <input
              type="date"
              className="mt-1 w-full px-2 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <div className="text-xs text-zinc-500">
              Search client or location
            </div>
            <input
              type="text"
              placeholder="Type to search..."
              className="mt-1 w-full px-2 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {(
            [
              ["all", "All"],
              ["scheduled", "Scheduled"],
              ["inprogress", "In Progress"],
              ["completed", "Completed"],
            ] as Array<[StatusFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              className={`px-3 py-1.5 rounded-full border ${
                status === key ? "bg-zinc-100 dark:bg-zinc-900" : ""
              }`}
              onClick={() => setStatus(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-sm text-zinc-500">Loading jobs…</div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-zinc-500">
          No jobs found for the selected filters.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((j) => {
            const dt = j.serviceDate?.toDate
              ? j.serviceDate.toDate()
              : j.serviceDate?.seconds
              ? new Date(j.serviceDate.seconds * 1000)
              : null;
            // Status chip
            let statusText = "Scheduled";
            let statusClass = "bg-green-100 text-green-800";
            if (dt) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const day = new Date(dt);
              day.setHours(0, 0, 0, 0);
              if (day < today) {
                statusText = "Completed";
                statusClass = "bg-gray-100 text-gray-800";
              } else if (day.getTime() === today.getTime()) {
                statusText = "In Progress";
                statusClass = "bg-blue-100 text-blue-800";
              }
            }
            return (
              <div
                key={j.id}
                className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1 border border-zinc-200 dark:border-zinc-700"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-medium">
                      {j.locationName || j.locationId || "Unknown Location"}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {j.clientName || "Unknown Client"}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${statusClass}`}
                  >
                    {statusText}
                  </span>
                </div>
                <div className="text-sm flex items-center gap-4">
                  <div>
                    <span className="text-zinc-500">Date: </span>
                    <span className="font-medium">{formatDate(dt)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Time: </span>
                    <span className="font-medium">
                      {timeWindows[j.id] ||
                        formatJobWindow((j as any).serviceDate)}
                    </span>
                  </div>
                </div>
                {j.serviceType ? (
                  <div className="mt-1 text-sm">
                    <span className="text-zinc-500">Service Type: </span>
                    <span className="font-medium">{j.serviceType}</span>
                  </div>
                ) : null}
                {j.notes ? (
                  <div className="mt-1 text-xs text-zinc-500 italic">
                    {j.notes}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
