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
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { firebaseConfig } from "../../services/firebase";
import {
  getEmployeeNames,
  getLocationNames,
} from "../../services/queries/resolvers";
import { computeLastCompletedPeriod } from "../../services/payrollPeriods";
import { addDays, format } from "date-fns";
import { deriveAdminStatus } from "../../services/statusMap";

type Job = {
  id: string;
  serviceDate?: any;
  status?: string;
  clientProfileId?: string;
  locationId?: string;
  assignedEmployees?: string[];
  employeeAssignments?: Array<{ uid?: string; name?: string }>;
  employeeDisplayNames?: string[];
};

type TimeEntry = {
  id: string;
  employeeProfileId?: string;
  locationId?: string;
  clockInTime?: any;
  clockOutTime?: any;
};

function toDateSafe(v: any): Date | null {
  try {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === "function") return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    const n = Number(v);
    if (Number.isFinite(n)) return new Date(n);
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// map to the canonical primary status for filtering in the Assignments view
function mapPrimaryStatus(job: Job): string {
  const { primary } = deriveAdminStatus({
    status: job.status,
    serviceDate: job.serviceDate,
    payrollProcessed: (job as any)?.payrollProcessed,
  });
  return primary;
}

function extractAssigneeIds(job: Job): string[] {
  if (Array.isArray(job.assignedEmployees) && job.assignedEmployees.length)
    return job.assignedEmployees.filter(
      (v): v is string => typeof v === "string" && !!v
    );
  if (Array.isArray(job.employeeAssignments) && job.employeeAssignments.length)
    return job.employeeAssignments
      .map((a) => a?.uid || "")
      .filter((v): v is string => typeof v === "string" && !!v);
  return [];
}

function defaultCurrentPayPeriod(): { start: Date; end: Date } {
  const last = computeLastCompletedPeriod(new Date(), {
    frequency: "biweekly",
  });
  if (last) {
    const start = last.end;
    const end = addDays(start, 14);
    return { start, end };
  }
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 14);
  return { start, end };
}

export default function AssignmentsReadOnly({
  initialStart,
  initialEnd,
  initialEmployeeId,
  initialLocationId,
  initialStatus,
  initialCompare,
}: {
  initialStart?: string | null;
  initialEnd?: string | null;
  initialEmployeeId?: string | null;
  initialLocationId?: string | null;
  initialStatus?: string | null;
  initialCompare?: string | null;
}) {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const def = useMemo(defaultCurrentPayPeriod, []);
  const [startDate, setStartDate] = useState<string>(
    initialStart || ymd(def.start)
  );
  const [endDate, setEndDate] = useState<string>(initialEnd || ymd(def.end));
  const [employeeId, setEmployeeId] = useState<string>(
    initialEmployeeId || "all"
  );
  const [locationId, setLocationId] = useState<string>(
    initialLocationId || "all"
  );
  const [status, setStatus] = useState<string>(initialStatus || "all");
  const [compareClock, setCompareClock] = useState<boolean>(
    initialCompare === "1"
  );

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [empGroups, setEmpGroups] = useState<Record<string, Job[]>>({});
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>(
    {}
  );
  const [locationNames, setLocationNames] = useState<Record<string, string>>(
    {}
  );
  const [annotations, setAnnotations] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<boolean>(false);

  // Keep URL in sync for deep-linking
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "assignments");
    next.set("start", startDate);
    next.set("end", endDate);
    if (employeeId && employeeId !== "all") next.set("employeeId", employeeId);
    else next.delete("employeeId");
    if (locationId && locationId !== "all") next.set("locationId", locationId);
    else next.delete("locationId");
    if (status && status !== "all") next.set("status", status);
    else next.delete("status");
    next.set("compare", compareClock ? "1" : "0");
    setSearchParams(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, employeeId, locationId, status, compareClock]);

  // Load jobs for range and then group by employee
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const start = new Date(startDate + "T00:00:00");
        const end = new Date(endDate + "T23:59:59");
        const qParts: any[] = [
          where("serviceDate", ">=", Timestamp.fromDate(start)),
          where("serviceDate", "<", Timestamp.fromDate(end)),
          orderBy("serviceDate", "asc"),
        ];
        // Server-side filters where reasonable; remainder applied client-side
        if (employeeId && employeeId !== "all")
          qParts.push(where("assignedEmployees", "array-contains", employeeId));
        if (locationId && locationId !== "all")
          qParts.push(where("locationId", "==", locationId));
        const qy = query(collection(db, "serviceHistory"), ...qParts);
        const snap = await getDocs(qy);
        const list: Job[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));

        const filtered = list.filter((j) => {
          if (status && status !== "all") {
            const s = mapPrimaryStatus(j);
            if (s !== status && j.status !== status) return false;
          }
          if (employeeId && employeeId !== "all") {
            const ids = extractAssigneeIds(j);
            if (!ids.includes(employeeId)) return false;
          }
          if (locationId && locationId !== "all") {
            if ((j.locationId || "") !== locationId) return false;
          }
          return true;
        });
        setJobs(filtered);

        const byEmp: Record<string, Job[]> = {};
        filtered.forEach((j) => {
          const ids = extractAssigneeIds(j);
          if (ids.length === 0) {
            const key = "unassigned";
            if (!byEmp[key]) byEmp[key] = [];
            byEmp[key].push(j);
          } else {
            ids.forEach((id) => {
              const key = id || "unassigned";
              if (!byEmp[key]) byEmp[key] = [];
              byEmp[key].push(j);
            });
          }
        });
        setEmpGroups(byEmp);

        // Resolve names
        const empIds = Object.keys(byEmp).filter((k) => k !== "unassigned");
        if (empIds.length) {
          const names = await getEmployeeNames(empIds);
          const map: Record<string, string> = {};
          empIds.forEach((id, i) => (map[id] = names[i] || id));
          setEmployeeNames(map);
        } else {
          setEmployeeNames({});
        }

        const locIds = Array.from(
          new Set(
            filtered
              .map((j) => j.locationId)
              .filter((v): v is string => typeof v === "string" && !!v)
          )
        );
        if (locIds.length) {
          const names = await getLocationNames(locIds);
          const map: Record<string, string> = {};
          locIds.forEach((id, i) => (map[id] = names[i] || id));
          setLocationNames(map);
        } else {
          setLocationNames({});
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [startDate, endDate, employeeId, locationId, status]);

  // Compare to clock events (late/missed/out-of-fence[=wrong location])
  useEffect(() => {
    (async () => {
      if (!compareClock) {
        setAnnotations({});
        return;
      }
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T23:59:59");

      const empIds = Object.keys(empGroups).filter((k) => k !== "unassigned");
      const ann: Record<string, string> = {};
      const thresholdMs = 5 * 60 * 1000;

      // Helper to annotate single job per employee
      function annotate(empId: string, job: Job, entries: TimeEntry[]) {
        const planned = toDateSafe(job.serviceDate);
        if (!planned) return;
        const dayKey = ymd(planned);
        const dayEntries = entries.filter((e) => {
          const t = toDateSafe(e.clockInTime);
          return !!t && ymd(t) === dayKey;
        });
        if (!dayEntries.length) {
          ann[`${empId}:${job.id}`] = "missed";
          return;
        }
        // Prefer entries for the same locationId; else mark out-of-fence
        const locMatches = dayEntries.filter(
          (e) => (e.locationId || "") === (job.locationId || "")
        );
        const targetList = locMatches.length ? locMatches : dayEntries;
        const first = targetList
          .map((e) => ({ e, t: toDateSafe(e.clockInTime)! }))
          .sort((a, b) => a.t.getTime() - b.t.getTime())[0];
        if (!locMatches.length) {
          ann[`${empId}:${job.id}`] = "out-of-fence";
          return;
        }
        if (
          first &&
          planned &&
          first.t.getTime() - planned.getTime() > thresholdMs
        ) {
          ann[`${empId}:${job.id}`] = "late";
        } else {
          ann[`${empId}:${job.id}`] = "on-time";
        }
      }

      // Fetch entries per employee to keep queries index-friendly
      for (const empId of empIds) {
        try {
          const qy = query(
            collection(db, "employeeTimeTracking"),
            where("employeeProfileId", "==", empId),
            where("clockInTime", ">=", Timestamp.fromDate(start)),
            where("clockInTime", "<", Timestamp.fromDate(end)),
            orderBy("clockInTime", "asc")
          );
          const snap = await getDocs(qy);
          const rows: TimeEntry[] = [];
          snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
          for (const job of empGroups[empId] || []) annotate(empId, job, rows);
        } catch {
          for (const job of empGroups[empId] || [])
            ann[`${empId}:${job.id}`] = "unknown";
        }
      }
      setAnnotations(ann);
    })();
  }, [compareClock, empGroups, startDate, endDate]);

  const employeeOptions = useMemo(() => {
    const ids = new Set<string>();
    Object.keys(empGroups).forEach((id) => id !== "unassigned" && ids.add(id));
    return ["all", ...Array.from(ids)];
  }, [empGroups]);

  const locationOptions = useMemo(() => {
    const ids = new Set<string>();
    jobs.forEach(
      (j) =>
        typeof j.locationId === "string" &&
        j.locationId &&
        ids.add(j.locationId)
    );
    return ["all", ...Array.from(ids)];
  }, [jobs]);

  const statusOptions = [
    { value: "all", label: "All" },
    { value: "scheduled", label: "Scheduled" },
    { value: "in_progress", label: "In Progress" },
    {
      value: "completed_pending_approval",
      label: "Completed (Pending Approval)",
    },
    { value: "canceled", label: "Canceled" },
  ];

  const deepLink = useMemo(() => {
    const p = new URLSearchParams();
    p.set("tab", "assignments");
    p.set("start", startDate);
    p.set("end", endDate);
    if (employeeId && employeeId !== "all") p.set("employeeId", employeeId);
    if (locationId && locationId !== "all") p.set("locationId", locationId);
    if (status && status !== "all") p.set("status", status);
    if (compareClock) p.set("compare", "1");
    return `/scheduling?${p.toString()}`;
  }, [startDate, endDate, employeeId, locationId, status, compareClock]);

  const absoluteDeepLink = useMemo(() => {
    try {
      return new URL(deepLink, window.location.origin).toString();
    } catch {
      return deepLink;
    }
  }, [deepLink]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Start</label>
          <input
            type="date"
            className="border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">End</label>
          <input
            type="date"
            className="border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="min-w-[200px]">
          <label className="block text-xs text-zinc-500 mb-1">Employee</label>
          <select
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {employeeOptions.map((id) => (
              <option key={id} value={id}>
                {id === "all" ? "All" : employeeNames[id] || id}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className="block text-xs text-zinc-500 mb-1">Location</label>
          <select
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {locationOptions.map((id) => (
              <option key={id} value={id}>
                {id === "all" ? "All" : locationNames[id] || id}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className="block text-xs text-zinc-500 mb-1">Status</label>
          <select
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1"></div>
        <div className="flex items-center gap-2">
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={compareClock}
              onChange={(e) => setCompareClock(e.target.checked)}
            />
            Compare to Clock Events
          </label>
          <Link
            to={deepLink}
            className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
          >
            Open in Scheduler
          </Link>
          <button
            type="button"
            title="Copy link with current filters"
            className={`px-3 py-2 rounded-md text-sm ${
              copied
                ? "bg-emerald-600 text-white"
                : "bg-zinc-200 dark:bg-zinc-700"
            }`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(absoluteDeepLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {}
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : Object.keys(empGroups).length === 0 ? (
        <div className="text-sm text-zinc-500">No assignments.</div>
      ) : (
        Object.entries(empGroups).map(([empId, list]) => (
          <div
            key={empId}
            className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1"
          >
            <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-700 flex items-center justify-between">
              <div className="font-medium">
                {empId === "unassigned"
                  ? "Unassigned"
                  : employeeNames[empId] || empId}
              </div>
              {empId !== "unassigned" && (
                <Link
                  to={`/hr/${empId}`}
                  className="underline text-blue-600 dark:text-blue-400 text-sm"
                >
                  View Employee
                </Link>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Job</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Planned Start</th>
                    <th className="px-3 py-2">Planned End</th>
                    <th className="px-3 py-2">Service Date</th>
                    <th className="px-3 py-2">Status</th>
                    {compareClock ? <th className="px-3 py-2">Clock</th> : null}
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-zinc-500" colSpan={7}>
                        No jobs.
                      </td>
                    </tr>
                  ) : (
                    list.map((j) => {
                      const sd = toDateSafe(j.serviceDate);
                      const plannedStart = sd
                        ? sd.toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—";
                      const plannedEnd = "—";
                      const annKey = `${empId}:${j.id}`;
                      const annValue = annotations[annKey];
                      return (
                        <tr
                          key={`${empId}:${j.id}`}
                          className="border-t border-zinc-100 dark:border-zinc-700"
                        >
                          <td className="px-3 py-2">
                            <Link
                              to={`/service-history/${j.id}?from=sched`}
                              className="underline text-blue-600 dark:text-blue-400"
                            >
                              {j.id}
                            </Link>
                          </td>
                          <td className="px-3 py-2 max-w-[320px]">
                            {j.locationId ? (
                              <Link
                                to={`/crm/locations/${j.locationId}`}
                                className="underline text-blue-600 dark:text-blue-400 truncate inline-block max-w-[280px]"
                                title={
                                  locationNames[j.locationId] || j.locationId
                                }
                              >
                                {locationNames[j.locationId] || j.locationId}
                              </Link>
                            ) : j.clientProfileId ? (
                              <Link
                                to={`/crm/clients/${j.clientProfileId}`}
                                className="underline text-blue-600 dark:text-blue-400 truncate inline-block max-w-[280px]"
                                title={j.clientProfileId}
                              >
                                {j.clientProfileId}
                              </Link>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{plannedStart}</td>
                          <td className="px-3 py-2">{plannedEnd}</td>
                          <td className="px-3 py-2">
                            {sd ? sd.toLocaleDateString() : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                              {mapUiStatus(j.status)}
                            </span>
                          </td>
                          {compareClock ? (
                            <td className="px-3 py-2">
                              {annValue ? (
                                <span
                                  className={`px-2 py-0.5 rounded-md text-xs ${
                                    annValue === "late"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : annValue === "missed"
                                      ? "bg-red-100 text-red-800"
                                      : annValue === "out-of-fence"
                                      ? "bg-orange-100 text-orange-800"
                                      : "bg-emerald-100 text-emerald-800"
                                  }`}
                                >
                                  {annValue}
                                </span>
                              ) : (
                                <span className="text-zinc-500 text-xs">—</span>
                              )}
                            </td>
                          ) : null}
                          <td className="px-3 py-2 text-right">
                            <Link
                              to={`/service-history/${j.id}?from=sched`}
                              className="underline text-blue-600 dark:text-blue-400"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
