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
import {
  getLocationNames,
  getEmployeeNames,
} from "../../services/queries/resolvers";
import { deriveClientStatus } from "../../services/statusMap";
import PhotoModal from "../../components/ui/PhotoModal";

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
  const { profileId, claims } = useAuth();
  const [loading, setLoading] = useState(true);

  // Client authentication validation
  const isClient = claims?.client || false;
  const hasClientRole = claims?.role === "client" || false;
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [locationNames, setLocationNames] = useState<Record<string, string>>(
    {}
  );
  const [reviewsByJob, setReviewsByJob] = useState<Record<string, Review>>({});

  const [detailsModal, setDetailsModal] = useState<null | { job: Job }>(null);
  const [photoModal, setPhotoModal] = useState<null | {
    photos: any[];
    currentIndex: number;
  }>(null);
  const [allJobsCursor, setAllJobsCursor] = useState<any | null>(null);
  const [allJobsHasMore, setAllJobsHasMore] = useState<boolean>(false);
  const [allJobsWindows, setAllJobsWindows] = useState<Record<string, string>>(
    {}
  );

  const loadMoreJobs = async () => {
    try {
      if (!allJobsCursor || !profileId) return;
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const qMore = query(
        collection(db, "serviceHistory"),
        where("clientProfileId", "==", profileId),
        orderBy("serviceDate", "desc"),
        startAfter(allJobsCursor),
        limit(25)
      );
      const s = await getDocs(qMore);
      const jobs = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setAllJobs((prev) => prev.concat(jobs));
      setAllJobsCursor(s.docs.length ? s.docs[s.docs.length - 1] : null);
      setAllJobsHasMore(s.docs.length === 25);
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
      console.warn("client jobs pagination failed", e?.message);
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
        // Check client authentication before attempting data loading
        if (!isClient && !hasClientRole) {
          console.warn(
            "User does not have client permissions to view services"
          );
          setLoading(false);
          return;
        }

        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        if (!profileId) return;

        // All jobs (completed, scheduled, in progress)
        try {
          const qAllJobs = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            orderBy("serviceDate", "desc"),
            limit(25)
          );
          const s = await getDocs(qAllJobs);
          const allJobsData = s.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }));

          setAllJobs(allJobsData);
          setAllJobsCursor(s.docs.length ? s.docs[s.docs.length - 1] : null);
          setAllJobsHasMore(s.docs.length === 25);

          // Prefetch existing reviews for these jobs
          try {
            // First try with clientProfileId (newer records)
            let revSnap = await getDocs(
              query(
                collection(db, "serviceReviews"),
                where("clientProfileId", "==", profileId)
              )
            );

            // If no results, fallback to clientId (legacy records)
            if (revSnap.empty) {
              revSnap = await getDocs(
                query(
                  collection(db, "serviceReviews"),
                  where("clientId", "==", profileId)
                )
              );
            }

            const map: Record<string, Review> = {};
            revSnap.forEach((d) => {
              const r = d.data() as any;
              if (r?.jobId) map[r.jobId] = { id: d.id, ...(r as any) };
            });

            setReviewsByJob(map);
          } catch {}

          // Resolve location names for visible jobs (use freshly fetched list)
          const ids = new Set<string>();
          allJobsData.forEach((j) => {
            if (j.locationId) ids.add(j.locationId);
          });
          const idList = Array.from(ids);
          if (idList.length) {
            const names = await getLocationNames(idList);
            const entries = idList.map(
              (id, i) => [id, names[i] || id] as const
            );
            const map: Record<string, string> = {};
            entries.forEach(([id, name]) => (map[id] = name));
            setLocationNames(map);
          } else {
            setLocationNames({});
          }
        } catch (e: any) {
          console.warn("client jobs query may need index", e?.message);
        }
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    load();
  }, [profileId, isClient, hasClientRole]);

  // Backfill any missing location names when jobs change (e.g., after pagination or live updates)
  useEffect(() => {
    (async () => {
      try {
        const ids = Array.from(
          new Set(
            allJobs
              .map((j) => j.locationId)
              .filter((v): v is string => typeof v === "string" && !!v)
          )
        );
        const missing = ids.filter((id) => !locationNames[id]);
        if (!missing.length) return;
        const names = await getLocationNames(missing);
        const entries = missing.map((id, i) => [id, names[i] || id] as const);
        setLocationNames((prev) => {
          const next = { ...prev } as Record<string, string>;
          entries.forEach(([id, name]) => (next[id] = name));
          return next;
        });
      } catch {}
    })();
  }, [allJobs, locationNames]);

  // Compute time windows for all jobs
  useEffect(() => {
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const map: Record<string, string> = {};
        for (const j of allJobs) {
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
        setAllJobsWindows(map);
      } catch {}
    })();
  }, [allJobs]);

  const noJobs = useMemo(() => allJobs.length === 0, [allJobs.length]);

  // Create a single sorted list of all jobs by date
  const sortedJobs = useMemo(() => {
    const allJobsWithStatus = allJobs.map((job) => {
      const clientStatus = deriveClientStatus(job, new Date());
      return { ...job, clientStatus };
    });

    return allJobsWithStatus.sort((a, b) => {
      const aDate = a.serviceDate?.toDate?.() || new Date(0);
      const bDate = b.serviceDate?.toDate?.() || new Date(0);
      return bDate.getTime() - aDate.getTime(); // newest first
    });
  }, [allJobs]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Services</h1>

      <div className="rounded-lg p-4 card-bg shadow-elev-1">
        <div className="font-medium">Active Agreements</div>
        <div className="mt-2">
          <Agreements />
        </div>
      </div>

      <div className="rounded-lg p-4 card-bg shadow-elev-1">
        <div className="font-medium">Service History</div>
        {loading ? (
          <div className="text-sm text-zinc-500 mt-2">Loading…</div>
        ) : noJobs ? (
          <div className="text-sm text-zinc-500 mt-2">No services found</div>
        ) : (
          <>
            {/* Single chronological list of all services */}
            <div className="mt-4">
              <ul className="space-y-2">
                {sortedJobs.map((j) => {
                  const status = j.clientStatus;
                  const statusConfig = {
                    completed: {
                      label: "Completed",
                      className:
                        "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",
                    },
                    in_progress: {
                      label: "In Progress",
                      className:
                        "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200",
                    },
                    upcoming: {
                      label: "Scheduled",
                      className:
                        "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
                    },
                  };

                  const config = statusConfig[status] || {
                    label: "Unknown",
                    className:
                      "bg-zinc-100 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200",
                  };

                  return (
                    <li
                      key={j.id}
                      className="rounded-md border border-zinc-200 dark:border-zinc-700 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm">
                          <div className="font-medium">
                            {j.serviceDate?.toDate
                              ? j.serviceDate
                                  .toDate()
                                  .toLocaleDateString("en-US", {
                                    timeZone: "America/New_York",
                                  })
                              : "—"}{" "}
                            <span className="text-xs text-zinc-500">
                              {allJobsWindows[j.id] ||
                                formatJobWindow(j.serviceDate)}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-500">
                            {locationNames[j.locationId || ""] ||
                              (j as any).locationName ||
                              (j as any).name ||
                              (j.locationId
                                ? `Location ${j.locationId.slice(0, 8)}...`
                                : "Unknown Location")}
                          </div>
                        </div>
                        <div className="text-sm flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-md ${config.className}`}
                          >
                            {config.label}
                          </span>
                          {status === "completed" && (
                            <>
                              <button
                                className="px-2 py-1 text-xs rounded-md border"
                                onClick={() => setDetailsModal({ job: j })}
                              >
                                View Details
                              </button>
                              {!reviewsByJob[j.id] && (
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
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {allJobsHasMore && (
              <div className="mt-3">
                <button
                  className="px-3 py-1.5 rounded-md border text-sm"
                  onClick={loadMoreJobs}
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

      {detailsModal && (
        <ServiceDetailsModal
          job={detailsModal.job}
          reviewsByJob={reviewsByJob}
          onClose={() => setDetailsModal(null)}
          onPhotoClick={(photos, currentIndex) =>
            setPhotoModal({ photos, currentIndex })
          }
        />
      )}

      {photoModal && (
        <PhotoModal
          isOpen={true}
          onClose={() => setPhotoModal(null)}
          photos={photoModal.photos}
          currentIndex={photoModal.currentIndex}
          onIndexChange={(index) =>
            setPhotoModal((prev) =>
              prev ? { ...prev, currentIndex: index } : null
            )
          }
        />
      )}
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
        className="card-bg border border-[var(--border)] rounded-lg shadow-elev-2 max-w-md w-full p-4"
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

function ServiceDetailsModal({
  job,
  reviewsByJob,
  onClose,
  onPhotoClick,
}: {
  job: Job;
  reviewsByJob: Record<string, Review>;
  onClose: () => void;
  onPhotoClick: (photos: any[], currentIndex: number) => void;
}) {
  const { claims } = useAuth();
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<
    Array<{ id: string; photoUrl?: string; uploadedAt?: any }>
  >([]);
  const [locationNameResolved, setLocationNameResolved] = useState<string>("");
  const [assignedNames, setAssignedNames] = useState<string[]>([]);
  const [adminNote, setAdminNote] = useState<string>("");

  // Client authentication validation
  const isClient = claims?.client || false;
  const hasClientRole = claims?.role === "client" || false;

  useEffect(() => {
    // Check client authentication before attempting data loading
    if (!isClient && !hasClientRole) {
      console.warn("User does not have client permissions");
      setLocationNameResolved("Access denied");
      setAssignedNames([]);
      setAdminNote("Access denied");
      setLoading(false);
      return;
    }

    (async () => {
      // Resolve location name with error handling and retry logic
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const [name] = await getLocationNames([job.locationId]);
          setLocationNameResolved(
            name ||
              (job as any).locationName ||
              (job.locationId
                ? `Location ${job.locationId.slice(0, 8)}...`
                : "—")
          );
          break; // Success, exit retry loop
        } catch (error) {
          retryCount++;
          console.warn(
            `Location resolution attempt ${retryCount} failed:`,
            error
          );
          if (retryCount >= maxRetries) {
            console.error("All location resolution attempts failed");
            // Fallback to job data or truncated ID
            setLocationNameResolved(
              (job as any).locationName ||
                (job.locationId
                  ? `Location ${job.locationId.slice(0, 8)}...`
                  : "—")
            );
          } else {
            // Wait before retry
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * retryCount)
            );
          }
        }
      }

      // Resolve staff names with client-safe precedence:
      // 1) employeeDisplayNames (preferred)
      // 2) employeeAssignments[].name (legacy)
      // 3) assignedEmployees (IDs) → resolver lookup
      const displayNames = Array.isArray((job as any).employeeDisplayNames)
        ? ((job as any).employeeDisplayNames as string[]).filter(Boolean)
        : [];
      const assignmentNames = Array.isArray((job as any).employeeAssignments)
        ? ((job as any).employeeAssignments as any[])
            .map((a) => a?.name || a?.employeeName || a?.uid || "")
            .filter((v: string) => typeof v === "string" && !!v)
        : [];
      if (displayNames.length) {
        setAssignedNames(Array.from(new Set(displayNames)));
      } else if (assignmentNames.length) {
        setAssignedNames(Array.from(new Set(assignmentNames)));
      } else {
        const assignedIds = Array.isArray((job as any).assignedEmployees)
          ? ((job as any).assignedEmployees as string[])
          : [];
        if (assignedIds.length) {
          let staffRetryCount = 0;
          const staffMaxRetries = 3;

          while (staffRetryCount < staffMaxRetries) {
            try {
              const names = await getEmployeeNames(assignedIds);
              setAssignedNames(names.filter(Boolean));
              break; // Success, exit retry loop
            } catch (error) {
              staffRetryCount++;
              console.warn(
                `Staff resolution attempt ${staffRetryCount} failed:`,
                error
              );
              if (staffRetryCount >= staffMaxRetries) {
                console.error("All staff resolution attempts failed");
                setAssignedNames([]);
              } else {
                // Wait before retry
                await new Promise((resolve) =>
                  setTimeout(resolve, 1000 * staffRetryCount)
                );
              }
            }
          }
        } else {
          setAssignedNames([]);
        }
      }
      // Prefer top-level adminNotes on the job; else fetch the latest admin job note
      const jAdmin = (job as any).adminNotes as string | undefined;
      if (jAdmin && jAdmin.trim()) {
        setAdminNote(jAdmin.trim());
      } else {
        try {
          if (!getApps().length) initializeApp(firebaseConfig);
          const db = getFirestore();
          const nq = query(
            collection(db, "jobNotes"),
            where("jobId", "==", job.id),
            where("authorRole", "==", "admin"),
            orderBy("createdAt", "desc"),
            limit(1)
          );
          const ns = await getDocs(nq);
          const doc0 = ns.docs[0];
          const data: any = doc0 ? doc0.data() : null;
          setAdminNote((data?.message as string) || "");
        } catch {
          setAdminNote("");
        }
      }
    })();
  }, [job, isClient, hasClientRole]);

  useEffect(() => {
    // Check client authentication before attempting photo loading
    if (!isClient && !hasClientRole) {
      console.warn("User does not have client permissions for photo loading");
      setPhotos([]);
      setLoading(false);
      return;
    }

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

        // Add retry logic for photo queries
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            const qref = query(
              collection(db, "servicePhotos"),
              where("locationId", "==", job.locationId || ""),
              where("uploadedAt", ">=", Timestamp.fromDate(start)),
              where("uploadedAt", "<=", Timestamp.fromDate(end)),
              where("isClientVisible", "==", true),
              orderBy("uploadedAt", "desc")
            );
            const snap = await getDocs(qref);
            const list: Array<{
              id: string;
              photoUrl?: string;
              uploadedAt?: any;
            }> = [];
            snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
            console.log(
              `Loaded ${list.length} photos for service:`,
              list.map((p) => ({ id: p.id, url: p.photoUrl }))
            );
            setPhotos(list);
            break; // Success, exit retry loop
          } catch (e: any) {
            retryCount++;
            console.warn(
              `Photo query attempt ${retryCount} failed:`,
              e?.message
            );
            if (retryCount >= maxRetries) {
              console.error("All photo query attempts failed");
              setPhotos([]);
            } else {
              // Wait before retry
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * retryCount)
              );
            }
          }
        }
      } catch (e: any) {
        console.warn("Client photos query may require index", e?.message);
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    }
    loadPhotos();
  }, [job.id, isClient, hasClientRole]);

  const dt = job.serviceDate?.toDate ? job.serviceDate.toDate() : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="card-bg border border-[var(--border)] rounded-lg shadow-elev-2 max-w-4xl w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Service Details</div>
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
            : "—"}
        </div>

        {/* Overview cards */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-1">Location</div>
            <div className="text-sm">
              {locationNameResolved || job.locationId || "—"}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-1">Staff Assigned</div>
            <div className="text-sm">
              {assignedNames.length ? assignedNames.join(", ") : "—"}
            </div>
          </div>
        </div>

        {/* Photos */}
        <div className="mt-4">
          <div className="text-sm font-medium">Photos</div>
          <div className="text-xs text-zinc-500">Available Images</div>
          <div className="mt-2">
            {loading ? (
              <div className="text-sm text-zinc-500">Loading…</div>
            ) : photos.length === 0 ? (
              <div className="text-sm text-zinc-500">
                No photos for this service.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                  <div>
                    {photos.length} photo{photos.length === 1 ? "" : "s"}
                  </div>
                  {photos.length > 6 ? <div>Scroll for more photos</div> : null}
                </div>
                <div className="rounded-md border p-2 max-h-[360px] overflow-y-auto">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {photos.map((p, index) => (
                      <div
                        key={p.id}
                        className="block cursor-pointer"
                        onClick={() => onPhotoClick(photos, index)}
                      >
                        <img
                          src={p.photoUrl || ""}
                          alt="Service photo"
                          className="w-full h-32 object-cover rounded-md hover:opacity-80 transition-opacity"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            console.warn(
                              `Failed to load image: ${p.photoUrl}`,
                              e
                            );
                            target.src =
                              "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyMEg2MFY2MEgyMFYyMFoiIGZpbGw9IiNEMUQ1REIiLz4KPHBhdGggZD0iTTI1IDI1SDU1VjU1SDI1VjI1WiIgZmlsbD0iI0YzRjRGNiIvPgo8Y2lyY2xlIGN4PSIzNSIgY3k9IjM1IiByPSI1IiBmaWxsPSIjOUI5QkEwIi8+CjxwYXRoIGQ9Ik0yMCA1NUwzMCA0NUw0MCA1NUw1MCA0NUw2MCA1NVY2MEgyMFY1NVoiIGZpbGw9IiM5QjlCQTAiLz4KPC9zdmc+";
                            target.classList.add("opacity-50");
                          }}
                          onLoad={(e) => {
                            const target = e.target as HTMLImageElement;
                            console.log(
                              `Successfully loaded image: ${p.photoUrl}`
                            );
                            target.classList.remove("opacity-50");
                            target.classList.add("opacity-100");
                          }}
                        />
                        <div className="mt-1 text-[10px] text-zinc-500">
                          {p.uploadedAt?.toDate
                            ? p.uploadedAt.toDate().toLocaleString()
                            : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Admin Notes */}
        <div className="mt-4">
          <div className="text-sm font-medium">Admin Notes</div>
          <div className="mt-2 rounded-md border p-3 text-sm bg-[var(--muted)]">
            {adminNote ? adminNote : "No notes provided"}
          </div>
        </div>

        {/* Service Rating */}
        {reviewsByJob[job.id] && (
          <div className="mt-4">
            <div className="text-sm font-medium">Your Rating</div>
            <div className="mt-2 rounded-md border p-3 text-sm bg-yellow-50 dark:bg-yellow-900/20">
              <div className="flex items-center gap-2 mb-2">
                <Stars value={reviewsByJob[job.id].rating} readOnly />
                <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Rated {reviewsByJob[job.id].rating}/5
                </span>
              </div>
              {reviewsByJob[job.id].comment && (
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  "{reviewsByJob[job.id].comment}"
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
