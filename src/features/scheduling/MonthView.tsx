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
import { startOfWeek, endOfWeek, addDays } from "date-fns";
import { Link } from "react-router-dom";
import { Calendar, Users, MapPin, Clock, X } from "lucide-react";
import { formatJobWindow } from "../../utils/time";
import {
  getMonthBounds,
  groupJobsByBusinessDate,
  formatBusinessDate,
  getBusinessDateKey,
  toFirestoreTimestamp,
  getBusinessNow,
  toBusinessTimezone,
} from "../../utils/timezone";

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
        const bounds = getMonthBounds();
        const q = query(
          collection(db, "serviceHistory"),
          where("serviceDate", ">=", toFirestoreTimestamp(bounds.start)),
          where("serviceDate", "<", toFirestoreTimestamp(bounds.end)),
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

  // Prefetch names for all jobs in the month
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
        const names = await Promise.all(
          locIds.map(async (id) => [id, await getLocationName(id)] as const)
        );
        setLocNames((prev) => {
          const next = { ...prev };
          names.forEach(([id, name]) => (next[id] = name || id));
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
        const names = await Promise.all(
          clientIds.map(async (id) => [id, await getClientName(id)] as const)
        );
        setClientNames((prev) => {
          const next = { ...prev };
          names.forEach(([id, name]) => (next[id] = name || id));
          return next;
        });
      }

      // Resolve employee names
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

  const jobsByDay = useMemo(() => {
    const groups = groupJobsByBusinessDate(jobs);
    const map = new Map<string, Job[]>();
    Object.entries(groups).forEach(([key, jobs]) => {
      map.set(key, jobs);
    });
    return map;
  }, [jobs]);

  const calendarDays = useMemo(() => {
    const bounds = getMonthBounds();
    const businessMonthStart = toBusinessTimezone(bounds.start);
    const businessMonthEnd = toBusinessTimezone(bounds.end);

    // Start from the Sunday of the week containing the first day of the month
    let calendarStart = new Date(businessMonthStart);
    while (calendarStart.getDay() !== 0) {
      calendarStart = new Date(calendarStart.getTime() - 24 * 60 * 60 * 1000);
    }

    // End on the Saturday of the week containing the last day of the month
    let calendarEnd = new Date(businessMonthEnd);
    while (calendarEnd.getDay() !== 6) {
      calendarEnd = new Date(calendarEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    const days = [];
    let day = new Date(calendarStart);

    while (day <= calendarEnd) {
      days.push(new Date(day));
      day = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    }

    return days;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-zinc-500">Loading month schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Month Header */}
      <div className="card-bg rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {formatBusinessDate(new Date(), "MMMM yyyy")}
          </h3>
          <span className="ml-auto text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-full">
            {jobs.length} total jobs
          </span>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Day Headers */}
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="p-3 text-center text-sm font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700 rounded-lg"
            >
              {day}
            </div>
          ))}

          {/* Calendar Days */}
          {calendarDays.map((day) => {
            const key = getBusinessDateKey(day);
            const dayJobs = jobsByDay.get(key) || [];
            const businessNow = getBusinessNow();
            const isCurrentMonth = day.getMonth() === businessNow.getMonth();
            const isToday =
              getBusinessDateKey(day) === getBusinessDateKey(new Date());

            return (
              <button
                key={key}
                onClick={() => setDrawerDay(key)}
                className={`min-h-[160px] p-3 text-left rounded-lg border border-zinc-200 dark:border-zinc-600 transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md ${
                  isCurrentMonth ? "card-bg" : "bg-zinc-50 dark:bg-zinc-700/50"
                } ${isToday ? "ring-2 ring-blue-500 dark:ring-blue-400" : ""}`}
              >
                {/* Date */}
                <div
                  className={`text-sm font-medium mb-3 ${
                    isCurrentMonth
                      ? "text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  {formatBusinessDate(day, "d")}
                </div>

                {/* Jobs Preview */}
                <div className="space-y-2">
                  {dayJobs.slice(0, 3).map((j) => {
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
                        className="bg-blue-50 dark:bg-blue-900/20 rounded-md px-2 py-2 border border-blue-200 dark:border-blue-800"
                      >
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                          <span className="text-xs font-medium text-blue-800 dark:text-blue-200 truncate">
                            {locationName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="h-3 w-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                          <span className="text-xs text-blue-600 dark:text-blue-400 truncate">
                            {jobTime}
                          </span>
                        </div>
                        {employees.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <Users className="h-3 w-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                            <span className="text-xs text-blue-600 dark:text-blue-400 truncate">
                              {employees[0]}
                              {employees.length > 1 &&
                                ` +${employees.length - 1}`}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {dayJobs.length > 3 && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      +{dayJobs.length - 3} more
                    </div>
                  )}

                  {dayJobs.length === 0 && isCurrentMonth && (
                    <div className="text-xs text-zinc-400 dark:text-zinc-500">
                      No jobs
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
            className="card-bg rounded-t-xl md:rounded-xl p-6 w-full md:w-[600px] max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatBusinessDate(drawerDay, "EEEE, MMMM d")}
                </h3>
              </div>
              <button
                onClick={() => setDrawerDay(null)}
                className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
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
      const key = getBusinessDateKey(d);
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
    <div className="space-y-4">
      {dayJobs.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="h-12 w-12 text-zinc-400 dark:text-zinc-500 mx-auto mb-4" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No jobs scheduled for this day
          </p>
        </div>
      ) : (
        dayJobs.map((j: any) => {
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
              className="bg-zinc-50 dark:bg-zinc-700/50 rounded-lg p-5 border border-zinc-200 dark:border-zinc-600"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
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
                  <div className="flex items-center gap-2 mb-3">
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
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors duration-200"
                >
                  View Details
                </Link>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
