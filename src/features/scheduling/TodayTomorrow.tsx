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
import { Calendar, Users, MapPin, Clock } from "lucide-react";
import { formatJobWindow } from "../../utils/time";

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-zinc-500">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([day, list]) => (
        <div
          key={day}
          className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden"
        >
          {/* Day Header */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {format(new Date(day), "EEEE, MMMM d")}
              </h3>
              <span className="ml-auto text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-full">
                {list.length} job{list.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Jobs List */}
          <div className="p-6">
            {list.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-zinc-400 dark:text-zinc-500 mb-2">
                  <Clock className="h-12 w-12 mx-auto" />
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No jobs scheduled for this day
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {list.map((j) => {
                  const locationName = j.locationId
                    ? locNames[j.locationId] || j.locationId
                    : j.clientProfileId
                    ? clientNames[j.clientProfileId] || j.clientProfileId
                    : j.id;
                  const emp = extractNames(j);
                  const employees = emp.length
                    ? emp
                    : empNamesByJob[j.id] || [];
                  const jobTime = formatJobWindow(j.serviceDate);

                  return (
                    <div
                      key={j.id}
                      className="group bg-zinc-50 dark:bg-zinc-700/50 rounded-lg p-5 border border-zinc-200 dark:border-zinc-600 hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-4">
                        {/* Job Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-3">
                            <MapPin className="h-4 w-4 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                              {locationName}
                            </h4>
                          </div>

                          {/* Time Information */}
                          <div className="flex items-center gap-2 mb-3">
                            <Clock className="h-4 w-4 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                              {jobTime}
                            </span>
                          </div>

                          {/* Employee Assignments */}
                          {employees.length > 0 ? (
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                              <div className="flex flex-wrap gap-1">
                                {employees.map((emp, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                                  >
                                    {emp}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                                Unassigned
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex-shrink-0">
                          <Link
                            to={`/service-history/${j.id}?from=sched`}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors duration-200"
                          >
                            View Details
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
