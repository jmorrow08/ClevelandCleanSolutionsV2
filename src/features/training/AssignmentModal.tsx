import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";

type Props = { moduleId: string; onClose: () => void };

export default function AssignmentModal({ moduleId, onClose }: Props) {
  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"employees" | "clients">("employees");
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>(
    []
  );
  const [clientUsers, setClientUsers] = useState<
    { id: string; name: string }[]
  >([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        // Employees: users where claims.employee == true (denormalized list absent; fallback to users)
        try {
          const snap = await getDocs(query(collection(db, "users")));
          const list: any[] = [];
          snap.forEach((d) => {
            const v: any = d.data();
            const name = v.displayName || v.name || d.id;
            list.push({ id: d.id, name });
          });
          setEmployees(list);
        } catch {}
        // Clients: client portal users (fallback: clients collection if exists)
        try {
          const snap = await getDocs(
            query(collection(db, "clientPortalUsers"))
          );
          const list: any[] = [];
          snap.forEach((d) => {
            const v: any = d.data();
            const name = v.displayName || v.email || d.id;
            list.push({ id: d.id, name });
          });
          setClientUsers(list);
        } catch {}
      } catch {}
    }
    load();
  }, []);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleAssign() {
    if (selected.length === 0) {
      show({ type: "error", message: "Select at least one" });
      return;
    }
    try {
      setSubmitting(true);
      const db = getFirestore();
      const due = dueAt ? new Date(dueAt) : null;
      for (const id of selected) {
        const payload: any = {
          moduleId,
          dueAt: due,
          assignedAt: serverTimestamp(),
          assignedBy: null,
        };
        if (mode === "employees") payload.userId = id;
        else payload.clientUserId = id;
        await addDoc(collection(db, "trainingAssignments"), payload);
      }
      show({ type: "success", message: "Assigned" });
      onClose();
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to assign" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative w-full max-w-2xl rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
        <div className="text-lg font-medium">Assign Module</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Assign to</label>
            <select
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            >
              <option value="employees">Employees</option>
              <option value="clients">Client Users</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Due at (optional)</label>
            <input
              type="datetime-local"
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>

          <div className="max-h-64 overflow-auto border rounded-md">
            <table className="w-full text-sm">
              <tbody>
                {(mode === "employees" ? employees : clientUsers).map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-2 w-8">
                      <input
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="p-2">{r.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-white ${
              submitting ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={handleAssign}
            disabled={submitting}
          >
            {submitting ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}






