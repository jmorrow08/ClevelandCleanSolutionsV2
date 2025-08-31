import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

import { firebaseConfig } from "../../services/firebase";
import JobEditForm from "./JobEditForm";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

export default function JobEdit() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { show } = useToast();
  const { claims } = useAuth();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<any>(null);

  const [deleting, setDeleting] = useState(false);

  // Check if user has admin permissions
  const isAdmin = claims?.admin || claims?.owner || claims?.super_admin;

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        if (!jobId) return;
        const snap = await getDoc(doc(db, "serviceHistory", jobId));
        if (snap.exists()) {
          setJob({ id: snap.id, ...snap.data() });
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobId]);

  const handleSave = async (updates: any) => {
    if (!jobId) return;
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();

      const updateData: any = {};
      if (updates.serviceDate) {
        updateData.serviceDate = updates.serviceDate;
      }
      if (updates.assignedEmployees) {
        updateData.assignedEmployees = updates.assignedEmployees;
      }
      if (updates.statusV2) {
        updateData.statusV2 = updates.statusV2;
        updateData.status = updates.statusV2; // Keep legacy status field
      }

      updateData.updatedAt = serverTimestamp();

      await updateDoc(doc(db, "serviceHistory", jobId), updateData);
      show({ message: "Job updated successfully", type: "success" });

      // Refresh job data
      const snap = await getDoc(doc(db, "serviceHistory", jobId));
      if (snap.exists()) {
        setJob({ id: snap.id, ...snap.data() });
      }
    } catch (error: any) {
      console.error("Error updating job:", error);
      show({
        message: `Failed to update job: ${error.message}`,
        type: "error",
      });
    }
  };

  const handleDelete = async () => {
    if (!jobId) return;

    // Show confirmation dialog
    const confirmed = window.confirm(
      "Are you sure you want to delete this job? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();

      await deleteDoc(doc(db, "serviceHistory", jobId));
      show({ message: "Job deleted successfully", type: "success" });
      navigate("/service-history");
    } catch (error: any) {
      console.error("Error deleting job:", error);
      show({
        message: `Failed to delete job: ${error.message}`,
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <Link to="/service-history" className="underline">
          Service History
        </Link>
        <span className="mx-2">/</span>
        <span className="opacity-70">Job {jobId}</span>
      </div>
      <div className="rounded-lg p-4 card-bg shadow-elev-1">
        <div className="flex items-center justify-between">
          <div className="font-medium">Job {jobId}</div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={handleDelete}
                disabled={deleting || loading}
                className="px-3 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white disabled:bg-zinc-400 disabled:cursor-not-allowed text-sm"
                title="Delete this job"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="text-sm text-zinc-500 mt-2">Loading…</div>
        ) : !job ? (
          <div className="text-sm text-zinc-500 mt-2">Not found.</div>
        ) : (
          <div className="mt-4">
            <JobEditForm
              job={job}
              onSave={handleSave}
              onNoteAdded={(note) => {
                // Handle note addition if needed
                console.log("Note added:", note);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
