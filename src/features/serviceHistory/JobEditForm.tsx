import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { firebaseConfig } from "../../services/firebase";
import type { CanonicalStatus } from "../../services/statusMap";
import { mapLegacyStatus } from "../../services/statusMap";

type Job = {
  id: string;
  serviceDate?: any;
  assignedEmployees?: string[];
  status?: string;
  statusV2?: CanonicalStatus;
  locationId?: string;
};

type Employee = { id: string; fullName: string };

export default function JobEditForm({
  job,
  onSave,
  onNoteAdded,
  loadEmployees,
  writeNote,
}: {
  job: Job;
  onSave: (
    updated: Partial<Job> & { serviceDate?: Date }
  ) => Promise<void> | void;
  onNoteAdded?: (note: {
    id: string;
    message: string;
    createdAt?: any;
    authorRole?: string;
  }) => void;
  loadEmployees?: () => Promise<Employee[]>;
  writeNote?: (payload: any) => Promise<{ id: string } | void>;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empError, setEmpError] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<string[]>(
    Array.isArray(job.assignedEmployees) ? job.assignedEmployees : []
  );
  const [serviceDateStr, setServiceDateStr] = useState<string>("");
  const [statusV2, setStatusV2] = useState<CanonicalStatus | "">(
    (job.statusV2 || mapLegacyStatus(job.status) || "") as any
  );
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = job.serviceDate?.toDate ? job.serviceDate.toDate() : undefined;
    if (d) {
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setServiceDateStr(iso);
    } else {
      setServiceDateStr("");
    }
  }, [job.serviceDate]);

  useEffect(() => {
    async function load() {
      try {
        setEmpError(null);
        if (loadEmployees) {
          setEmployees(await loadEmployees());
          return;
        }
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        let list: Employee[] = [];
        try {
          const snap = await getDocs(collection(db, "employeeMasterList"));
          const temp: Employee[] = [];
          snap.forEach((d) => {
            const data = d.data() as any;
            const parts = [data.firstName, data.lastName]
              .filter(Boolean)
              .join(" ")
              .trim();
            const name = data.fullName || parts || data.name || "Employee";
            temp.push({ id: d.id, fullName: name });
          });
          temp.sort((a, b) => a.fullName.localeCompare(b.fullName));
          list = temp;
        } catch (e) {
          // fallback below
        }

        if (list.length === 0) {
          try {
            const roles = ["employee", "admin", "owner", "super_admin"];
            const snapUsers = await getDocs(
              query(collection(db, "users"), where("role", "in", roles))
            );
            const conv: Employee[] = [];
            snapUsers.forEach((d) => {
              const u = d.data() as any;
              const idForDetail = u.profileId || d.id;
              const display =
                u.fullName ||
                [u.firstName, u.lastName].filter(Boolean).join(" ") ||
                u.displayName ||
                u.name ||
                u.email ||
                idForDetail;
              conv.push({ id: idForDetail, fullName: display });
            });
            conv.sort((a, b) => a.fullName.localeCompare(b.fullName));
            list = conv;
          } catch (e) {
            // keep empty
          }
        }

        setEmployees(list);
      } catch (e: any) {
        setEmpError(e?.message || "Missing or insufficient permissions.");
        setEmployees([]);
      }
    }
    load();
  }, [loadEmployees]);

  function toggleEmployee(id: string) {
    setAssigned((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const statusOptions: CanonicalStatus[] = useMemo(
    () => [
      "scheduled",
      "in_progress",
      "completed_pending_approval",
      "approved",
      "canceled",
      "no_show",
    ],
    []
  );

  async function handleSave() {
    const dateVal = serviceDateStr ? new Date(serviceDateStr) : undefined;
    try {
      setSaving(true);
      await onSave({
        assignedEmployees: assigned,
        serviceDate: dateVal,
        statusV2: statusV2 as any,
      });
      if (note.trim()) {
        const payload: any = {
          jobId: job.id,
          locationId: job.locationId || null,
          message: note.trim(),
          createdAt: serverTimestamp(),
          date: serverTimestamp(),
        };
        if (writeNote) {
          const ref = await writeNote(payload);
          onNoteAdded?.({
            id: (ref as any)?.id || Math.random().toString(),
            ...payload,
          });
        } else {
          if (!getApps().length) initializeApp(firebaseConfig);
          const db = getFirestore();
          const auth = getAuth();
          const claims = (await auth.currentUser?.getIdTokenResult(true))
            ?.claims as any;
          let authorRole: string = "employee";
          if (claims?.admin || claims?.owner || claims?.super_admin)
            authorRole = "admin";
          const ref = await addDoc(collection(db, "jobNotes"), {
            ...payload,
            authorRole,
          });
          onNoteAdded?.({ id: ref.id, ...payload, authorRole });
        }
        setNote("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium mb-1">Assigned Employees</div>
        {empError ? (
          <div className="text-xs text-red-500 mb-2">{empError}</div>
        ) : null}
        {employees.length === 0 && !empError ? (
          <div className="text-xs text-zinc-500 mb-2">No employees.</div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {employees.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assigned.includes(e.id)}
                onChange={() => toggleEmployee(e.id)}
              />
              <span>{e.fullName}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-sm mb-1">Service Date/Time</label>
          <input
            type="datetime-local"
            className="w-full border rounded-md p-2 card-bg"
            value={serviceDateStr}
            onChange={(e) => setServiceDateStr(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Status</label>
          <select
            className="w-full border rounded-md p-2 card-bg"
            value={statusV2 || ""}
            onChange={(e) => setStatusV2(e.target.value as CanonicalStatus)}
          >
            <option value="">—</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="text-right">
          <button
            className={`px-3 py-2 rounded-md text-white ${
              saving
                ? "bg-zinc-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div>
        <div className="text-sm font-medium mb-1">Optional note</div>
        <textarea
          className="w-full border rounded-md p-2 card-bg"
          rows={3}
          placeholder="Write a note to add with this update…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </div>
  );
}
