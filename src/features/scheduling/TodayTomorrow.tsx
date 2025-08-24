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
import { firebaseConfig } from "../../services/firebase";
import {
  getClientNames,
  getLocationNames,
  getEmployeeNames,
} from "../../services/queries/resolvers";
import { startOfDay, addDays, format } from "date-fns";
import { Link } from "react-router-dom";

type Job = {
  id: string;
  serviceDate?: any;
  clientProfileId?: string;
  locationId?: string;
  assignedEmployees?: string[];
  employeeAssignments?: Array<{ uid?: string; name?: string }>;
  employeeDisplayNames?: string[];
  status?: string;
};

function extractNames(job: Job): string[] {
  if (
    Array.isArray(job.employeeDisplayNames) &&
    job.employeeDisplayNames.length
  )
    return job.employeeDisplayNames;
  if (Array.isArray(job.employeeAssignments) && job.employeeAssignments.length)
    return job.employeeAssignments
      .map((a) => a?.name || a?.uid || "")
      .filter(Boolean);
  if (Array.isArray(job.assignedEmployees)) return job.assignedEmployees;
  return [];
}

export default function TodayTomorrow() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [locNames, setLocNames] = useState<Record<string, string>>({});
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [empNamesByJob, setEmpNamesByJob] = useState<Record<string, string[]>>(
    {}
  );

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const start = startOfDay(new Date());
        const end = addDays(start, 2);
        const q = query(
          collection(db, "serviceHistory"),
          where("serviceDate", ">=", Timestamp.fromDate(start)),
          where("serviceDate", "<", Timestamp.fromDate(end)),
          orderBy("serviceDate", "asc")
        );
        const snap = await getDocs(q);
        const list: Job[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setJobs(list);
      } catch (e: any) {
        console.warn("Today/Tomorrow scheduling may require index", e?.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!jobs.length) return;
    // Resolve location/client names in parallel; caches dedupe requests
    (async () => {
      const uniqueLocIds = Array.from(
        new Set(
          jobs
            .map((j) => j.locationId)
            .filter((v): v is string => typeof v === "string" && !!v)
        )
      );
      if (uniqueLocIds.length) {
        const names = await getLocationNames(uniqueLocIds);
        setLocNames((prev) => {
          const next = { ...prev };
          uniqueLocIds.forEach((id, i) => (next[id] = names[i] || id));
          return next;
        });
      }

      const uniqueClientIds = Array.from(
        new Set(
          jobs
            .map((j) => j.clientProfileId)
            .filter((v): v is string => typeof v === "string" && !!v)
        )
      );
      if (uniqueClientIds.length) {
        const names = await getClientNames(uniqueClientIds);
        setClientNames((prev) => {
          const next = { ...prev };
          uniqueClientIds.forEach((id, i) => (next[id] = names[i] || id));
          return next;
        });
      }

      // Resolve employee names only if not already present on job
      const needEmp = jobs.filter(
        (j) =>
          extractNames(j).length === 0 &&
          Array.isArray(j.assignedEmployees) &&
          j.assignedEmployees.length
      );
      if (needEmp.length) {
        const pairs = await Promise.all(
          needEmp.map(
            async (j) =>
              [j.id, await getEmployeeNames(j.assignedEmployees!)] as const
          )
        );
        setEmpNamesByJob((prev) => {
          const next = { ...prev };
          pairs.forEach(([id, names]) => (next[id] = names));
          return next;
        });
      }
    })();
  }, [jobs]);

  const grouped = useMemo(() => {
    const day1 = startOfDay(new Date()).toISOString().slice(0, 10);
    const day2 = addDays(startOfDay(new Date()), 1).toISOString().slice(0, 10);
    const g: Record<string, Job[]> = { [day1]: [], [day2]: [] };
    jobs.forEach((j) => {
      const d = j.serviceDate?.toDate ? j.serviceDate.toDate() : undefined;
      const key = d ? d.toISOString().slice(0, 10) : "";
      if (key && g[key]) g[key].push(j);
    });
    return g;
  }, [jobs]);

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        Object.entries(grouped).map(([day, list]) => (
          <div
            key={day}
            className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1"
          >
            <div className="font-medium">
              {format(new Date(day), "EEEE, MMM d")}
            </div>
            {list.length === 0 ? (
              <div className="text-sm text-zinc-500 mt-1">No jobs.</div>
            ) : (
              <ul className="mt-2 text-sm space-y-2">
                {list.map((j) => {
                  const leftLabel = j.locationId
                    ? locNames[j.locationId] || j.locationId
                    : j.clientProfileId
                    ? clientNames[j.clientProfileId] || j.clientProfileId
                    : j.id;
                  const emp = extractNames(j);
                  const right = emp.length ? emp : empNamesByJob[j.id] || [];
                  return (
                    <li
                      key={j.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span
                        className="font-medium min-w-0 flex-1 truncate"
                        title={leftLabel}
                      >
                        {leftLabel}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className="text-xs text-zinc-500 truncate max-w-[40%]"
                          title={right.join(", ")}
                        >
                          {right.join(", ") || "Unassigned"}
                        </span>
                        <Link
                          to={`/service-history/${j.id}`}
                          className="underline text-blue-600 dark:text-blue-400 text-xs"
                        >
                          View
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  );
}
