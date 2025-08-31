import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import {
  makeDayBounds as makeDayBoundsUtil,
  formatJobWindow,
} from "../../utils/time";
import { useAuth } from "../../context/AuthContext";
import { getLocationName } from "../../services/queries/resolvers";
import { deriveClientStatus } from "../../services/statusMap";
import PhotoModal from "../../components/ui/PhotoModal";

type Job = {
  id: string;
  status?: string;
  serviceDate?: any;
  clientProfileId?: string;
  locationId?: string;
};

type Photo = {
  id: string;
  photoUrl?: string;
  uploadedAt?: any;
};

function formatDateTimeInET(d?: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("en-US", { timeZone: "America/New_York" });
}

export default function ClientJobTimeline() {
  const { profileId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [modal, setModal] = useState<null | {
    type: "photos";
    job: Job;
    photos: Photo[];
    currentIndex: number;
  }>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        if (!profileId) {
          setAllJobs([]);
          return;
        }

        // Load all jobs for this client and categorize them using deriveClientStatus
        try {
          const qAll = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            orderBy("serviceDate", "desc"),
            limit(50) // Increased limit to get more jobs for proper categorization
          );
          const s = await getDocs(qAll);
          const jobs = s.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Record<string, unknown>),
          }));
          setAllJobs(jobs);
        } catch (e: unknown) {
          console.warn(
            "Client jobs query may require index",
            (e as Error)?.message
          );
          setAllJobs([]);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profileId]);

  // Categorize jobs using deriveClientStatus
  const { completed, inProgress, upcoming } = useMemo(() => {
    const now = new Date();
    const categorized = {
      completed: [] as Job[],
      inProgress: [] as Job[],
      upcoming: [] as Job[],
    };

    allJobs.forEach((job) => {
      const clientStatus = deriveClientStatus(job, now);
      if (clientStatus === "completed") {
        categorized.completed.push(job);
      } else if (clientStatus === "in_progress") {
        categorized.inProgress.push(job);
      } else if (clientStatus === "upcoming") {
        categorized.upcoming.push(job);
      }
    });

    // Sort each category appropriately
    categorized.completed.sort((a, b) => {
      const aDate = a.serviceDate?.toDate?.() || new Date(0);
      const bDate = b.serviceDate?.toDate?.() || new Date(0);
      return bDate.getTime() - aDate.getTime(); // newest first
    });
    categorized.inProgress.sort((a, b) => {
      const aDate = a.serviceDate?.toDate?.() || new Date(0);
      const bDate = b.serviceDate?.toDate?.() || new Date(0);
      return bDate.getTime() - aDate.getTime(); // newest first
    });
    categorized.upcoming.sort((a, b) => {
      const aDate = a.serviceDate?.toDate?.() || new Date(0);
      const bDate = b.serviceDate?.toDate?.() || new Date(0);
      return aDate.getTime() - bDate.getTime(); // oldest first
    });

    return categorized;
  }, [allJobs]);

  const empty = useMemo(
    () => !completed.length && !inProgress.length && !upcoming.length,
    [completed.length, inProgress.length, upcoming.length]
  );

  return (
    <div className="rounded-lg p-4 card-bg shadow-elev-1">
      <div className="font-medium">Service Timeline</div>
      {loading ? (
        <div className="text-sm text-zinc-500 mt-2">Loading…</div>
      ) : empty ? (
        <div className="text-sm text-zinc-500 mt-2">No services to show</div>
      ) : (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <TimelineColumn
            title="In Progress"
            jobs={inProgress}
            accent="bg-amber-100 dark:bg-amber-900/30"
            onSelect={(j, photos) =>
              setModal({ type: "photos", job: j, photos, currentIndex: 0 })
            }
          />
          <TimelineColumn
            title="Upcoming"
            jobs={upcoming}
            accent="bg-blue-100 dark:bg-blue-900/30"
            onSelect={(j, photos) =>
              setModal({ type: "photos", job: j, photos, currentIndex: 0 })
            }
          />
          <TimelineColumn
            title="Past"
            jobs={completed}
            accent="bg-zinc-100 dark:bg-zinc-700"
            onSelect={(j, photos) =>
              setModal({ type: "photos", job: j, photos, currentIndex: 0 })
            }
          />
        </div>
      )}

      {modal?.type === "photos" && (
        <PhotoModal
          isOpen={true}
          onClose={() => setModal(null)}
          photos={modal.photos}
          currentIndex={modal.currentIndex}
          onIndexChange={(index) =>
            setModal((prev) => (prev ? { ...prev, currentIndex: index } : null))
          }
        />
      )}
    </div>
  );
}

function TimelineColumn({
  title,
  jobs,
  accent,
  onSelect,
}: {
  title: string;
  jobs: Job[];
  accent: string;
  onSelect: (j: Job, photos: Photo[]) => void;
}) {
  const [windows, setWindows] = useState<Record<string, string>>({});
  const [locationNames, setLocationNames] = useState<Record<string, string>>(
    {}
  );
  const [jobPhotos, setJobPhotos] = useState<Record<string, Photo[]>>({});

  useEffect(() => {
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const map: Record<string, string> = {};
        for (const j of jobs) {
          const dt: Date | null = j.serviceDate?.toDate
            ? j.serviceDate.toDate()
            : j.serviceDate?.seconds
            ? new Date(j.serviceDate.seconds * 1000)
            : null;
          if (!dt || !j.locationId) {
            map[j.id] = formatJobWindow(j.serviceDate);
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
            const rows: any[] = [];
            snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
            const assigned = Array.isArray((j as any).assignedEmployees)
              ? ((j as any).assignedEmployees as string[])
              : [];
            let rec = rows.find((r) =>
              assigned.includes((r as any).employeeProfileId || "")
            );
            if (!rec) rec = rows[0];
            if (rec?.clockInTime?.toDate && rec?.clockOutTime?.toDate) {
              map[j.id] = formatJobWindow(j.serviceDate, {
                start: rec.clockInTime,
                end: rec.clockOutTime,
              });
            } else if (rec?.clockInTime?.toDate && !rec?.clockOutTime) {
              map[j.id] = formatJobWindow(j.serviceDate);
            } else {
              map[j.id] = formatJobWindow(j.serviceDate);
            }
          } catch {
            map[j.id] = formatJobWindow(j.serviceDate);
          }
        }
        setWindows(map);
      } catch {}

      // Resolve location names
      try {
        const locationMap: Record<string, string> = {};
        for (const j of jobs) {
          // First, try to get location name from the job record itself
          let locationName =
            (j as any).locationName || (j as any).name || (j as any).location;

          // If not found on job record, try to resolve from locationId
          if (!locationName && j.locationId) {
            try {
              locationName = await getLocationName(j.locationId);
            } catch (error) {
              console.warn(
                "Failed to resolve location name for job:",
                j.id,
                error
              );
              locationName = j.locationId || "Unknown Location";
            }
          }

          // If still no name, use fallback
          if (!locationName) {
            locationName = j.locationId
              ? `Location ${j.locationId.slice(0, 8)}...`
              : "Unknown Location";
          }

          locationMap[j.id] = locationName;
        }
        setLocationNames(locationMap);
      } catch (error) {
        console.warn("Failed to resolve location names:", error);
      }
    })();
  }, [jobs]);

  // Load photos for jobs when clicked
  const loadPhotosForJob = async (job: Job): Promise<Photo[]> => {
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const svcDate: Date | null = job.serviceDate?.toDate
        ? job.serviceDate.toDate()
        : null;
      const { start, end } = makeDayBoundsUtil(
        svcDate || new Date(),
        "America/New_York"
      );
      const qref = query(
        collection(db, "servicePhotos"),
        where("locationId", "==", job.locationId || ""),
        where("uploadedAt", ">=", Timestamp.fromDate(start)),
        where("uploadedAt", "<=", Timestamp.fromDate(end)),
        where("isClientVisible", "==", true),
        orderBy("uploadedAt", "desc")
      );
      const snap = await getDocs(qref);
      const list: Photo[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      return list;
    } catch (e: any) {
      console.warn("Client photos query may require index", e?.message);
      return [];
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      {jobs.length === 0 ? (
        <div className="text-xs text-zinc-500">No items</div>
      ) : (
        <ul className="text-sm divide-y divide-zinc-200 dark:divide-zinc-700">
          {jobs.map((j) => (
            <li
              key={j.id}
              className="py-2 cursor-pointer"
              onClick={async () => {
                const photos = await loadPhotosForJob(j);
                onSelect(j, photos);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {(j.serviceDate?.toDate
                      ? j.serviceDate.toDate().toLocaleDateString("en-US", {
                          timeZone: "America/New_York",
                        })
                      : "—") + " "}
                    <span className="text-xs text-zinc-500">
                      {windows[j.id] || formatJobWindow(j.serviceDate)}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 truncate mt-0.5">
                    {locationNames[j.id] || "Loading..."}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-md text-xs ${
                    title === "Past"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                      : accent
                  }`}
                >
                  {title === "Past" ? "Completed" : j.status || "—"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
