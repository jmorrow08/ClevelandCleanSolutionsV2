import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  updateDoc,
  doc,
  writeBatch,
  getDoc,
} from "firebase/firestore";
import {
  formatCurrency,
  calculateTimesheetEarnings,
} from "../../utils/rateUtils";
import { getLocationName } from "../../services/queries/resolvers";
import type { Timesheet } from "../../types/timesheet";
import { getApps, initializeApp } from "firebase/app";
import { firebaseConfig } from "../../services/firebase";

type WeeklyTimesheet = Timesheet & {
  employeeName?: string;
  jobDate?: Date;
  earnings?: number;
  locationId?: string;
};

type WeeklySummary = {
  employeeId: string;
  employeeName: string;
  totalHours: number;
  totalEarnings: number;
  timesheets: WeeklyTimesheet[];
  pendingApproval: number;
};

export default function WeeklyPayrollReview() {
  const { user, claims } = useAuth();
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [timesheets, setTimesheets] = useState<WeeklyTimesheet[]>([]);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>(
    {}
  );
  const [approving, setApproving] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    return startOfWeek;
  });
  const [locationNames, setLocationNames] = useState<Record<string, string>>(
    {}
  );

  const isAdmin = claims?.admin || claims?.owner || claims?.super_admin;

  // Calculate week end
  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6); // End of week (Saturday)
    end.setHours(23, 59, 59, 999);
    return end;
  }, [weekStart]);

  // Load employee names
  useEffect(() => {
    const db = getFirestore();
    const unsubscribe = onSnapshot(
      collection(db, "employeeMasterList"),
      (snapshot) => {
        const names: Record<string, string> = {};
        snapshot.forEach((doc) => {
          const data = doc.data();
          names[doc.id] =
            data.fullName ||
            [data.firstName, data.lastName].filter(Boolean).join(" ") ||
            doc.id;
        });
        setEmployeeNames(names);
      }
    );
    return unsubscribe;
  }, []);

  // Load timesheets for the current week
  useEffect(() => {
    if (!user?.uid) return;

    setLoading(true);
    const db = getFirestore();

    let timesheetsQuery;
    if (isAdmin) {
      // Admin sees all timesheets
      timesheetsQuery = query(
        collection(db, "timesheets"),
        where("start", ">=", Timestamp.fromDate(weekStart)),
        where("start", "<=", Timestamp.fromDate(weekEnd)),
        orderBy("start", "desc")
      );
    } else {
      // Employee sees only their own timesheets
      timesheetsQuery = query(
        collection(db, "timesheets"),
        where("employeeId", "==", user.uid),
        where("start", ">=", Timestamp.fromDate(weekStart)),
        where("start", "<=", Timestamp.fromDate(weekEnd)),
        orderBy("start", "desc")
      );
    }

    // Note: We don't filter out archived jobs here because timesheets
    // are separate from serviceHistory jobs. Archived jobs won't create
    // new timesheets, and existing timesheets from archived jobs
    // will still be visible for payroll processing.

    const unsubscribe = onSnapshot(
      timesheetsQuery,
      (snapshot) => {
        const loadedTimesheets: WeeklyTimesheet[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as any;
          const startDate = data.start?.toDate
            ? data.start.toDate()
            : new Date(data.start);

          loadedTimesheets.push({
            id: doc.id,
            ...data,
            employeeName: employeeNames[data.employeeId] || data.employeeId,
            jobDate: startDate,
            earnings: calculateTimesheetEarnings({
              ...data,
              periodStart: weekStart,
              periodEnd: weekEnd,
            }),
          });
        });
        setTimesheets(loadedTimesheets);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading timesheets:", error);
        show({ type: "error", message: "Failed to load timesheets" });
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user?.uid, isAdmin, weekStart, weekEnd, employeeNames, show]);

  // Resolve location names for timesheets
  useEffect(() => {
    (async () => {
      try {
        // First, collect all unique location IDs from timesheets that have them
        const uniqueLocationIds = Array.from(
          new Set(
            timesheets
              .map((ts) => ts.locationId)
              .filter((v): v is string => typeof v === "string" && !!v)
          )
        );

        // Also collect job IDs for timesheets that don't have locationId
        const timesheetsNeedingLocationLookup = timesheets.filter(
          (ts) => !ts.locationId && ts.jobId
        );

        const locationNamePromises = uniqueLocationIds.map(
          async (locationId) => {
            try {
              const name = await getLocationName(locationId);
              return { locationId, name };
            } catch (error) {
              console.warn(
                `Failed to resolve location name for ${locationId}:`,
                error
              );
              return { locationId, name: locationId };
            }
          }
        );

        // Look up location IDs from serviceHistory for timesheets that don't have them
        const serviceHistoryLocationPromises =
          timesheetsNeedingLocationLookup.map(async (ts) => {
            try {
              if (!getApps().length) initializeApp(firebaseConfig);
              const db = getFirestore();
              if (!ts.jobId) {
                return { jobId: ts.id, locationId: null, locationName: ts.id };
              }
              const serviceHistoryDoc = await getDoc(
                doc(db, "serviceHistory", ts.jobId)
              );
              if (serviceHistoryDoc.exists()) {
                const serviceData = serviceHistoryDoc.data();
                const locationId = serviceData.locationId;
                if (locationId) {
                  const locationName = await getLocationName(locationId);
                  return { jobId: ts.jobId, locationId, locationName };
                }
              }
              return {
                jobId: ts.jobId,
                locationId: null,
                locationName: ts.jobId,
              };
            } catch (error) {
              console.warn(
                `Failed to resolve location for job ${ts.jobId}:`,
                error
              );
              return {
                jobId: ts.jobId,
                locationId: null,
                locationName: ts.jobId,
              };
            }
          });

        const [locationNameResults, serviceHistoryResults] = await Promise.all([
          Promise.all(locationNamePromises),
          Promise.all(serviceHistoryLocationPromises),
        ]);

        const newLocationNames: Record<string, string> = {};

        // Add direct location name resolutions
        locationNameResults.forEach(({ locationId, name }) => {
          newLocationNames[locationId] = name;
        });

        // Add serviceHistory-based location name resolutions
        serviceHistoryResults.forEach(({ jobId, locationId, locationName }) => {
          if (locationId && typeof locationId === "string") {
            newLocationNames[locationId] = locationName || locationId;
          }
          // Also store by jobId for direct lookup
          if (jobId && typeof jobId === "string") {
            newLocationNames[jobId] = locationName || jobId;
          }
        });

        setLocationNames((prev) => ({ ...prev, ...newLocationNames }));
      } catch (error) {
        console.error("Error resolving location names:", error);
      }
    })();
  }, [timesheets]);

  // Group timesheets by employee
  const weeklySummaries = useMemo(() => {
    const summaries: Record<string, WeeklySummary> = {};

    timesheets.forEach((ts) => {
      const employeeId = ts.employeeId;
      if (!summaries[employeeId]) {
        summaries[employeeId] = {
          employeeId,
          employeeName: ts.employeeName || employeeId,
          totalHours: 0,
          totalEarnings: 0,
          timesheets: [],
          pendingApproval: 0,
        };
      }

      summaries[employeeId].timesheets.push(ts);
      summaries[employeeId].totalHours += ts.hours || 0;
      summaries[employeeId].totalEarnings += ts.earnings || 0;

      if (!ts.adminApproved) {
        summaries[employeeId].pendingApproval++;
      }
    });

    return Object.values(summaries).sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName)
    );
  }, [timesheets]);

  // Approve timesheets
  const approveTimesheets = async (timesheetIds: string[]) => {
    if (!isAdmin) return;

    setApproving(true);
    try {
      const db = getFirestore();
      const batch = writeBatch(db);

      timesheetIds.forEach((id) => {
        batch.update(doc(db, "timesheets", id), {
          adminApproved: true,
          updatedAt: Timestamp.now(),
        });
      });

      await batch.commit();
      show({
        type: "success",
        message: `Approved ${timesheetIds.length} timesheet(s)`,
      });
    } catch (error) {
      console.error("Error approving timesheets:", error);
      show({ type: "error", message: "Failed to approve timesheets" });
    } finally {
      setApproving(false);
    }
  };

  // Approve all pending timesheets for an employee
  const approveEmployeeTimesheets = async (employeeId: string) => {
    const employeeTimesheets = timesheets.filter(
      (ts) => ts.employeeId === employeeId && !ts.adminApproved
    );
    const ids = employeeTimesheets.map((ts) => ts.id);
    await approveTimesheets(ids);
  };

  // Approve all pending timesheets
  const approveAllPending = async () => {
    const pendingIds = timesheets
      .filter((ts) => !ts.adminApproved)
      .map((ts) => ts.id);
    await approveTimesheets(pendingIds);
  };

  const navigateWeek = (direction: "prev" | "next") => {
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(weekStart.getDate() + (direction === "next" ? 7 : -7));
    setWeekStart(newWeekStart);
  };

  const formatWeekRange = () => {
    const start = weekStart.toLocaleDateString();
    const end = weekEnd.toLocaleDateString();
    return `${start} - ${end}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-zinc-500">Loading payroll review...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Weekly Payroll Review</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {formatWeekRange()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWeek("prev")}
            className="px-3 py-2 border rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Previous Week
          </button>
          <button
            onClick={() => navigateWeek("next")}
            className="px-3 py-2 border rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800"
            disabled={weekEnd > new Date()}
          >
            Next Week →
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
          <div className="text-sm text-zinc-500">Total Timesheets</div>
          <div className="text-2xl font-bold">{timesheets.length}</div>
        </div>
        <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
          <div className="text-sm text-zinc-500">Pending Approval</div>
          <div className="text-2xl font-bold text-amber-600">
            {timesheets.filter((ts) => !ts.adminApproved).length}
          </div>
        </div>
        <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
          <div className="text-sm text-zinc-500">Total Hours</div>
          <div className="text-2xl font-bold">
            {timesheets
              .reduce((sum, ts) => sum + (ts.hours || 0), 0)
              .toFixed(1)}
          </div>
        </div>
        <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
          <div className="text-sm text-zinc-500">Total Earnings</div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(
              timesheets.reduce((sum, ts) => sum + (ts.earnings || 0), 0)
            )}
          </div>
        </div>
      </div>

      {/* Bulk Actions (Admin Only) */}
      {isAdmin && timesheets.some((ts) => !ts.adminApproved) && (
        <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Bulk Actions</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Approve all pending timesheets for this week
              </p>
            </div>
            <button
              onClick={approveAllPending}
              disabled={approving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {approving ? "Approving..." : "Approve All Pending"}
            </button>
          </div>
        </div>
      )}

      {/* Employee Summaries */}
      <div className="space-y-4">
        {weeklySummaries.map((summary) => (
          <div
            key={summary.employeeId}
            className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium">{summary.employeeName}</h3>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  {summary.timesheets.length} timesheets •{" "}
                  {summary.totalHours.toFixed(1)} hours •{" "}
                  {formatCurrency(summary.totalEarnings)}
                </div>
              </div>
              {isAdmin && summary.pendingApproval > 0 && (
                <button
                  onClick={() => approveEmployeeTimesheets(summary.employeeId)}
                  disabled={approving}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  Approve All ({summary.pendingApproval})
                </button>
              )}
            </div>

            {/* Timesheet Details */}
            <div className="space-y-2">
              {summary.timesheets.map((ts) => (
                <div
                  key={ts.id}
                  className="flex items-center justify-between py-2 px-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-md"
                >
                  <div className="flex-1">
                    <div className="text-sm">
                      {ts.jobDate?.toLocaleDateString()} •{" "}
                      {ts.hours?.toFixed(1)} hours
                      {ts.source && (
                        <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                          {ts.source}
                        </span>
                      )}
                    </div>
                    {ts.jobId && (
                      <div className="text-xs text-zinc-500">
                        Job: {locationNames[ts.jobId] || ts.jobId}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium">
                      {formatCurrency(ts.earnings || 0)}
                    </div>
                    <div className="flex gap-1">
                      {ts.employeeApproved && (
                        <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                          Employee ✓
                        </span>
                      )}
                      {ts.adminApproved ? (
                        <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                          Admin ✓
                        </span>
                      ) : isAdmin ? (
                        <button
                          onClick={() => approveTimesheets([ts.id])}
                          disabled={approving}
                          className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-1 rounded hover:bg-amber-200 dark:hover:bg-amber-800"
                        >
                          Approve
                        </button>
                      ) : (
                        <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-1 rounded">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {timesheets.length === 0 && (
        <div className="text-center py-8 text-zinc-500">
          No timesheets found for this week
        </div>
      )}
    </div>
  );
}
