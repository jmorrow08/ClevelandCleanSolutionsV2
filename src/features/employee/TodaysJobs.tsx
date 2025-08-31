import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
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
  addDoc,
  updateDoc,
  serverTimestamp,
  GeoPoint,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { formatJobWindow } from "../../utils/time";

type JobItem = {
  id: string;
  clientName?: string;
  locationId?: string;
  locationName?: string;
  serviceDate?: any;
  serviceType?: string;
  notes?: string;
};

export default function TodaysJobs() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [clockInAt, setClockInAt] = useState<Date | null>(null);
  const [clockInLocName, setClockInLocName] = useState<string>("");
  const [activeLocationId, setActiveLocationId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

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

  useEffect(() => {
    async function load() {
      if (!user?.uid) return;

      try {
        setLoading(true);
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Get today's date bounds
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Resolve employee profileId
        try {
          const us = await getDoc(doc(db, "users", user.uid));
          const pid =
            us.exists() && typeof (us.data() as any).profileId === "string"
              ? (us.data() as any).profileId
              : null;
          setProfileId(pid);
        } catch {}

        // Primary query: UID assigned for today
        const qPrimary = query(
          collection(db, "serviceHistory"),
          where("assignedEmployees", "array-contains", user.uid),
          where("serviceDate", ">=", Timestamp.fromDate(today)),
          where("serviceDate", "<", Timestamp.fromDate(tomorrow)),
          orderBy("serviceDate", "asc")
        );
        const map = new Map<string, JobItem>();
        const snap1 = await getDocs(qPrimary);
        snap1.forEach((d) => map.set(d.id, { id: d.id, ...(d.data() as any) }));

        // Secondary: profileId assigned for today
        if (profileId) {
          const qSecondary = query(
            collection(db, "serviceHistory"),
            where("assignedEmployees", "array-contains", profileId),
            where("serviceDate", ">=", Timestamp.fromDate(today)),
            where("serviceDate", "<", Timestamp.fromDate(tomorrow)),
            orderBy("serviceDate", "asc")
          );
          const snap2 = await getDocs(qSecondary);
          snap2.forEach((d) =>
            map.set(d.id, { id: d.id, ...(d.data() as any) })
          );
        }

        // Fallback: legacy employeeAssignments for today
        if (map.size === 0) {
          const qFallback = query(
            collection(db, "serviceHistory"),
            where("serviceDate", ">=", Timestamp.fromDate(today)),
            where("serviceDate", "<", Timestamp.fromDate(tomorrow)),
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

        // Filter to only today's jobs and sort by service date
        const todayJobs = Array.from(map.values()).filter((job) =>
          isJobToday(job.serviceDate)
        );

        todayJobs.sort((a, b) => {
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

        setJobs(todayJobs);
      } catch (error) {
        console.error("Error loading today's jobs:", error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user?.uid, profileId]);

  // Check current active time entry
  useEffect(() => {
    if (!profileId || jobs.length === 0) return;

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
          setActiveEntryId(activeEntry.id);
          const data = activeEntry.data() as any;
          const t = data?.clockInTime?.toDate
            ? data.clockInTime.toDate()
            : data?.clockInTime?.seconds
            ? new Date(data.clockInTime.seconds * 1000)
            : null;
          setClockInAt(t);
          setClockInLocName(data?.locationName || "");
          setActiveLocationId(data?.locationId || "");
        } else {
          setActiveEntryId(null);
          setClockInAt(null);
          setClockInLocName("");
          setActiveLocationId("");
        }
      } catch (e) {
        console.error("Error checking active time entry:", e);
      }
    })();
  }, [profileId, jobs]);

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

    try {
      setSaving(true);
      setMessage("Getting location & clocking in…");
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const coords = await getCoords();

      const ref = await addDoc(collection(db, "employeeTimeTracking"), {
        employeeProfileId: profileId,
        locationId: job.locationId,
        locationName: job.locationName,
        clockInTime: serverTimestamp(),
        clockOutTime: null,
        status: "Clocked In",
        clockInCoordinates: coords,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActiveEntryId(ref.id);
      setClockInAt(new Date());
      setClockInLocName(job.locationName || "");
      setActiveLocationId(job.locationId || "");
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
      setActiveLocationId("");
      setMessage("Clocked Out!");
    } catch (e: any) {
      setMessage(e?.message || "Error clocking out.");
    } finally {
      setSaving(false);
    }
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

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="text-sm text-zinc-500">Loading today's jobs…</div>
      ) : jobs.length === 0 ? (
        <div className="text-sm text-zinc-500">No jobs assigned for today.</div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const dt = job.serviceDate?.toDate
              ? job.serviceDate.toDate()
              : job.serviceDate?.seconds
              ? new Date(job.serviceDate.seconds * 1000)
              : null;

            // Status chip
            let statusText = "Scheduled";
            let statusClass = "bg-green-100 text-green-800";
            if (isJobCompleted(job.serviceDate)) {
              statusText = "Completed";
              statusClass = "bg-gray-100 text-gray-800";
            } else if (isJobToday(job.serviceDate)) {
              statusText = "Today";
              statusClass = "bg-blue-100 text-blue-800";
            }

            const isCurrentlyClockedIn =
              activeEntryId && activeLocationId === job.locationId;
            const jobCompleted = isJobCompleted(job.serviceDate);

            return (
              <div
                key={job.id}
                className="rounded-lg p-4 card-bg shadow-elev-1 border border-zinc-200 dark:border-zinc-700"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="font-medium">
                      {job.locationName ||
                        (job.locationId
                          ? `Location ${job.locationId.slice(0, 8)}...`
                          : "Unknown Location")}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {job.clientName || "Unknown Client"}
                    </div>
                    {job.serviceType && (
                      <div className="text-sm text-zinc-500 mt-1">
                        {job.serviceType}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${statusClass}`}
                    >
                      {statusText}
                    </span>
                    <span className="text-sm text-zinc-500">
                      {formatTime(dt)}
                    </span>
                  </div>
                </div>

                {job.notes && (
                  <div className="text-xs text-zinc-500 italic mb-3">
                    {job.notes}
                  </div>
                )}

                {/* Quick Clock In/Out Button */}
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

                  {!jobCompleted && (
                    <div className="flex gap-2">
                      {!isCurrentlyClockedIn ? (
                        <button
                          className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs disabled:bg-zinc-400 disabled:cursor-not-allowed"
                          onClick={() => clockIn(job)}
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
                  )}
                </div>

                {jobCompleted && (
                  <div className="text-xs text-zinc-500 mt-2 bg-gray-50 dark:bg-gray-900/20 rounded p-2">
                    This job has been completed. Time clock functionality is
                    disabled.
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
    </div>
  );
}
