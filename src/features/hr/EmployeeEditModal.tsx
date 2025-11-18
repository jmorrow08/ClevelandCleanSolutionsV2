import { useEffect, useState } from "react";
import { FirebaseError, getApps, initializeApp } from "firebase/app";
import { doc, getFirestore, updateDoc } from "firebase/firestore";
import { firebaseConfig } from "@/services/firebase";
import { useToast } from "@/context/ToastContext";

export type Employee = {
  id: string;
  fullName?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  status?: boolean | null;
  userId?: string | null;
};

export default function EmployeeEditModal({
  employee,
  onClose,
  onUpdated,
}: {
  employee: Employee;
  onClose: () => void;
  onUpdated?: (partial: Partial<Employee>) => void;
}) {
  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState(() => deriveDefaultName(employee));
  const [phone, setPhone] = useState(employee.phone || "");
  const [role, setRole] = useState(employee.role || "employee");
  const [status, setStatus] = useState(employee.status !== false);

  useEffect(() => {
    setFullName(deriveDefaultName(employee));
    setPhone(employee.phone || "");
    setRole(employee.role || "employee");
    setStatus(employee.status !== false);
  }, [employee]);

  async function handleSave() {
    const name = fullName.trim();
    if (!name) {
      show({ type: "error", message: "Full name is required" });
      return;
    }
    try {
      setSubmitting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      await updateDoc(doc(db, "employeeMasterList", employee.id), {
        fullName: name,
        phone: phone.trim() || null,
        role: role || "employee",
        status,
      });

      const userDocId = employee.userId || employee.id;
      try {
        await updateDoc(doc(db, "users", userDocId), {
          fullName: name,
          phone: phone.trim() || null,
          role: role || "employee",
          status,
        });
      } catch (err) {
        if (!(err instanceof FirebaseError && err.code === "not-found")) {
          throw err;
        }
      }
      onUpdated?.({
        fullName: name,
        phone: phone.trim() || null,
        role,
        status,
      });
      show({ type: "success", message: "Employee updated" });
      onClose();
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to update" });
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
      <div className="relative w-full max-w-md rounded-lg card-bg shadow-elev-3 p-4">
        <div className="text-lg font-medium">Edit Employee</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1" htmlFor="emp-fullname">
              Full name
            </label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              id="emp-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm mb-1" htmlFor="emp-phone">
              Phone
            </label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              id="emp-phone"
              value={phone || ""}
              onChange={(e) => setPhone(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm mb-1" htmlFor="emp-role">
              Role
            </label>
            <select
              className="w-full border rounded-md px-3 py-2 card-bg"
              id="emp-role"
              value={role || "employee"}
              onChange={(e) => setRole(e.target.value)}
              disabled={submitting}
            >
              <option value="employee">employee</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
              <option value="client">client</option>
              <option value="super_admin">super_admin</option>
            </select>
          </div>
          <div>
            <div className="block text-sm mb-1">Status</div>
            <div className="flex items-center gap-2">
              {[true, false].map((value) => {
                const isSelected = status === value;
                return (
                  <button
                    key={value ? "active" : "inactive"}
                    type="button"
                    className={`px-3 py-1.5 rounded-md border text-sm transition ${
                      isSelected
                        ? "bg-brand-500 text-white border-brand-500 dark:border-brand-400"
                        : "card-bg border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300 hover:border-brand-300 hover:text-brand-600"
                    }`}
                    onClick={() => setStatus(value)}
                    disabled={submitting}
                  >
                    {value ? "Active" : "Inactive"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-md border card-bg"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-white ${
              submitting ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={handleSave}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function deriveDefaultName(employee: Employee): string {
  return (
    employee.fullName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim() ||
    employee.email ||
    employee.id
  );
}
