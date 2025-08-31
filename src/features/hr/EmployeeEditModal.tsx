import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";

export type Employee = {
  id: string;
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
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
  const [fullName, setFullName] = useState(employee.fullName || "");
  const [phone, setPhone] = useState(employee.phone || "");
  const [role, setRole] = useState(employee.role || "employee");

  useEffect(() => {
    setFullName(employee.fullName || "");
    setPhone(employee.phone || "");
    setRole(employee.role || "employee");
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
      });
      onUpdated?.({ fullName: name, phone: phone.trim() || null, role });
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
              <option value="supervisor">supervisor</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
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
