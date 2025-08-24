import { useEffect, useState } from "react";
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
import { firebaseConfig } from "../../../services/firebase";
import {
  getClientNames,
  getLocationNames,
  getEmployeeNames,
} from "../../../services/queries/resolvers";
import { startOfDay, addDays } from "date-fns";
import { Link } from "react-router-dom";

type Job = {
  id: string;
  clientProfileId?: string;
  locationId?: string;
  serviceDate?: any;
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

export default function TodayBoard() {
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
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
        console.warn("Today/Tomorrow jobs may require index", e?.message);
        setError(e?.message || "Failed to load jobs");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!jobs.length) return;
    (async () => {
      const locIds = Array.from(
        new Set(
          jobs
            .map((j) => j.locationId)
            .filter((v): v is string => typeof v === "string" && !!v)
        )
      );
      if (locIds.length) {
        const names = await getLocationNames(locIds);
        setLocNames((prev) => {
          const next = { ...prev };
          locIds.forEach((id, i) => (next[id] = names[i] || id));
          return next;
        });
      }

      const clientIds = Array.from(
        new Set(
          jobs
            .map((j) => j.clientProfileId)
            .filter((v): v is string => typeof v === "string" && !!v)
        )
      );
      if (clientIds.length) {
        const names = await getClientNames(clientIds);
        setClientNames((prev) => {
          const next = { ...prev };
          clientIds.forEach((id, i) => (next[id] = names[i] || id));
          return next;
        });
      }

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

  return (
    <div className="rounded-lg p-4 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1">
      <div className="font-medium">Today & Tomorrow</div>
      {loading ? (
        <div className="text-sm text-zinc-500 mt-2">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="text-sm text-zinc-500 mt-2">No jobs scheduled.</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {jobs.map((j) => {
            const leftLabel = j.locationId
              ? locNames[j.locationId] || j.locationId
              : j.clientProfileId
              ? clientNames[j.clientProfileId] || j.clientProfileId
              : j.id;
            const emp = extractNames(j);
            const right = emp.length ? emp : empNamesByJob[j.id] || [];
            return (
              <li key={j.id} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-medium min-w-0 flex-1 truncate"
                    title={leftLabel}
                  >
                    {j.locationId ? (
                      <Link
                        to={`/crm/locations/${j.locationId}`}
                        className="underline text-blue-600 dark:text-blue-400"
                      >
                        {leftLabel}
                      </Link>
                    ) : j.clientProfileId ? (
                      <Link
                        to={`/crm/clients/${j.clientProfileId}`}
                        className="underline text-blue-600 dark:text-blue-400"
                      >
                        {leftLabel}
                      </Link>
                    ) : (
                      leftLabel
                    )}
                  </span>
                  <span
                    className="text-xs text-zinc-500 shrink-0 truncate max-w-[40%]"
                    title={right.join(", ")}
                  >
                    {right.join(", ") || "Unassigned"}
                  </span>
                </div>
                <div className="mt-1 text-right">
                  <Link
                    to={`/service-history/${j.id}`}
                    className="underline text-blue-600 dark:text-blue-400 text-xs"
                  >
                    View Job
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
