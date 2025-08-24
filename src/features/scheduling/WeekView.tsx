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
  getClientName,
  getLocationName,
  getEmployeeNames,
} from "../../services/queries/resolvers";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { Link } from "react-router-dom";

type Job = {
  id: string;
  serviceDate?: any;
  locationId?: string;
  clientProfileId?: string;
};

export default function WeekView() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drawerDay, setDrawerDay] = useState<string | null>(null);
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
        const start = startOfWeek(new Date(), { weekStartsOn: 0 });
        const end = endOfWeek(new Date(), { weekStartsOn: 0 });
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
        console.warn("Week view may require index", e?.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const grouped = useMemo(() => {
    const g = new Map<string, Job[]>();
    jobs.forEach((j) => {
      const d = j.serviceDate?.toDate ? j.serviceDate.toDate() : undefined;
      const key = d ? d.toISOString().slice(0, 10) : "";
      if (!key) return;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(j);
    });
    return g;
  }, [jobs]);

  const jobsForDrawer = useMemo(() => {
    if (!drawerDay) return [] as Job[];
    return jobs.filter((j) => {
      const d = j.serviceDate?.toDate ? j.serviceDate.toDate() : undefined;
      const key = d ? d.toISOString().slice(0, 10) : "";
      return key === drawerDay;
    });
  }, [jobs, drawerDay]);

  // Prefetch names for all jobs in the week (used in day list preview)
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
        const pairs = await Promise.all(
          locIds.map(async (id) => [id, await getLocationName(id)] as const)
        );
        setLocNames((prev) => {
          const next = { ...prev };
          pairs.forEach(([id, name]) => (next[id] = name));
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
        const pairs = await Promise.all(
          clientIds.map(async (id) => [id, await getClientName(id)] as const)
        );
        setClientNames((prev) => {
          const next = { ...prev };
          pairs.forEach(([id, name]) => (next[id] = name));
          return next;
        });
      }
    })();
  }, [jobs]);

  // Resolve names for jobs shown in drawer
  useEffect(() => {
    if (!jobsForDrawer.length) return;
    (async () => {
      const locIds = Array.from(
        new Set(
          jobsForDrawer
            .map((j) => j.locationId)
            .filter((v): v is string => typeof v === "string" && !!v)
        )
      );
      if (locIds.length) {
        const pairs = await Promise.all(
          locIds.map(async (id) => [id, await getLocationName(id)] as const)
        );
        setLocNames((prev) => {
          const next = { ...prev };
          pairs.forEach(([id, name]) => (next[id] = name));
          return next;
        });
      }

      const clientIds = Array.from(
        new Set(
          jobsForDrawer
            .map((j) => j.clientProfileId)
            .filter((v): v is string => typeof v === "string" && !!v)
        )
      );
      if (clientIds.length) {
        const pairs = await Promise.all(
          clientIds.map(async (id) => [id, await getClientName(id)] as const)
        );
        setClientNames((prev) => {
          const next = { ...prev };
          pairs.forEach(([id, name]) => (next[id] = name));
          return next;
        });
      }

      const needEmp = jobsForDrawer; // show names for all rows if available
      if (needEmp.length) {
        const empPairs = await Promise.all(
          needEmp.map(async (j) => {
            const display: string[] = [];
            return [
              j.id,
              display.length
                ? display
                : await getEmployeeNames((j as any).assignedEmployees || []),
            ] as const;
          })
        );
        setEmpNamesByJob((prev) => {
          const next = { ...prev };
          empPairs.forEach(([id, names]) => (next[id] = names));
          return next;
        });
      }
    })();
  }, [jobsForDrawer]);

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : grouped.size === 0 ? (
        <div className="text-sm text-zinc-500">No jobs this week.</div>
      ) : (
        [...grouped.entries()].map(([day, list]) => (
          <button
            key={day}
            className="text-left w-full rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1"
            onClick={() => setDrawerDay(day)}
          >
            <div className="text-sm font-medium">
              {format(new Date(day), "EEE, MMM d")}
            </div>
            <ul className="mt-1 text-sm list-disc pl-5">
              {list.slice(0, 4).map((j) => (
                <li
                  key={j.id}
                  className="truncate"
                  title={
                    (j.locationId &&
                      (locNames[j.locationId] || j.locationId)) ||
                    (j.clientProfileId &&
                      (clientNames[j.clientProfileId] || j.clientProfileId)) ||
                    j.id
                  }
                >
                  {j.locationId
                    ? locNames[j.locationId] || j.locationId
                    : j.clientProfileId
                    ? clientNames[j.clientProfileId] || j.clientProfileId
                    : j.id}
                </li>
              ))}
              {list.length > 4 ? (
                <li className="text-xs text-zinc-500">
                  +{list.length - 4} more
                </li>
              ) : null}
            </ul>
          </button>
        ))
      )}

      {drawerDay && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end md:items-center md:justify-center"
          onClick={() => setDrawerDay(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-t-lg md:rounded-lg p-4 w-full md:w-[480px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="font-medium">
                Jobs on {format(new Date(drawerDay), "EEE, MMM d")}
              </div>
              <button className="text-sm" onClick={() => setDrawerDay(null)}>
                Close
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {jobsForDrawer.length === 0 ? (
                <div className="text-sm text-zinc-500">No jobs.</div>
              ) : (
                jobsForDrawer.map((j) => {
                  const left = j.locationId
                    ? locNames[j.locationId] || j.locationId
                    : j.clientProfileId
                    ? clientNames[j.clientProfileId] || j.clientProfileId
                    : j.id;
                  const right = empNamesByJob[j.id] || [];
                  return (
                    <div
                      key={j.id}
                      className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className="font-medium min-w-0 flex-1 truncate"
                          title={left}
                        >
                          {j.locationId ? (
                            <Link
                              to={`/crm/locations/${j.locationId}`}
                              className="underline text-blue-600 dark:text-blue-400"
                            >
                              {left}
                            </Link>
                          ) : j.clientProfileId ? (
                            <Link
                              to={`/crm/clients/${j.clientProfileId}`}
                              className="underline text-blue-600 dark:text-blue-400"
                            >
                              {left}
                            </Link>
                          ) : (
                            left
                          )}
                        </div>
                        <div
                          className="text-xs text-zinc-500 shrink-0 truncate max-w-[45%]"
                          title={right.join(", ")}
                        >
                          {right.join(", ")}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
