import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  getDocs,
  getFirestore,
  orderBy,
  query,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { formatDateTime } from "./supportUtils";

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
    "all" | "5" | "4" | "3" | "2" | "1"
  >("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

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
        setAll(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sort]);

  const filtered = useMemo(() => {
    return all.filter((r) => {
      if (ratingFilter === "all") return true;
      return (r.rating || 0).toString() === ratingFilter;
    });
  }, [all, ratingFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const items = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, perPage, page]);

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
              className="border rounded-md px-2 py-1 bg-white dark:bg-zinc-800"
              value={ratingFilter}
              onChange={(e) => {
                setRatingFilter(e.target.value as any);
                setPage(1);
              }}
            >
              {(["all", "5", "4", "3", "2", "1"] as const).map((v) => (
                <option key={v} value={v}>
                  {v === "all" ? "All Ratings" : v}
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
              className="border rounded-md px-2 py-1 bg-white dark:bg-zinc-800"
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
              className="border rounded-md px-2 py-1 bg-white dark:bg-zinc-800"
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
          items.map((r) => <ReviewCard key={r.id} review={r} />)
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
    </div>
  );
}

function ReviewCard({ review }: { review: ClientReview }) {
  const stars = Math.max(1, Math.min(5, review.rating || 0));
  return (
    <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-amber-500" aria-label={`Rating: ${stars}/5`}>
            {Array.from({ length: stars }).map((_, i) => (
              <span key={i}>★</span>
            ))}
            {Array.from({ length: 5 - stars }).map((_, i) => (
              <span key={`e-${i}`} className="text-zinc-300">
                ★
              </span>
            ))}
          </div>
          <div className="text-sm font-medium">Rating: {stars}/5</div>
        </div>
        <div className="text-xs text-zinc-500 min-w-[160px] text-right">
          Submitted: {formatDateTime(review.timestamp)}
        </div>
      </div>
      <div className="mt-2 text-sm">
        <div className="text-zinc-500">Job ID: {review.jobId || "Unknown"}</div>
        {review.locationName ? (
          <div className="text-zinc-500">Location: {review.locationName}</div>
        ) : null}
        {review.serviceDate ? (
          <div className="text-zinc-500">
            Date of Service: {formatDateTime(review.serviceDate)}
          </div>
        ) : null}
      </div>
      <div className="mt-3 text-sm">
        <div className="text-zinc-500">Comment:</div>
        <div>{review.comment ? review.comment : "No comment provided."}</div>
      </div>
    </div>
  );
}
