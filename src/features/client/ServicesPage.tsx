import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
  Timestamp,
  startAfter,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { firebaseConfig, makeDayBounds } from "../../services/firebase";
import {
  makeDayBounds as makeDayBoundsUtil,
  formatJobWindow,
} from "../../utils/time";
import Agreements from "./Agreements";
import { useAuth } from "../../context/AuthContext";
import { getLocationNames } from "../../services/queries/resolvers";

type Job = {
  id: string;
  status?: string;
  serviceDate?: any;
  clientProfileId?: string;
  locationId?: string;
};

type Review = {
  id?: string;
  jobId: string;
  clientId: string;
  rating: number;
  comment?: string;
  timestamp?: any;
};

export default function ServicesPage() {
  const { profileId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<Job[]>([]);
  const [scheduled, setScheduled] = useState<Job[]>([]);
  const [inProgress, setInProgress] = useState<Job[]>([]);
  const [locationNames, setLocationNames] = useState<Record<string, string>>(
    {}
  );
  const [reviewsByJob, setReviewsByJob] = useState<Record<string, Review>>({});
  const [specialInstructions, setSpecialInstructions] = useState<string[]>([]);
  const [photosModal, setPhotosModal] = useState<null | { job: Job }>(null);
  const [completedCursor, setCompletedCursor] = useState<any | null>(null);
  const [completedHasMore, setCompletedHasMore] = useState<boolean>(false);
  const [completedWindows, setCompletedWindows] = useState<
    Record<string, string>
  >({});

  const loadMoreCompleted = async () => {
    try {
      if (!completedCursor || !profileId) return;
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const qMore = query(
        collection(db, "serviceHistory"),
        where("clientProfileId", "==", profileId),
        where("status", "==", "Completed"),
        orderBy("serviceDate", "desc"),
        startAfter(completedCursor),
        limit(25)
      );
      const s = await getDocs(qMore);
      const jobs = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setCompleted((prev) => prev.concat(jobs));
      setCompletedCursor(s.docs.length ? s.docs[s.docs.length - 1] : null);
      setCompletedHasMore(s.docs.length === 25);
      // Resolve any new location names
      const ids = new Set<string>();
      jobs.forEach((j) => j.locationId && ids.add(j.locationId));
      if (ids.size) {
        const idList = Array.from(ids);
        const names = await getLocationNames(idList);
        const entries = idList.map((id, i) => [id, names[i] || id] as const);
        setLocationNames((prev) => {
          const next = { ...prev };
          entries.forEach(([id, name]) => (next[id] = name));
          return next;
        });
      }
    } catch (e: any) {
      console.warn("client completed jobs pagination failed", e?.message);
    }
  };
  const [ratingState, setRatingState] = useState<null | {
    jobId: string;
    rating: number;
    comment: string;
    submitting: boolean;
    error?: string;
  }>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        if (!profileId) return;

        // Completed jobs (recent)
        try {
          const qCompleted = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            where("status", "==", "Completed"),
            orderBy("serviceDate", "desc"),
            limit(25)
          );
          const s = await getDocs(qCompleted);
          const completedJobs = s.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }));
          setCompleted(completedJobs);
          setCompletedCursor(s.docs.length ? s.docs[s.docs.length - 1] : null);
          setCompletedHasMore(s.docs.length === 25);

          // Prefetch existing reviews for these jobs
          try {
            const revSnap = await getDocs(
              query(
                collection(db, "serviceReviews"),
                where("clientId", "==", profileId)
              )
            );
            const map: Record<string, Review> = {};
            revSnap.forEach((d) => {
              const r = d.data() as any;
              if (r?.jobId) map[r.jobId] = { id: d.id, ...(r as any) };
            });
            setReviewsByJob(map);
          } catch {}
        } catch (e: any) {
          console.warn(
            "client completed jobs query may need index",
            e?.message
          );
        }

        // Scheduled (future)
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
          const scheduledJobs = s.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }));
          setScheduled(scheduledJobs);
        } catch (e: any) {
          console.warn(
            "client scheduled jobs query may need index",
            e?.message
          );
        }

        // In Progress / Started
        try {
          const qIp = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            where("status", "in", ["In Progress", "Started"]),
            orderBy("serviceDate", "desc")
          );
          const s = await getDocs(qIp);
          const inProgressJobs = s.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }));
          setInProgress(inProgressJobs);
        } catch (e: any) {
          console.warn(
            "client in-progress jobs query may need index",
            e?.message
          );
        }

        // Resolve location names for visible jobs
        try {
          const ids = new Set<string>();
          // Use the latest local arrays to avoid stale state
          const all = new Array<Job>().concat(
            completed || [],
            scheduled || [],
            inProgress || []
          );
          all.forEach((j) => {
            if (j.locationId) ids.add(j.locationId);
          });
          const idList = Array.from(ids);
          const names = await getLocationNames(idList);
          const entries = idList.map((id, i) => [id, names[i] || id] as const);
          const map: Record<string, string> = {};
          entries.forEach(([id, name]) => (map[id] = name));
          setLocationNames(map);
        } catch {}

        // Aggregate special instructions from all active agreements
        try {
          const agSnap = await getDocs(
            query(
              collection(db, "serviceAgreements"),
              where("clientId", "==", profileId),
              where("isActive", "==", true)
            )
          );
          const list: string[] = [];
          agSnap.forEach((d) => {
            const txt = (d.data() as any)?.specialInstructions;
            if (typeof txt === "string" && txt.trim()) list.push(txt.trim());
          });
          const unique = Array.from(new Set(list));
          setSpecialInstructions(unique);
        } catch {}
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    load();
  }, [profileId]);

  // Compute time windows for completed jobs
  useEffect(() => {
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const map: Record<string, string> = {};
        for (const j of completed) {
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
        setCompletedWindows(map);
      } catch {}
    })();
  }, [completed]);

  const noJobs = useMemo(() => completed.length === 0, [completed.length]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Services</h1>

      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <div className="font-medium">Active Agreements</div>
        <div className="mt-2">
          <Agreements />
        </div>
      </div>

      {specialInstructions.length > 0 && (
        <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
          <div className="font-medium">Special Instructions</div>
          <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
            {specialInstructions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <div className="font-medium">Scheduled & In Progress</div>
        {loading ? (
          <div className="text-sm text-zinc-500 mt-2">Loading…</div>
        ) : !scheduled.length && !inProgress.length ? (
          <div className="text-sm text-zinc-500 mt-2">No upcoming services</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <JobsList
              title="In Progress"
              jobs={inProgress}
              locationNames={locationNames}
            />
            <JobsList
              title="Scheduled"
              jobs={scheduled}
              locationNames={locationNames}
            />
          </div>
        )}
      </div>

      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <div className="font-medium">Service History</div>
        {loading ? (
          <div className="text-sm text-zinc-500 mt-2">Loading…</div>
        ) : noJobs ? (
          <div className="text-sm text-zinc-500 mt-2">
            No completed services
          </div>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {completed.map((j) => (
                <li
                  key={j.id}
                  className="rounded-md border border-zinc-200 dark:border-zinc-700 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm">
                      <div className="font-medium">
                        {j.serviceDate?.toDate
                          ? j.serviceDate.toDate().toLocaleDateString("en-US", {
                              timeZone: "America/New_York",
                            })
                          : "—"}{" "}
                        <span className="text-xs text-zinc-500">
                          {completedWindows[j.id] ||
                            formatJobWindow(j.serviceDate)}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500">
                        {locationNames[j.locationId || ""] ||
                          j.locationId ||
                          j.clientProfileId ||
                          j.id}
                      </div>
                    </div>
                    <div className="text-sm flex items-center gap-2">
                      <button
                        className="px-2 py-1 text-xs rounded-md border"
                        onClick={() => setPhotosModal({ job: j })}
                      >
                        Photos
                      </button>
                      {reviewsByJob[j.id] ? (
                        <div className="flex items-center gap-2">
                          <Stars value={reviewsByJob[j.id].rating} readOnly />
                          {reviewsByJob[j.id].comment ? (
                            <span className="text-xs text-zinc-500 max-w-[280px] truncate">
                              {reviewsByJob[j.id].comment}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          className="px-3 py-1.5 rounded-md border text-sm"
                          onClick={() =>
                            setRatingState({
                              jobId: j.id,
                              rating: 5,
                              comment: "",
                              submitting: false,
                            })
                          }
                        >
                          Rate this service
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {completedHasMore && (
              <div className="mt-3">
                <button
                  className="px-3 py-1.5 rounded-md border text-sm"
                  onClick={loadMoreCompleted}
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {ratingState && (
        <RatingModal
          state={ratingState}
          onClose={() => setRatingState(null)}
          onSubmit={async (payload) => {
            try {
              if (!getApps().length) initializeApp(firebaseConfig);
              const auth = getAuth();
              const db = getFirestore();
              const uid = auth.currentUser?.uid;
              if (!uid || !profileId) return;
              const rating = payload.rating;
              const comment = (payload.comment || "").trim();
              if (rating < 1 || rating > 5) throw new Error("Invalid rating");
              if (rating <= 4 && !comment)
                throw new Error(
                  "Please add a brief comment for ratings 4 or less."
                );
              setRatingState((s) =>
                s ? { ...s, submitting: true, error: undefined } : s
              );
              await addDoc(collection(db, "serviceReviews"), {
                jobId: payload.jobId,
                clientId: profileId,
                clientProfileId: profileId,
                rating,
                comment,
                timestamp: serverTimestamp(),
              });
              setReviewsByJob((prev) => ({
                ...prev,
                [payload.jobId]: {
                  jobId: payload.jobId,
                  clientId: profileId,
                  rating,
                  comment,
                },
              }));
              setRatingState(null);
            } catch (e: any) {
              setRatingState((s) =>
                s ? { ...s, error: e?.message || "Failed" } : s
              );
            } finally {
              setRatingState((s) => (s ? { ...s, submitting: false } : s));
            }
          }}
        />
      )}

      {photosModal && (
        <PhotosModal
          job={photosModal.job}
          onClose={() => setPhotosModal(null)}
        />
      )}
    </div>
  );
}

function JobsList({
  title,
  jobs,
  locationNames,
}: {
  title: string;
  jobs: Job[];
  locationNames: Record<string, string>;
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
    <div>
      <div className="text-sm font-semibold mb-2">{title}</div>
      {jobs.length === 0 ? (
        <div className="text-xs text-zinc-500">No items</div>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li
              key={j.id}
              className="rounded-md border border-zinc-200 dark:border-zinc-700 p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <div className="font-medium">
                    {j.serviceDate?.toDate
                      ? j.serviceDate.toDate().toLocaleDateString("en-US", {
                          timeZone: "America/New_York",
                        })
                      : "—"}{" "}
                    <span className="text-xs text-zinc-500">
                      {windows[j.id] || formatJobWindow(j.serviceDate)}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {locationNames[j.locationId || ""] ||
                      j.locationId ||
                      j.clientProfileId ||
                      j.id}
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-700">
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
  const [photos, setPhotos] = useState<
    Array<{ id: string; photoUrl?: string; uploadedAt?: any }>
  >([]);
  const [locationNameResolved, setLocationNameResolved] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [name] = await getLocationNames([job.locationId]);
      setLocationNameResolved(name || job.locationId || "—");
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
        const list: Array<{ id: string; photoUrl?: string; uploadedAt?: any }> =
          [];
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
          {dt
            ? dt.toLocaleString("en-US", { timeZone: "America/New_York" })
            : "—"}{" "}
          — {locationNameResolved || job.locationId || "—"}
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
                      ? p.uploadedAt.toDate().toLocaleString()
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

function Stars({
  value,
  onChange,
  readOnly,
}: {
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="inline-flex">
      {stars.map((s) => (
        <button
          key={s}
          className={`px-0.5 ${readOnly ? "cursor-default" : "cursor-pointer"}`}
          onClick={() => (!readOnly && onChange ? onChange(s) : undefined)}
          aria-label={`${s} star`}
        >
          <span
            className={`text-lg ${
              s <= value ? "text-yellow-500" : "text-zinc-400"
            }`}
          >
            ★
          </span>
        </button>
      ))}
    </div>
  );
}

function RatingModal({
  state,
  onClose,
  onSubmit,
}: {
  state: {
    jobId: string;
    rating: number;
    comment: string;
    submitting: boolean;
    error?: string;
  } | null;
  onClose: () => void;
  onSubmit: (payload: {
    jobId: string;
    rating: number;
    comment: string;
  }) => Promise<void>;
}) {
  const [rating, setRating] = useState(state?.rating || 5);
  const [comment, setComment] = useState(state?.comment || "");
  const mustComment = rating <= 4;
  const disabled =
    state?.submitting || !rating || (mustComment && !comment.trim());

  useEffect(() => {
    setRating(state?.rating || 5);
    setComment(state?.comment || "");
  }, [state?.jobId]);

  if (!state) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-elev-2 max-w-md w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Rate this service</div>
          <button
            className="px-2 py-1 text-sm rounded-md border"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mt-3 space-y-3">
          <div>
            <Stars value={rating} onChange={setRating} />
            <div className="text-xs text-zinc-500 mt-1">
              {rating <= 2
                ? "Poor"
                : rating === 3
                ? "Fair"
                : rating === 4
                ? "Good"
                : "Excellent"}
            </div>
          </div>
          <div>
            <label className="text-sm block mb-1">
              Comment {mustComment ? "(required for ≤ 4★)" : "(optional)"}
            </label>
            <textarea
              className="w-full rounded-md border bg-transparent p-2 text-sm"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us a bit more…"
            />
          </div>
          {state?.error ? (
            <div className="text-sm text-red-600">{state.error}</div>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <button
              className="px-3 py-1.5 rounded-md border"
              onClick={onClose}
              disabled={state?.submitting}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1.5 rounded-md border bg-blue-600 text-white disabled:opacity-60"
              disabled={!!disabled}
              onClick={() => onSubmit({ jobId: state.jobId, rating, comment })}
            >
              {state?.submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
