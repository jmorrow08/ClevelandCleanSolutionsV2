import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";

export default function AddNoteToCleaners() {
  const [message, setMessage] = useState("");
  const [loadingJob, setLoadingJob] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [optimisticSent, setOptimisticSent] = useState(false);
  const [jobContext, setJobContext] = useState<{
    jobId: string | null;
    locationId: string | null;
  }>({ jobId: null, locationId: null });
  const { show } = useToast();

  useEffect(() => {
    async function loadNextJob() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;
        const db = getFirestore();
        // Resolve client profileId from users/{uid}
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const profileId = (userSnap.data() as any)?.profileId;
        if (!profileId) return;
        // Find next scheduled job for this client
        try {
          const q = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            orderBy("serviceDate", "asc"),
            limit(1)
          );
          const snap = await getDocs(q);
          const doc0 = snap.docs[0];
          if (doc0) {
            const data = doc0.data() as any;
            setJobContext({
              jobId: doc0.id,
              locationId: data?.locationId || null,
            });
          }
        } catch (e) {
          // non-fatal; allow manual note without job binding
        }
      } finally {
        setLoadingJob(false);
      }
    }
    loadNextJob();
  }, []);

  async function onSubmit() {
    const text = message.trim();
    if (!text) return;
    try {
      setSubmitting(true);
      setOptimisticSent(true);
      setMessage("");
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const auth = getAuth();
      const user = auth.currentUser;
      const payload: any = {
        jobId: jobContext.jobId,
        locationId: jobContext.locationId,
        authorRole: "client",
        message: text,
        createdAt: serverTimestamp(),
        date: serverTimestamp(),
      };
      if (user?.email) payload.clientEmail = user.email;
      await addDoc(collection(db, "jobNotes"), payload);
      show({ type: "success", message: "Note sent to your cleaning team." });
    } catch (e: any) {
      // revert optimistic clear on failure
      setMessage((prev) => prev || message);
      setOptimisticSent(false);
      show({ type: "error", message: e?.message || "Failed to submit note" });
    } finally {
      setSubmitting(false);
      setTimeout(() => setOptimisticSent(false), 1500);
    }
  }
  return (
    <div>
      <div className="font-medium mb-1">Add Note to Cleaners</div>
      <textarea
        className="w-full border rounded-md p-2 card-bg"
        rows={4}
        placeholder="Write a note for your cleaning team…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={submitting}
      />
      <div className="mt-2 flex items-center justify-between">
        <button
          className={`px-3 py-2 rounded-md text-white ${
            submitting
              ? "bg-zinc-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          onClick={onSubmit}
          disabled={submitting || !message.trim()}
          title={
            jobContext.jobId
              ? "Send note to your assigned cleaners"
              : loadingJob
              ? "Resolving your next job…"
              : "Send note (no job linked)"
          }
        >
          {submitting ? "Sending…" : optimisticSent ? "Sent" : "Submit"}
        </button>
        <span className="text-xs text-zinc-500">
          {loadingJob
            ? "Finding your next job…"
            : jobContext.jobId
            ? `Linked to job ${jobContext.jobId}`
            : "No upcoming job found; note will still be saved."}
        </span>
      </div>
    </div>
  );
}
