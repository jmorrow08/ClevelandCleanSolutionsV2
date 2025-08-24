import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  getDocs,
  getFirestore,
  orderBy,
  query,
  updateDoc,
  doc,
  where,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { formatDateTime } from "./supportUtils";

type FlaggedPhoto = {
  id: string;
  photoUrl?: string;
  uploadedAt?: any;
  uploadedBy?: string;
  serviceHistoryId?: string;
  flagReason?: string | null;
  flagged?: boolean;
  caption?: string;
  location?: string;
};

export default function SupportFlaggedPhotos() {
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState<FlaggedPhoto[]>([]);
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const q = query(
          collection(db, "servicePhotos"),
          where("flagged", "==", true),
          orderBy("uploadedAt", "desc")
        );
        const snap = await getDocs(q);
        const list: FlaggedPhoto[] = [] as any;
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setAll(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalPages = Math.max(1, Math.ceil(all.length / perPage));
  const items = useMemo(() => {
    const start = (page - 1) * perPage;
    return all.slice(start, start + perPage);
  }, [all, perPage, page]);

  async function clearFlag(id: string) {
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    await updateDoc(doc(db, "servicePhotos", id), {
      flagged: false,
      reviewedAt: new Date(),
    });
    setAll((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="text-sm text-zinc-500">Flagged Photos</div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <label htmlFor="per-page">Show</label>
          <select
            id="per-page"
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

      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-500">No flagged photos.</div>
        ) : (
          items.map((p) => (
            <div
              key={p.id}
              className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.photoUrl}
                      alt={p.caption || "Flagged photo"}
                      className="w-16 h-16 object-cover rounded"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-zinc-200 dark:bg-zinc-700 rounded" />
                  )}
                  <div className="text-sm">
                    <div className="font-medium">Flagged Photo</div>
                    <div className="text-zinc-500">
                      Uploaded by: {p.uploadedBy || "Unknown user"}
                    </div>
                    <div className="text-zinc-500">
                      Service ID: {p.serviceHistoryId || "Unknown service"}
                    </div>
                    <div className="text-zinc-500">
                      Flag Reason: {p.flagReason || "No reason provided"}
                    </div>
                    {p.location ? (
                      <div className="text-zinc-500">
                        Location: {p.location}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="text-xs text-zinc-500 min-w-[160px] text-right">
                  {formatDateTime(p.uploadedAt)}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {p.photoUrl ? (
                  <a
                    href={p.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  >
                    View Photo
                  </a>
                ) : null}
                <button
                  className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm"
                  onClick={() => clearFlag(p.id)}
                >
                  Clear Flag
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
        <div>
          Showing {(page - 1) * perPage + 1}-
          {Math.min(page * perPage, all.length)} of {all.length}
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
