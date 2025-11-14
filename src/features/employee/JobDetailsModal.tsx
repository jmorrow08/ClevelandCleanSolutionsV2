import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  GeoPoint,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import {
  getClientName,
  getLocationName,
} from "../../services/queries/resolvers";

type JobDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  jobId: string | null;
};

type JobData = {
  id: string;
  clientName?: string;
  clientProfileId?: string;
  locationId?: string;
  locationName?: string;
  serviceDate?: any;
  serviceType?: string;
  notes?: string;
};

export default function JobDetailsModal({
  isOpen,
  onClose,
  jobId,
}: JobDetailsModalProps) {
  const { user } = useAuth();
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [clockInAt, setClockInAt] = useState<Date | null>(null);
  const [clockInLocName, setClockInLocName] = useState<string>("");

  // Helper function to determine if job is completed
  const isJobCompleted = (jobData: JobData | null): boolean => {
    if (!jobData?.serviceDate) return false;

    const dt = jobData.serviceDate?.toDate
      ? jobData.serviceDate.toDate()
      : jobData.serviceDate?.seconds
      ? new Date(jobData.serviceDate.seconds * 1000)
      : null;

    if (!dt) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(dt);
    day.setHours(0, 0, 0, 0);

    return day < today;
  };

  // Load job data when modal opens
  useEffect(() => {
    if (!isOpen || !jobId) return;

    (async () => {
      try {
        setLoading(true);
        setMessage("");
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Get job data
        const jobDoc = await getDoc(doc(db, "serviceHistory", jobId));
        if (!jobDoc.exists()) {
          setMessage("Job not found.");
          return;
        }
        const raw = { id: jobDoc.id, ...(jobDoc.data() as any) } as any;

        // Debug: log available fields to see what client reference we have
        console.log("Job document fields:", Object.keys(raw));
        console.log("Client fields:", {
          clientProfileId: raw.clientProfileId,
          clientId: raw.clientId,
          clientName: raw.clientName,
        });

        // Resolve friendly names from master collections
        const [resolvedClientName, resolvedLocationName] = await Promise.all([
          raw.clientProfileId
            ? getClientName(raw.clientProfileId)
            : raw.clientId
            ? getClientName(raw.clientId)
            : Promise.resolve(raw.clientName),
          raw.locationId
            ? getLocationName(raw.locationId)
            : Promise.resolve(raw.locationName),
        ]);

        setJobData({
          ...raw,
          clientName: resolvedClientName || raw.clientName,
          locationName: resolvedLocationName || raw.locationName,
        });

        // Resolve employee profileId
        if (user?.uid) {
          try {
            const us = await getDoc(doc(db, "users", user.uid));
            const pid =
              us.exists() && typeof (us.data() as any).profileId === "string"
                ? (us.data() as any).profileId
                : null;
            setProfileId(pid);
          } catch {}
        }
      } catch (e: any) {
        setMessage(e?.message || "Failed to load job details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, jobId, user?.uid]);

  // Check current active time entry for this job
  useEffect(() => {
    if (!isOpen || !profileId || !jobData?.locationId) return;

    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Check if there's an active time entry for this employee at this location
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Look for active time entry (no clock out time) for this employee at this location today
        const timeTrackingRef = collection(db, "employeeTimeTracking");

        // For now, we'll use a simple approach - check if there's any active entry
        // In a more sophisticated implementation, we'd query by date range
        const activeEntries = await getDocs(
          query(
            timeTrackingRef,
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
        } else {
          setActiveEntryId(null);
          setClockInAt(null);
          setClockInLocName("");
        }
      } catch (e) {
        console.error("Error checking active time entry:", e);
      }
    })();
  }, [isOpen, profileId, jobData?.locationId]);

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

  async function clockIn() {
    if (!user?.uid || !profileId || !jobData?.locationId) {
      setMessage("System error or missing job data.");
      return;
    }

    // Check if job is completed
    if (isJobCompleted(jobData)) {
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
        locationId: jobData.locationId,
        locationName: jobData.locationName,
        clockInTime: serverTimestamp(),
        clockOutTime: null,
        status: "Clocked In",
        clockInCoordinates: coords,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActiveEntryId(ref.id);
      setClockInAt(new Date());
      setClockInLocName(jobData.locationName || "");
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

    // Check if job is completed
    if (isJobCompleted(jobData)) {
      setMessage("Cannot clock out for completed jobs.");
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

  if (!isOpen) return null;

  const jobCompleted = isJobCompleted(jobData);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="card-bg rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="text-lg font-semibold">Job Details</h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-zinc-500">Loading job details...</p>
            </div>
          ) : jobData ? (
            <>
              {/* Job Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    Client
                  </div>
                  <div className="font-medium">
                    {jobData.clientName || "Unknown Client"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    Location
                  </div>
                  <div className="font-medium">
                    {jobData.locationName ||
                      jobData.locationId ||
                      "Unknown Location"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    Service Date
                  </div>
                  <div className="font-medium">
                    {jobData.serviceDate?.toDate
                      ? formatDate(jobData.serviceDate.toDate())
                      : jobData.serviceDate?.seconds
                      ? formatDate(new Date(jobData.serviceDate.seconds * 1000))
                      : "No date"}
                  </div>
                </div>
                {jobData.serviceType && (
                  <div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      Service Type
                    </div>
                    <div className="font-medium">{jobData.serviceType}</div>
                  </div>
                )}
              </div>

              {jobData.notes && (
                <div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    Notes
                  </div>
                  <div className="text-sm bg-[var(--muted)] p-3 rounded-md">
                    {jobData.notes}
                  </div>
                </div>
              )}

              {/* Time Clock Section */}
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-6">
                <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Time Clock
                </h4>

                <div className="space-y-4">
                  {/* Current Status */}
                  <div className="flex items-center justify-between p-4 bg-[var(--muted)] rounded-lg">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-3 w-3 rounded-full ${
                          activeEntryId ? "bg-green-500" : "bg-red-500"
                        }`}
                      ></div>
                      <div>
                        <p className="font-medium">Current Status</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          {activeEntryId
                            ? `Clocked In @ ${
                                clockInLocName || "This Location"
                              } since ${
                                clockInAt
                                  ? clockInAt.toLocaleTimeString([], {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })
                                  : "—"
                              }`
                            : "Clocked Out"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {jobCompleted ? (
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          Job Completed
                        </div>
                      ) : !activeEntryId ? (
                        <button
                          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:bg-zinc-400 disabled:cursor-not-allowed"
                          onClick={clockIn}
                          disabled={saving}
                        >
                          {saving ? "Working…" : "Clock In"}
                        </button>
                      ) : (
                        <button
                          className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm disabled:bg-zinc-400 disabled:cursor-not-allowed"
                          onClick={clockOut}
                          disabled={saving}
                        >
                          {saving ? "Working…" : "Clock Out"}
                        </button>
                      )}
                    </div>
                  </div>

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

                  {jobCompleted ? (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded p-3">
                      This job has been completed. Time clock functionality is
                      disabled for completed jobs.
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                      Location-based clock-in/out. Your location will be
                      recorded for time tracking.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-red-500">
                {message || "Failed to load job details."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
