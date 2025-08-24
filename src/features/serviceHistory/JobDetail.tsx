import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { firebaseConfig } from "../../services/firebase";
import {
  getClientName,
  getLocationName,
  getEmployeeNames,
} from "../../services/queries/resolvers";
import {
  mapLegacyStatus,
  type CanonicalStatus,
} from "../../services/statusMap";
import { RoleGuard } from "../../context/RoleGuard";
import JobEditForm from "./JobEditForm";

type JobRecord = {
  id: string;
  serviceDate?: any;
  clientProfileId?: string;
  locationId?: string;
  assignedEmployees?: string[];
  status?: string;
  statusV2?: CanonicalStatus;
};

type Note = {
  id: string;
  message: string;
  createdAt?: any;
  authorRole?: string;
};

export default function JobDetail() {
  const { jobId } = useParams();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [locationName, setLocationName] = useState<string>("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState<string>("");
  const [postingNote, setPostingNote] = useState(false);
  const [assignedDisplay, setAssignedDisplay] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        if (!jobId) return;
        const db = getFirestore();
        const snap = await getDoc(doc(db, "serviceHistory", jobId));
        if (!snap.exists()) {
          setJob(null);
          return;
        }
        const j = { id: snap.id, ...(snap.data() as any) } as JobRecord;
        setJob(j);
        if (j.clientProfileId)
          setClientName(await getClientName(j.clientProfileId));
        if (j.locationId) setLocationName(await getLocationName(j.locationId));

        // Load notes for this job
        try {
          const nq = query(
            collection(db, "jobNotes"),
            where("jobId", "==", jobId),
            orderBy("createdAt", "desc")
          );
          const ns = await getDocs(nq);
          const list: Note[] = [];
          ns.forEach((d) =>
            list.push({ id: d.id, ...(d.data() as any) } as Note)
          );
          setNotes(list);
        } catch {
          setNotes([]);
        }

        // Resolve assigned employee display names
        try {
          const names = await getEmployeeNames(j.assignedEmployees);
          setAssignedDisplay(names);
        } catch {
          setAssignedDisplay([]);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobId]);

  const statusCanonical = useMemo(() => {
    if (!job) return undefined;
    return job.statusV2 || mapLegacyStatus(job.status) || undefined;
  }, [job]);

  async function handleSave(
    updated: Partial<JobRecord> & { serviceDate?: Date }
  ) {
    if (!job || !jobId) return;
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    const payload: any = {};
    if (Array.isArray(updated.assignedEmployees))
      payload.assignedEmployees = updated.assignedEmployees;
    if (updated.serviceDate instanceof Date)
      payload.serviceDate = Timestamp.fromDate(updated.serviceDate);
    if ((updated as any).statusV2) payload.statusV2 = (updated as any).statusV2;
    await updateDoc(doc(db, "serviceHistory", jobId), payload);
    setJob((prev) => (prev ? { ...prev, ...payload } : prev));
  }

  async function postNote() {
    const text = newNote.trim();
    if (!text || !jobId || !job) return;
    try {
      setPostingNote(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const auth = getAuth();
      const claims = (await auth.currentUser?.getIdTokenResult(true))
        ?.claims as any;
      let authorRole: string = "employee";
      if (claims?.admin || claims?.owner || claims?.super_admin)
        authorRole = "admin";
      const payload: any = {
        jobId,
        locationId: job.locationId || null,
        message: text,
        authorRole,
        createdAt: serverTimestamp(),
        date: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "jobNotes"), payload);
      setNotes((prev) => [{ id: ref.id, ...payload }, ...prev]);
      setNewNote("");
    } catch {
      // ignore
    } finally {
      setPostingNote(false);
    }
  }

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
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : !job ? (
          <div className="text-sm text-zinc-500">Not found.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {locationName || clientName || job.id}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5 truncate">
                  {job.serviceDate?.toDate
                    ? job.serviceDate.toDate().toLocaleString()
                    : "—"}
                  {statusCanonical ? (
                    <span className="ml-2 px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                      {statusCanonical}
                    </span>
                  ) : null}
                </div>
                {assignedDisplay.length ? (
                  <div className="text-xs text-zinc-500 mt-0.5 truncate">
                    Assigned: {assignedDisplay.join(", ")}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0" />
            </div>

            <RoleGuard allow={["admin", "owner", "super_admin"]}>
              <JobEditForm job={job} onSave={handleSave} />
            </RoleGuard>

            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3">
              <div className="font-medium">Notes</div>
              <div className="mt-2 space-y-2">
                {notes.length === 0 ? (
                  <div className="text-sm text-zinc-500">No notes yet.</div>
                ) : (
                  notes.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-md p-3 bg-zinc-50 dark:bg-zinc-900"
                    >
                      <div className="text-xs text-zinc-500 flex items-center gap-2">
                        <span className="uppercase">
                          {n.authorRole || "note"}
                        </span>
                        <span>
                          {n.createdAt?.toDate
                            ? n.createdAt.toDate().toLocaleString()
                            : ""}
                        </span>
                      </div>
                      <div className="mt-1 text-sm whitespace-pre-wrap">
                        {n.message}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Allow all roles to add notes; permissions enforced server-side */}
              <div className="mt-3">
                <textarea
                  className="w-full border rounded-md p-2 bg-white dark:bg-zinc-900"
                  rows={3}
                  placeholder="Add a note for this job…"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  disabled={postingNote}
                />
                <div className="mt-2">
                  <button
                    className={`px-3 py-1.5 rounded-md text-white ${
                      postingNote || !newNote.trim()
                        ? "bg-zinc-400 cursor-not-allowed"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                    onClick={postNote}
                    disabled={postingNote || !newNote.trim()}
                  >
                    {postingNote ? "Posting…" : "Add Note"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
