import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { formatDateTime } from "./supportUtils";
import JobModal from "../../components/ui/JobModal";

type ClientReview = {
  id: string;
  clientId?: string;
  jobId?: string;
  rating?: number;
  comment?: string;
  locationName?: string | null;
  serviceDate?: any;
  timestamp?: any;
};

export default function SupportClientReviews() {
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState<ClientReview[]>([]);
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [ratingFilter, setRatingFilter] = useState<
    "all" | "5" | "4" | "3" | "2" | "1" | "low"
  >("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  // JobModal state
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [currentJobData, setCurrentJobData] = useState<{
    id: string;
    clientName: string;
    locationName: string;
    assignedEmployeeNames: string[];
    assignedEmployeesCount: number;
    serviceDate: Date | null;
    status: string;
    daysInProgress: number;
    hoursInProgress: number;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const q = query(
          collection(db, "serviceReviews"),
          orderBy("timestamp", sort === "newest" ? "desc" : "asc")
        );
        const snap = await getDocs(q);
        const list: ClientReview[] = [] as any;
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));

        // Fetch client information for each review
        const clientPromises = list.map(async (review) => {
          try {
            const clientId = review.clientId || (review as any).clientProfileId;
            if (clientId) {
              const clientDoc = await getDoc(
                doc(db, "clientMasterList", clientId)
              );
              if (clientDoc.exists()) {
                const clientData = clientDoc.data();
                (review as any).clientName = `${
                  clientData?.companyName ||
                  clientData?.contactName ||
                  "Unknown Client"
                } (${clientData?.email || ""})`;
              } else {
                (review as any).clientName = "Client not found";
              }
            } else {
              (review as any).clientName = "Client ID missing";
            }
          } catch (error) {
            console.error(
              "Error fetching client data for review:",
              review.id,
              error
            );
            (review as any).clientName = "Error loading client";
          }
        });

        // Wait for all client data to be fetched
        await Promise.all(clientPromises);

        setAll(list);
      } catch (error: any) {
        console.error("Error loading client reviews:", error);
        setAll([]); // Clear on error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sort]);

  const filtered = useMemo(() => {
    return all.filter((r) => {
      if (ratingFilter === "all") return true;
      if (ratingFilter === "low") return (r.rating || 0) <= 3;
      return (r.rating || 0).toString() === ratingFilter;
    });
  }, [all, ratingFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const items = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, perPage, page]);

  // Function to handle opening job modal
  const handleViewJob = async (review: ClientReview) => {
    if (!review.jobId) return;

    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();

      // Get job details from serviceHistory
      const jobSnap = await getDoc(doc(db, "serviceHistory", review.jobId));
      if (!jobSnap.exists()) {
        console.error("Job not found:", review.jobId);
        return;
      }

      const jobData = { id: jobSnap.id, ...(jobSnap.data() as any) };

      // Get client name
      let clientName = "Unknown Client";
      if (jobData.clientProfileId) {
        try {
          const clientSnap = await getDoc(
            doc(db, "clientMasterList", jobData.clientProfileId)
          );
          if (clientSnap.exists()) {
            const clientData = clientSnap.data();
            clientName = `${
              clientData?.companyName ||
              clientData?.contactName ||
              "Unknown Client"
            } (${clientData?.email || ""})`;
          }
        } catch (error) {
          console.error("Error fetching client:", error);
        }
      }

      // Get location name
      let locationName = "Unknown Location";
      if (jobData.locationId) {
        try {
          const locationSnap = await getDoc(
            doc(db, "clientLocations", jobData.locationId)
          );
          if (locationSnap.exists()) {
            const locationData = locationSnap.data();
            locationName =
              locationData?.address || locationData?.name || "Unknown Location";
          }
        } catch (error) {
          console.error("Error fetching location:", error);
        }
      }

      // Get assigned employee names
      let assignedEmployeeNames: string[] = [];
      if (
        jobData.assignedEmployees &&
        Array.isArray(jobData.assignedEmployees)
      ) {
        try {
          // This would need the getEmployeeNames function - for now we'll use employee IDs
          assignedEmployeeNames = jobData.assignedEmployees;
        } catch (error) {
          console.error("Error fetching employees:", error);
        }
      }

      // Create job data object for JobModal
      const jobModalData = {
        id: jobData.id,
        clientName,
        locationName,
        assignedEmployeeNames,
        assignedEmployeesCount: assignedEmployeeNames.length,
        serviceDate: jobData.serviceDate?.toDate
          ? jobData.serviceDate.toDate()
          : null,
        status: jobData.status || "Unknown",
        daysInProgress: 0, // We'll calculate this if needed
        hoursInProgress: 0, // We'll calculate this if needed
      };

      setCurrentJobData(jobModalData);
      setJobModalOpen(true);
    } catch (error) {
      console.error("Error loading job data:", error);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm text-zinc-500">Client Reviews</div>
        <div className="ml-auto flex items-end gap-3">
          <div>
            <label
              htmlFor="filter-rating"
              className="block text-xs text-zinc-500 mb-1"
            >
              All Ratings
            </label>
            <select
              id="filter-rating"
              className="border rounded-md px-2 py-1 card-bg"
              value={ratingFilter}
              onChange={(e) => {
                setRatingFilter(e.target.value as any);
                setPage(1);
              }}
            >
              {(["all", "5", "4", "3", "2", "1", "low"] as const).map((v) => (
                <option key={v} value={v}>
                  {v === "all"
                    ? "All Ratings"
                    : v === "low"
                    ? "Low Ratings (≤3★)"
                    : `${v} Star${v !== "1" ? "s" : ""}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="block text-xs text-zinc-500 mb-1">
              Sort
            </label>
            <select
              id="sort"
              className="border rounded-md px-2 py-1 card-bg"
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label
              htmlFor="per-page-reviews"
              className="block text-xs text-zinc-500 mb-1"
            >
              per page
            </label>
            <select
              id="per-page-reviews"
              className="border rounded-md px-2 py-1 card-bg"
              value={perPage}
              onChange={(e) => {
                setPerPage(parseInt(e.target.value) || 10);
                setPage(1);
              }}
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-500">No reviews found.</div>
        ) : (
          items.map((r) => (
            <ReviewCard key={r.id} review={r} onViewJob={handleViewJob} />
          ))
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
        <div>
          Showing {(page - 1) * perPage + 1}-
          {Math.min(page * perPage, filtered.length)} of {filtered.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 rounded-md border disabled:opacity-50"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <div>
            {page} / {totalPages}
          </div>
          <button
            className="px-2 py-1 rounded-md border disabled:opacity-50"
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>

      {/* Job Modal */}
      {jobModalOpen && currentJobData && (
        <JobModal
          isOpen={jobModalOpen}
          onClose={() => {
            setJobModalOpen(false);
            setCurrentJobData(null);
          }}
          jobs={[currentJobData]}
          currentIndex={0}
        />
      )}
    </div>
  );
}

function ReviewCard({
  review,
  onViewJob,
}: {
  review: ClientReview;
  onViewJob: (review: ClientReview) => void;
}) {
  const stars = Math.max(1, Math.min(5, review.rating || 0));
  const isLowRating = stars <= 3;
  const cardClasses = isLowRating
    ? "rounded-lg p-4 border-2 border-red-200 bg-red-50 dark:bg-red-900/20 shadow-elev-1"
    : "rounded-lg p-4 card-bg shadow-elev-1";

  return (
    <div className={cardClasses}>
      {isLowRating && (
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border border-red-200 dark:border-red-800">
            ⚠️ Requires Attention
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`text-lg ${
              isLowRating ? "text-red-500" : "text-amber-500"
            }`}
            aria-label={`Rating: ${stars}/5`}
          >
            {Array.from({ length: stars }).map((_, i) => (
              <span key={i}>★</span>
            ))}
            {Array.from({ length: 5 - stars }).map((_, i) => (
              <span key={`e-${i}`} className="text-zinc-300">
                ★
              </span>
            ))}
          </div>
          <div
            className={`text-sm font-medium ${
              isLowRating ? "text-red-700 dark:text-red-300" : ""
            }`}
          >
            Rating: {stars}/5
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
            onClick={() => onViewJob(review)}
          >
            👁️ View Job
          </button>
          <div className="text-xs text-zinc-500">
            Submitted: {formatDateTime(review.timestamp)}
          </div>
        </div>
      </div>
      <div className="mt-2 text-sm space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm">👤</span>
          <span className="text-zinc-500">
            Client: {(review as any).clientName || "Loading..."}
          </span>
        </div>
        {review.serviceDate && (
          <div className="flex items-center gap-2">
            <span className="text-sm">🗓️</span>
            <span className="text-zinc-500">
              Date of Service: {formatDateTime(review.serviceDate)}
            </span>
          </div>
        )}
        {review.locationName && (
          <div className="flex items-center gap-2">
            <span className="text-sm">📍</span>
            <span className="text-zinc-500">
              Location: {review.locationName}
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 text-sm">
        <div className="text-zinc-500 mb-1">Comment:</div>
        <div className={isLowRating ? "text-red-700 dark:text-red-300" : ""}>
          {review.comment ? review.comment : "No comment provided."}
        </div>
      </div>
    </div>
  );
}
