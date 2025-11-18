import { useEffect, useMemo, useState } from "react";
import { FirebaseError, getApps, initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { firebaseConfig } from "@/services/firebase";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { getFunctions, httpsCallable } from "firebase/functions";

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
  const { claims } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState(() => deriveDefaultName(employee));
  const [phone, setPhone] = useState(employee.phone || "");
  const [role, setRole] = useState(employee.role || "employee");
  const [status, setStatus] = useState(employee.status !== false);

  const roleFromClaims = (claims as any)?.role as string | undefined;
  const isSuperAdmin =
    Boolean((claims as any)?.super_admin) || roleFromClaims === "super_admin";
  const isOwner =
    Boolean((claims as any)?.owner) || roleFromClaims === "owner";
  const canChangeRole = isSuperAdmin || isOwner;
  const roleOptions = useMemo(() => {
    if (isSuperAdmin) {
      return ["employee", "admin", "owner", "client", "super_admin"] as const;
    }
    if (isOwner) {
      return ["employee", "admin"] as const;
    }
    // Non-privileged users cannot change role; show current value only
    return [employee.role || "employee"] as const;
  }, [isSuperAdmin, isOwner, employee.role]);

  useEffect(() => {
    setFullName(deriveDefaultName(employee));
    setPhone(employee.phone || "");
    setRole(employee.role || "employee");
    setStatus(employee.status !== false);
  }, [employee]);

  async function resolveLinkedUserId(db: ReturnType<typeof getFirestore>) {
    const directCandidates = [employee.userId, employee.id].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    );
    for (const candidate of directCandidates) {
      try {
        const candidateDoc = await getDoc(doc(db, "users", candidate));
        if (candidateDoc.exists()) {
          return candidate;
        }
      } catch {
        // Continue to next resolution attempt
      }
    }

    const profileId = (employee.id || "").trim();
    if (profileId) {
      try {
        const snap = await getDocs(
          query(collection(db, "users"), where("profileId", "==", profileId), limit(1))
        );
        if (!snap.empty) {
          return snap.docs[0].id;
        }
      } catch {
        // Fall through to email lookup
      }
    }

    const email = (employee.email || "").trim();
    if (email) {
      const lower = email.toLowerCase();
      try {
        const snap = await getDocs(
          query(collection(db, "users"), where("emailLowercase", "==", lower), limit(1))
        );
        if (!snap.empty) {
          return snap.docs[0].id;
        }
      } catch {
        // Field may not exist; continue to raw email lookup
      }
      try {
        const snap = await getDocs(
          query(collection(db, "users"), where("email", "==", email), limit(1))
        );
        if (!snap.empty) {
          return snap.docs[0].id;
        }
      } catch {
        // No user matches the provided email
      }
    }

    return null;
  }

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
      const linkedUserId = await resolveLinkedUserId(db);
      const normalizedRole = role || "employee";
      const roleChanged = (employee.role || "employee") !== normalizedRole;

      if (roleChanged && canChangeRole) {
        if (!linkedUserId) {
          throw new Error(
            "No linked user account found. Link this employee to a portal login before changing the role."
          );
        }
        const functions = getFunctions();
        const setUserRole = httpsCallable(functions, "setUserRole");
        await setUserRole({ targetUid: linkedUserId, role: normalizedRole });
      }

      const employeeUpdates: Record<string, any> = {
        fullName: name,
        phone: phone.trim() || null,
        status,
        role: normalizedRole,
      };
      if (linkedUserId && linkedUserId !== employee.userId) {
        employeeUpdates.userId = linkedUserId;
      }

      await updateDoc(doc(db, "employeeMasterList", employee.id), employeeUpdates);

      const userDocId = linkedUserId || employee.userId || null;
      if (userDocId) {
        try {
          // Do NOT write role directly; that is handled via callable to prevent escalation.
          await updateDoc(doc(db, "users", userDocId), {
            fullName: name,
            phone: phone.trim() || null,
            status,
          });
        } catch (err) {
          if (!(err instanceof FirebaseError && err.code === "not-found")) {
            throw err;
          }
        }
      }

      onUpdated?.({
        fullName: name,
        phone: phone.trim() || null,
        role: normalizedRole,
        status,
        userId: linkedUserId || employee.userId || null,
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
              disabled={submitting || !canChangeRole}
            >
              {roleOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
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
