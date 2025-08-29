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
import { startOfWeek, endOfWeek, format, eachDayOfInterval } from "date-fns";
import { Link } from "react-router-dom";
import {
  Calendar,
  Users,
  MapPin,
  Clock,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { formatJobWindow } from "../../utils/time";

type Job = {
  id: string;
  serviceDate?: any;
  locationId?: string;
  clientProfileId?: string;
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

  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 0 });
    const end = endOfWeek(new Date(), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, []);

  const jobsForDrawer = useMemo(() => {
    if (!drawerDay) return [] as Job[];
    return jobs.filter((j) => {
      const d = j.serviceDate?.toDate ? j.serviceDate.toDate() : undefined;
      const key = d ? d.toISOString().slice(0, 10) : "";
      return key === drawerDay;
    });
  }, [jobs, drawerDay]);

  // Prefetch names for all jobs in the week
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
        const names = await getLocationNames(locIds);
        setLocNames((prev) => {
          const next = { ...prev };
          locIds.forEach((id, i) => (next[id] = names[i] || id));
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
        const names = await getClientNames(clientIds);
        setClientNames((prev) => {
          const next = { ...prev };
          clientIds.forEach((id, i) => (next[id] = names[i] || id));
          return next;
        });
      }

      const needEmp = jobsForDrawer;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-zinc-500">Loading week schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week Overview */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Week of {format(weekDays[0], "MMM d")} -{" "}
            {format(weekDays[6], "MMM d, yyyy")}
          </h3>
          <span className="ml-auto text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-full">
            {jobs.length} total jobs
          </span>
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {weekDays.map((day) => {
            const key = day.toISOString().slice(0, 10);
            const dayJobs = grouped.get(key) || [];

            const isToday =
              format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

            return (
              <button
                key={key}
                onClick={() => setDrawerDay(key)}
                className={`bg-zinc-50 dark:bg-zinc-700/50 rounded-lg border border-zinc-200 dark:border-zinc-600 overflow-hidden hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200 ${
                  isToday ? "ring-2 ring-blue-500 dark:ring-blue-400" : ""
                }`}
              >
                {/* Day Header */}
                <div className="bg-gradient-to-r from-zinc-100 to-zinc-200 dark:from-zinc-600 dark:to-zinc-700 px-4 py-3 border-b border-zinc-200 dark:border-zinc-600">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {format(day, "EEE")}
                      </div>
                      <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {format(day, "d")}
                      </div>
                    </div>
                  </div>
                  {dayJobs.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full">
                        {dayJobs.length} job{dayJobs.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>

                {/* Day Content */}
                <div className="p-3">
                  {dayJobs.length === 0 ? (
                    <div className="text-center py-4">
                      <Clock className="h-6 w-6 text-zinc-400 dark:text-zinc-500 mx-auto mb-2" />
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        No jobs
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dayJobs.slice(0, 2).map((j) => {
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
                            className="bg-white dark:bg-zinc-800 rounded-md p-3 border border-zinc-200 dark:border-zinc-600"
                          >
                            <div className="flex items-start gap-2">
                              <MapPin className="h-3 w-3 text-zinc-500 dark:text-zinc-400 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                  {locationName}
                                </h4>
                                <div className="flex items-center gap-1 mt-1">
                                  <Clock className="h-3 w-3 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                                    {jobTime}
                                  </span>
                                </div>
                                {employees.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <Users className="h-3 w-3 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                      {employees[0]}
                                      {employees.length > 1 &&
                                        ` +${employees.length - 1}`}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {dayJobs.length > 2 && (
                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium text-center py-1">
                          +{dayJobs.length - 2} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day Detail Modal */}
      {drawerDay && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end md:items-center md:justify-center z-50"
          onClick={() => setDrawerDay(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-t-xl md:rounded-xl p-6 w-full md:w-[600px] max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {format(new Date(drawerDay), "EEEE, MMMM d")}
                </h3>
              </div>
              <button
                onClick={() => setDrawerDay(null)}
                className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {jobsForDrawer.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-zinc-400 dark:text-zinc-500 mx-auto mb-4" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No jobs scheduled for this day
                  </p>
                </div>
              ) : (
                jobsForDrawer.map((j) => {
                  const locationName = j.locationId
                    ? locNames[j.locationId] || j.locationId
                    : j.clientProfileId
                    ? clientNames[j.clientProfileId] || j.clientProfileId
                    : j.id;
                  const employees = empNamesByJob[j.id] || [];
                  const jobTime = formatJobWindow(j.serviceDate);

                  return (
                    <div
                      key={j.id}
                      className="bg-zinc-50 dark:bg-zinc-700/50 rounded-lg p-4 border border-zinc-200 dark:border-zinc-600"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <MapPin className="h-4 w-4 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {j.locationId ? (
                                <Link
                                  to={`/crm/locations/${j.locationId}`}
                                  className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  {locationName}
                                </Link>
                              ) : j.clientProfileId ? (
                                <Link
                                  to={`/crm/clients/${j.clientProfileId}`}
                                  className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  {locationName}
                                </Link>
                              ) : (
                                locationName
                              )}
                            </h4>
                          </div>

                          {/* Time Information */}
                          <div className="flex items-center gap-2 mb-2">
                            <Clock className="h-4 w-4 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                              {jobTime}
                            </span>
                          </div>

                          {employees.length > 0 && (
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
                          )}
                        </div>

                        <Link
                          to={`/service-history/${j.id}?from=sched`}
                          className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors duration-200"
                        >
                          View Details
                        </Link>
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
