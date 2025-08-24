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
import { startOfMonth, endOfMonth, eachDayOfInterval, format } from "date-fns";

type Job = { id: string; serviceDate?: any };

export default function MonthView() {
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
        const start = startOfMonth(new Date());
        const end = endOfMonth(new Date());
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
        console.warn("Month view may require index", e?.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const jobsByDay = useMemo(() => {
    const map = new Map<string, { count: number; ids: string[] }>();
    jobs.forEach((j) => {
      const d = (j as any).serviceDate?.toDate
        ? (j as any).serviceDate.toDate()
        : undefined;
      const key = d ? d.toISOString().slice(0, 10) : "";
      if (!key) return;
      if (!map.has(key)) map.set(key, { count: 0, ids: [] });
      const bucket = map.get(key)!;
      bucket.count += 1;
      bucket.ids.push((j as any).id);
    });
    return map;
  }, [jobs]);

  const days = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    return eachDayOfInterval({ start, end });
  }, []);

  return (
    <div>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {days.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const count = jobsByDay.get(key)?.count || 0;
            return (
              <button
                key={key}
                className="rounded-md p-2 bg-white dark:bg-zinc-800 shadow-elev-1 text-left"
                onClick={() => setDrawerDay(key)}
              >
                <div className="text-xs text-zinc-500">
                  {format(d, "MMM d")}
                </div>
                <div className="text-sm font-medium">{count} jobs</div>
              </button>
            );
          })}
        </div>
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
              <div className="font-medium">Jobs on {drawerDay}</div>
              <button className="text-sm" onClick={() => setDrawerDay(null)}>
                Close
              </button>
            </div>
            <MonthDayJobs
              day={drawerDay}
              jobs={jobs}
              locNames={locNames}
              clientNames={clientNames}
              empNamesByJob={empNamesByJob}
              setLocNames={setLocNames}
              setClientNames={setClientNames}
              setEmpNamesByJob={setEmpNamesByJob}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MonthDayJobs({
  day,
  jobs,
  locNames,
  clientNames,
  empNamesByJob,
  setLocNames,
  setClientNames,
  setEmpNamesByJob,
}: {
  day: string;
  jobs: any[];
  locNames: Record<string, string>;
  clientNames: Record<string, string>;
  empNamesByJob: Record<string, string[]>;
  setLocNames: (
    updater: (s: Record<string, string>) => Record<string, string>
  ) => void;
  setClientNames: (
    updater: (s: Record<string, string>) => Record<string, string>
  ) => void;
  setEmpNamesByJob: (
    updater: (s: Record<string, string[]>) => Record<string, string[]>
  ) => void;
}) {
  const dayJobs = useMemo(() => {
    return jobs.filter((j) => {
      const d = (j as any).serviceDate?.toDate
        ? (j as any).serviceDate.toDate()
        : undefined;
      const key = d ? d.toISOString().slice(0, 10) : "";
      return key === day;
    });
  }, [jobs, day]);

  useEffect(() => {
    if (!dayJobs.length) return;
    (async () => {
      const locIds = Array.from(
        new Set(
          dayJobs
            .map((j: any) => j.locationId)
            .filter((v: any): v is string => typeof v === "string" && !!v)
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
          dayJobs
            .map((j: any) => j.clientProfileId)
            .filter((v: any): v is string => typeof v === "string" && !!v)
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

      const empPairs = await Promise.all(
        dayJobs.map(
          async (j: any) =>
            [j.id, await getEmployeeNames(j.assignedEmployees || [])] as const
        )
      );
      setEmpNamesByJob((prev) => {
        const next = { ...prev };
        empPairs.forEach(([id, names]) => (next[id] = names));
        return next;
      });
    })();
  }, [dayJobs, setLocNames, setClientNames, setEmpNamesByJob]);

  return (
    <div className="mt-3 space-y-2">
      {dayJobs.length === 0 ? (
        <div className="text-sm text-zinc-500">No jobs.</div>
      ) : (
        dayJobs.map((j: any) => {
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
                  {left}
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
  );
}
