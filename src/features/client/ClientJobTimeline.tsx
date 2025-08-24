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
import { firebaseConfig, makeDayBounds } from "../../services/firebase";
import {
  makeDayBounds as makeDayBoundsUtil,
  formatJobWindow,
} from "../../utils/time";
import { useAuth } from "../../context/AuthContext";
import { getLocationName } from "../../services/queries/resolvers";

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
  const [completed, setCompleted] = useState<Job[]>([]);
  const [inProgress, setInProgress] = useState<Job[]>([]);
  const [upcoming, setUpcoming] = useState<Job[]>([]);
  const [modal, setModal] = useState<null | { type: "photos"; job: Job }>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        if (!profileId) {
          setCompleted([]);
          setInProgress([]);
          setUpcoming([]);
          return;
        }

        try {
          const qCompleted = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            where("status", "==", "Completed"),
            orderBy("serviceDate", "desc"),
            limit(20)
          );
          const s = await getDocs(qCompleted);
          setCompleted(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        } catch (e: any) {
          console.warn("Client completed jobs may require index", e?.message);
        }

        try {
          const qIp = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            where("status", "in", ["In Progress", "Started"]),
            orderBy("serviceDate", "desc")
          );
          const s = await getDocs(qIp);
          setInProgress(
            s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
          );
        } catch (e: any) {
          console.warn("Client in-progress jobs may require index", e?.message);
        }

        try {
          const now = new Date();
          const qUpcoming = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            where("status", "==", "Scheduled"),
            where("serviceDate", ">=", Timestamp.fromDate(now)),
            orderBy("serviceDate", "asc")
          );
          const s = await getDocs(qUpcoming);
          setUpcoming(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        } catch (e: any) {
          console.warn("Client upcoming jobs may require index", e?.message);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profileId]);

  const empty = useMemo(
    () => !completed.length && !inProgress.length && !upcoming.length,
    [completed.length, inProgress.length, upcoming.length]
  );

  return (
    <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
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
            onSelect={(j) => setModal({ type: "photos", job: j })}
          />
          <TimelineColumn
            title="Upcoming"
            jobs={upcoming}
            accent="bg-blue-100 dark:bg-blue-900/30"
            onSelect={(j) => setModal({ type: "photos", job: j })}
          />
          <TimelineColumn
            title="Past"
            jobs={completed}
            accent="bg-zinc-100 dark:bg-zinc-700"
            onSelect={(j) => setModal({ type: "photos", job: j })}
          />
        </div>
      )}

      {modal?.type === "photos" && (
        <PhotosModal job={modal.job} onClose={() => setModal(null)} />
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
  onSelect: (j: Job) => void;
}) {
  const [windows, setWindows] = useState<Record<string, string>>({});

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
    })();
  }, [jobs]);

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
              onClick={() => onSelect(j)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {(j.serviceDate?.toDate
                      ? j.serviceDate
                          .toDate()
                          .toLocaleDateString("en-US", {
                            timeZone: "America/New_York",
                          })
                      : "—") + " "}
                    <span className="text-xs text-zinc-500">
                      {windows[j.id] || formatJobWindow(j.serviceDate)}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 truncate mt-0.5">
                    {j.locationId || j.clientProfileId || j.id}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-xs ${accent}`}>
                  {j.status || "—"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PhotosModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [locationNameResolved, setLocationNameResolved] = useState<string>("");

  useEffect(() => {
    (async () => {
      const name = await getLocationName(job.locationId);
      setLocationNameResolved(name);
    })();
  }, [job.locationId]);

  useEffect(() => {
    async function loadPhotos() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const svcDate: Date | null = job.serviceDate?.toDate
          ? job.serviceDate.toDate()
          : null;
        const { start, end } = makeDayBounds(
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
        setPhotos(list);
      } catch (e: any) {
        console.warn("Client photos query may require index", e?.message);
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    }
    loadPhotos();
  }, [job.id]);

  const dt = job.serviceDate?.toDate ? job.serviceDate.toDate() : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-elev-2 max-w-3xl w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Service Photos</div>
          <button
            className="px-2 py-1 text-sm rounded-md border"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="text-sm text-zinc-500 mt-1">
          {formatDateTimeInET(dt)} —{" "}
          {locationNameResolved || job.locationId || "—"}
        </div>
        <div className="mt-3 min-h-[120px]">
          {loading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : photos.length === 0 ? (
            <div className="text-sm text-zinc-500">
              No photos for this service.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {photos.map((p) => (
                <a
                  key={p.id}
                  href={p.photoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block"
                >
                  <img
                    src={p.photoUrl}
                    alt="Service photo"
                    className="w-full h-32 object-cover rounded-md"
                  />
                  <div className="mt-1 text-[10px] text-zinc-500">
                    {p.uploadedAt?.toDate
                      ? formatDateTimeInET(p.uploadedAt.toDate())
                      : ""}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
