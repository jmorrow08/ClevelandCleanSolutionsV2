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
  limit,
  addDoc,
  updateDoc,
  serverTimestamp,
  GeoPoint,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import {
  makeDayBounds as makeDayBoundsUtil,
  formatJobWindow,
} from "../../utils/time";
import JobDetailsModal from "./JobDetailsModal";

type JobItem = {
  id: string;
  clientName?: string;
  locationId?: string;
  locationName?: string;
  serviceDate?: any;
  serviceType?: string;
  notes?: string;
};

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
  const { user, claims } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [rows, setRows] = useState<JobItem[]>([]);
  const [timeWindows, setTimeWindows] = useState<Record<string, string>>({});
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Clock-in state
  const [profileId, setProfileId] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [clockInAt, setClockInAt] = useState<Date | null>(null);
  const [clockInLocName, setClockInLocName] = useState<string>("");
  const [clockInLocationId, setClockInLocationId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

  // Get current week dates
  const currentWeekDates = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(now);
    const end = endOfWeek(now);
    return { start, end };
  }, []);

  useEffect(() => {
    (async () => {
      if (!user?.uid) return;
      try {
        setLoading(true);
        setError("");
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Resolve employee profileId if available (for legacy assignments)
        let profileId: string | null = null;
        try {
          const us = await getDoc(doc(db, "users", user.uid));
          const userData = us.exists() ? (us.data() as any) : {};
          profileId =
            us.exists() && typeof userData.profileId === "string"
              ? userData.profileId
              : null;
          setProfileId(profileId);
        } catch (e) {
          // Silently handle user data fetch error
        }

        // Build range for current week
        const startDate = currentWeekDates.start;
        const endDate = currentWeekDates.end;

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

        const list = Array.from(map.values());

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
  }, [user?.uid, currentWeekDates]);

  // Check current active time entry
  useEffect(() => {
    if (!profileId || rows.length === 0) return;

    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Check if there's an active time entry for this employee
        const activeEntries = await getDocs(
          query(
            collection(db, "employeeTimeTracking"),
            where("employeeProfileId", "==", profileId),
            where("clockOutTime", "==", null)
          )
        );

        if (!activeEntries.empty) {
          const activeEntry = activeEntries.docs[0];
          const data = activeEntry.data() as any;
          setActiveEntryId(activeEntry.id);
          const t = data?.clockInTime?.toDate
            ? data.clockInTime.toDate()
            : data?.clockInTime?.seconds
            ? new Date(data.clockInTime.seconds * 1000)
            : null;
          setClockInAt(t);
          // Store both locationName and locationId for matching
          setClockInLocName(data?.locationName || "");
          setClockInLocationId(data?.locationId || "");
        } else {
          setActiveEntryId(null);
          setClockInAt(null);
          setClockInLocName("");
          setClockInLocationId("");
        }
      } catch (e) {
        console.error("Error checking active time entry:", e);
      }
    })();
  }, [profileId, rows]);

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
      const s = currentWeekDates.start;
      const e = new Date(currentWeekDates.end);
      e.setDate(e.getDate() - 1); // Show end date as inclusive
      return `${s.toLocaleDateString()} — ${e.toLocaleDateString()}`;
    } catch {
      return "";
    }
  }, [currentWeekDates]);

  const handleJobClick = (jobId: string) => {
    setSelectedJobId(jobId);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedJobId(null);
  };

  // Helper function to determine if job is today
  const isJobToday = (jobDate: any): boolean => {
    if (!jobDate) return false;

    const dt = jobDate?.toDate
      ? jobDate.toDate()
      : jobDate?.seconds
      ? new Date(jobDate.seconds * 1000)
      : null;

    if (!dt) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(dt);
    day.setHours(0, 0, 0, 0);

    return day.getTime() === today.getTime();
  };

  // Helper function to determine if job is completed
  const isJobCompleted = (jobDate: any): boolean => {
    if (!jobDate) return false;

    const dt = jobDate?.toDate
      ? jobDate.toDate()
      : jobDate?.seconds
      ? new Date(jobDate.seconds * 1000)
      : null;

    if (!dt) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(dt);
    day.setHours(0, 0, 0, 0);

    return day < today;
  };

  async function getCoords(): Promise<GeoPoint | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve(new GeoPoint(pos.coords.latitude, pos.coords.longitude)),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  async function clockIn(job: JobItem) {
    if (!user?.uid || !profileId || !job.locationId) {
      setMessage("System error or missing job data.");
      return;
    }

    // Check if job is completed
    if (isJobCompleted(job.serviceDate)) {
      setMessage("Cannot clock in for completed jobs.");
      return;
    }

    // Only allow clock-in for jobs that have started (are "In Progress")
    const dt = job.serviceDate?.toDate
      ? job.serviceDate.toDate()
      : job.serviceDate?.seconds
      ? new Date(job.serviceDate.seconds * 1000)
      : null;

    if (!dt) {
      setMessage("Invalid job date.");
      return;
    }

    const now = new Date();
    if (now < dt) {
      setMessage("Cannot clock in for jobs that haven't started yet.");
      return;
    }

    try {
      setSaving(true);
      setMessage("Getting location & clocking in…");
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const coords = await getCoords();

      const timeEntryData = {
        employeeProfileId: profileId,
        locationId: job.locationId,
        locationName: job.locationName,
        clockInTime: serverTimestamp(),
        clockOutTime: null,
        status: "Clocked In",
        clockInCoordinates: coords,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const ref = await addDoc(
        collection(db, "employeeTimeTracking"),
        timeEntryData
      );

      setActiveEntryId(ref.id);
      setClockInAt(new Date());
      setClockInLocName(job.locationName || "");
      setClockInLocationId(job.locationId || "");
      setMessage("Clocked In!");
    } catch (e: any) {
      setMessage(e?.message || "Error clocking in.");
    } finally {
      setSaving(false);
    }
  }

  async function clockOut() {
    if (!activeEntryId) {
      setMessage("No active clock-in session.");
      return;
    }

    try {
      setSaving(true);
      setMessage("Getting location & clocking out…");
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const coords = await getCoords();

      await updateDoc(doc(db, "employeeTimeTracking", activeEntryId), {
        clockOutTime: serverTimestamp(),
        status: "Clocked Out",
        clockOutCoordinates: coords,
        updatedAt: serverTimestamp(),
      });

      setActiveEntryId(null);
      setClockInAt(null);
      setClockInLocName("");
      setClockInLocationId("");
      setMessage("Clocked Out!");
    } catch (e: any) {
      setMessage(e?.message || "Error clocking out.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My Jobs</h1>
        <div className="text-xs text-zinc-500">{selectedRangeText}</div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-sm text-zinc-500">Loading jobs…</div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-zinc-500">
          No jobs found for this week.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((j) => {
            const dt = j.serviceDate?.toDate
              ? j.serviceDate.toDate()
              : j.serviceDate?.seconds
              ? new Date(j.serviceDate.seconds * 1000)
              : null;
            // Status chip - check if job time has started
            let statusText = "Scheduled";
            let statusClass = "bg-green-100 text-green-800";
            if (dt) {
              const now = new Date();
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const day = new Date(dt);
              day.setHours(0, 0, 0, 0);

              if (day < today) {
                // Job is from a previous day
                statusText = "Completed";
                statusClass = "bg-gray-100 text-gray-800";
              } else if (day.getTime() === today.getTime()) {
                // Job is today - check if the scheduled time has started
                if (now >= dt) {
                  statusText = "In Progress";
                  statusClass = "bg-blue-100 text-blue-800";
                } else {
                  statusText = "Scheduled";
                  statusClass = "bg-green-100 text-green-800";
                }
              }
            }

            const isCurrentlyClockedIn =
              !!activeEntryId &&
              (clockInLocName === j.locationName ||
                clockInLocationId === j.locationId);

            const jobCompleted = isJobCompleted(j.serviceDate);
            const isToday = isJobToday(j.serviceDate);
            const now = new Date();

            return (
              <div
                key={j.id}
                className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1 border border-zinc-200 dark:border-zinc-700"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-medium">
                      {j.locationName ||
                        (j.locationId
                          ? `Location ${j.locationId.slice(0, 8)}...`
                          : "Unknown Location")}
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

                {/* Clock In/Out Section for Jobs that have started */}
                {isToday && !jobCompleted && now >= dt && (
                  <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            isCurrentlyClockedIn ? "bg-green-500" : "bg-red-500"
                          }`}
                        ></div>
                        <span className="text-sm text-zinc-500">
                          {isCurrentlyClockedIn
                            ? `Clocked in since ${
                                clockInAt?.toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                                }) || "—"
                              }`
                            : "Not clocked in"}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        {!isCurrentlyClockedIn ? (
                          <button
                            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs disabled:bg-zinc-400 disabled:cursor-not-allowed"
                            onClick={() => clockIn(j)}
                            disabled={saving || !!activeEntryId}
                          >
                            {saving ? "Working…" : "Clock In"}
                          </button>
                        ) : (
                          <button
                            className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs disabled:bg-zinc-400 disabled:cursor-not-allowed"
                            onClick={clockOut}
                            disabled={saving}
                          >
                            {saving ? "Working…" : "Clock Out"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Click to view details for non-today jobs */}
                {!isToday && (
                  <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                    <button
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      onClick={() => handleJobClick(j.id)}
                    >
                      View Details →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {message && (
        <div
          className={`text-sm p-3 rounded-md ${
            message.includes("Error") || message.includes("Failed")
              ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              : message.includes("Clocked In") ||
                message.includes("Clocked Out")
              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
              : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
          }`}
        >
          {message}
        </div>
      )}

      {/* Job Details Modal */}
      <JobDetailsModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        jobId={selectedJobId}
      />
    </div>
  );
}
