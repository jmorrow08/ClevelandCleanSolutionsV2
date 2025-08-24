import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";

type Timesheet = {
  id: string;
  employeeId: string;
  jobId?: string | null;
  start?: any;
  end?: any;
  hours?: number;
  approvedInRunId?: string | null;
};

type EditingState = {
  id?: string | null;
  startInput: string;
  endInput: string;
  jobId: string;
};

export default function TimesheetView() {
  const { user } = useAuth();
  const { show } = useToast();
  const [rows, setRows] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        // Show last 30 days of entries for the employee
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        const qy = query(
          collection(db, "timesheets"),
          where("employeeId", "==", user.uid),
          where("start", ">=", Timestamp.fromDate(start)),
          orderBy("start", "desc"),
          limit(200)
        );
        unsub = onSnapshot(qy, (snap) => {
          const list: Timesheet[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setRows(list);
          setLoading(false);
        });
      } catch (_) {
        setLoading(false);
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, [user?.uid]);

  const totalHours = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.hours || 0) || 0), 0),
    [rows]
  );

  function formatDT(ts: any): string {
    try {
      const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
      if (!d) return "—";
      return d.toLocaleString();
    } catch {
      return "—";
    }
  }

  function toLocalInputValue(d?: Date | null): string {
    if (!d) return "";
    const dt = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return dt.toISOString().slice(0, 16);
  }

  function computeHours(startStr: string, endStr: string): number {
    try {
      const s = startStr ? new Date(startStr) : null;
      const e = endStr ? new Date(endStr) : null;
      if (!s || !e) return 0;
      const diff = (e.getTime() - s.getTime()) / 3600000;
      return Math.max(0, Math.round(diff * 100) / 100);
    } catch {
      return 0;
    }
  }

  function openNew() {
    const now = new Date();
    const halfHourAgo = new Date(now.getTime() - 30 * 60000);
    setEditing({
      id: null,
      startInput: toLocalInputValue(halfHourAgo),
      endInput: toLocalInputValue(now),
      jobId: "",
    });
  }

  function openEdit(row: Timesheet) {
    const s = row.start?.toDate ? (row.start as any).toDate() : null;
    const e = row.end?.toDate ? (row.end as any).toDate() : null;
    setEditing({
      id: row.id,
      startInput: toLocalInputValue(s),
      endInput: toLocalInputValue(e),
      jobId: row.jobId || "",
    });
  }

  async function saveEditing() {
    if (!user?.uid || !editing) return;
    const hours = computeHours(editing.startInput, editing.endInput);
    if (hours <= 0) {
      show({ type: "error", message: "End must be after start." });
      return;
    }
    try {
      setSaving(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const payload: any = {
        employeeId: user.uid,
        jobId: editing.jobId || null,
        start: Timestamp.fromDate(new Date(editing.startInput)),
        end: Timestamp.fromDate(new Date(editing.endInput)),
        hours,
        updatedAt: serverTimestamp(),
      };
      if (editing.id) {
        await updateDoc(doc(db, "timesheets", editing.id), payload);
        show({ type: "success", message: "Timesheet updated." });
      } else {
        await addDoc(collection(db, "timesheets"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        show({ type: "success", message: "Timesheet added." });
      }
      setEditing(null);
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-500">My Timesheets (30 days)</div>
        <RoleGuard allow={["owner", "super_admin", "admin"]}>
          <button
            className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-800 text-sm"
            onClick={openNew}
          >
            Add Entry
          </button>
        </RoleGuard>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-zinc-500">No entries.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Job ID</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-zinc-100 dark:border-zinc-700"
                >
                  <td className="px-3 py-2">{formatDT(r.start)}</td>
                  <td className="px-3 py-2">{formatDT(r.end)}</td>
                  <td className="px-3 py-2">
                    {Number(r.hours || 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">{r.jobId || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <RoleGuard allow={["owner", "super_admin", "admin"]}>
                      <button
                        className="text-blue-600 dark:text-blue-400 underline"
                        onClick={() => openEdit(r)}
                      >
                        Edit
                      </button>
                    </RoleGuard>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 dark:border-zinc-700">
                <td className="px-3 py-2" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-2">{totalHours.toFixed(2)}</td>
                <td className="px-3 py-2" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editing && (
        // Admin-only edit form; employees won't see this since the trigger is hidden
        <RoleGuard allow={["owner", "super_admin", "admin"]}>
          <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-2 border border-zinc-200 dark:border-zinc-700">
            <div className="text-sm font-medium mb-2">
              {editing.id ? "Edit Entry" : "Add Entry"}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <label className="block">
                <div className="text-xs text-zinc-500">Start</div>
                <input
                  type="datetime-local"
                  className="mt-1 w-full px-2 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                  value={editing.startInput}
                  onChange={(e) =>
                    setEditing((prev) =>
                      prev ? { ...prev, startInput: e.target.value } : prev
                    )
                  }
                />
              </label>
              <label className="block">
                <div className="text-xs text-zinc-500">End</div>
                <input
                  type="datetime-local"
                  className="mt-1 w-full px-2 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                  value={editing.endInput}
                  onChange={(e) =>
                    setEditing((prev) =>
                      prev ? { ...prev, endInput: e.target.value } : prev
                    )
                  }
                />
              </label>
              <label className="block md:col-span-2">
                <div className="text-xs text-zinc-500">Job ID (optional)</div>
                <input
                  type="text"
                  placeholder="job-123"
                  className="mt-1 w-full px-2 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                  value={editing.jobId}
                  onChange={(e) =>
                    setEditing((prev) =>
                      prev ? { ...prev, jobId: e.target.value } : prev
                    )
                  }
                />
              </label>
              <div className="md:col-span-2 text-xs text-zinc-500">
                Hours:{" "}
                {computeHours(editing.startInput, editing.endInput).toFixed(2)}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-white ${
                  saving ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
                }`}
                onClick={saveEditing}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </RoleGuard>
      )}
    </div>
  );
}
