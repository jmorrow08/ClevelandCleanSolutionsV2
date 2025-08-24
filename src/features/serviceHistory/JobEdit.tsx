import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";

export default function JobEdit() {
  const { jobId } = useParams();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<any>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        if (!jobId) return;
        const snap = await getDoc(doc(db, "serviceHistory", jobId));
        setJob(snap.data());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobId]);

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <Link to="/service-history" className="underline">
          Service History
        </Link>
        <span className="mx-2">/</span>
        <span className="opacity-70">Job {jobId}</span>
      </div>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <div className="flex items-center justify-between">
          <div className="font-medium">Job {jobId}</div>
          <button
            className="px-3 py-1 rounded-md bg-zinc-200 dark:bg-zinc-700 cursor-not-allowed"
            title="No writes yet"
            disabled
          >
            Save
          </button>
        </div>
        {loading ? (
          <div className="text-sm text-zinc-500 mt-2">Loading…</div>
        ) : !job ? (
          <div className="text-sm text-zinc-500 mt-2">Not found.</div>
        ) : (
          <div className="text-sm text-zinc-500 mt-2">
            Read-only view. Edits disabled.
          </div>
        )}
      </div>
    </div>
  );
}
