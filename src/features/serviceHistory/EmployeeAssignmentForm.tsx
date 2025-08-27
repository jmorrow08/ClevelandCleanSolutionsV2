import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";

type Job = {
  id: string;
  assignedEmployees?: string[];
};

type Employee = { id: string; fullName: string };

export default function EmployeeAssignmentForm({
  job,
  onSave,
}: {
  job: Job;
  onSave: (updated: Partial<Job>) => Promise<void> | void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empError, setEmpError] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<string[]>(
    Array.isArray(job.assignedEmployees) ? job.assignedEmployees : []
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setEmpError(null);
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
  }, []);

  function toggleEmployee(id: string) {
    setAssigned((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    try {
      setSaving(true);
      await onSave({
        assignedEmployees: assigned,
      });
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
          {saving ? "Saving…" : "Save Assignments"}
        </button>
      </div>
    </div>
  );
}
