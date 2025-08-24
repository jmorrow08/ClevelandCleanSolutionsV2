import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";
import { getStorage, ref, listAll, getDownloadURL } from "firebase/storage";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { HideFor, RoleGuard } from "../../context/RoleGuard";
import EmployeeEditModal from "./EmployeeEditModal";

type Employee = {
  id: string;
  fullName?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  employeeIdString?: string | null;
  jobTitle?: string | null;
  status?: boolean | null;
  userId?: string | null;
};

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tab, setTab] = useState<"profile" | "rates" | "docs">("profile");
  const [editOpen, setEditOpen] = useState(false);
  const [rates, setRates] = useState<any[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docs, setDocs] = useState<{ name: string; url: string }[]>([]);
  const { claims } = useAuth();

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const snap = await getDoc(doc(db, "employeeMasterList", id));
        if (snap.exists())
          setEmployee({ id: snap.id, ...(snap.data() as any) });
        else {
          // Fallback: try users/{uid} read-only mapping
          const userSnap = await getDoc(doc(db, "users", id));
          if (userSnap.exists()) {
            const u = userSnap.data() as any;
            setEmployee({
              id,
              fullName: u.fullName || u.displayName || u.name || u.email || id,
              firstName: u.firstName || null,
              lastName: u.lastName || null,
              email: u.email || null,
              phone: u.phone || u.phoneNumber || null,
              role: u.role || null,
              employeeIdString: u.employeeIdString || null,
              jobTitle: u.jobTitle || null,
              status: typeof u.status === "boolean" ? u.status : null,
              userId: id,
            });
          }
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    async function loadRates() {
      if (!id) return;
      setRatesLoading(true);
      try {
        const db = getFirestore();
        const snap = await getDocs(
          query(
            collection(db, "employeeRates"),
            where("employeeId", "==", id),
            orderBy("effectiveDate", "desc")
          )
        );
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setRates(list);
      } catch (_) {
        setRates([]);
      } finally {
        setRatesLoading(false);
      }
    }
    loadRates();
  }, [id]);

  useEffect(() => {
    async function listDocs() {
      if (!id) return;
      setDocsLoading(true);
      try {
        const storage = getStorage();
        const root = ref(storage, `media/employees/${id}`);
        const collected: { name: string; url: string }[] = [];
        async function walk(prefixRef: ReturnType<typeof ref>) {
          const res = await listAll(prefixRef);
          for (const it of res.items) {
            try {
              const url = await getDownloadURL(it);
              const parts = it.fullPath.split("/");
              collected.push({ name: parts[parts.length - 1], url });
            } catch {}
          }
          for (const p of res.prefixes) {
            await walk(p);
          }
        }
        await walk(root);
        setDocs(collected);
      } catch (_) {
        setDocs([]);
      } finally {
        setDocsLoading(false);
      }
    }
    listDocs();
  }, [id]);

  if (!id) return <div>Invalid employee id</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Employee</h1>
        <div className="flex items-center gap-2">
          <RoleGuard allow={["owner", "super_admin"]}>
            {employee && (
              <button
                className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-800"
                onClick={() => setEditOpen(true)}
              >
                Edit
              </button>
            )}
          </RoleGuard>
          <HideFor roles={["super_admin"]}>
            <button
              className="px-3 py-1.5 rounded-md bg-zinc-200 dark:bg-zinc-700 cursor-not-allowed text-sm"
              title="Delete is super_admin-only"
              disabled
            >
              Delete
            </button>
          </HideFor>
          <RoleGuard allow={["super_admin"]}>
            <button
              className="px-3 py-1.5 rounded-md bg-red-600/10 text-red-700 dark:text-red-400 cursor-not-allowed text-sm"
              title="Delete not implemented"
              disabled
            >
              Delete
            </button>
          </RoleGuard>
        </div>
      </div>

      <div className="flex gap-2 text-sm">
        {(
          [
            ["profile", "Profile"],
            ["rates", "Rates"],
            ["docs", "Training/Docs"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`px-3 py-1.5 rounded-md border ${
              tab === key
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-white dark:bg-zinc-800"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : !employee ? (
        <div className="text-sm text-zinc-500">Employee not found.</div>
      ) : (
        <div className="space-y-3">
          {tab === "profile" && (
            <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Name"
                  value={
                    employee.fullName ||
                    [employee.firstName, employee.lastName]
                      .filter(Boolean)
                      .join(" ") ||
                    employee.id
                  }
                />
                <Field label="Email" value={employee.email || "—"} />
                <Field label="Phone" value={employee.phone || "—"} />
                <Field
                  label="Employee ID"
                  value={employee.employeeIdString || "—"}
                />
                <div>
                  <div className="text-xs text-zinc-500">Role</div>
                  <div className="mt-0.5">
                    <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                      {employee.role || "employee"}
                    </span>
                  </div>
                </div>
                <Field label="Job Title" value={employee.jobTitle || "—"} />
                <Field
                  label="Status"
                  value={employee.status === false ? "inactive" : "active"}
                />
              </div>
              <div className="rounded-lg p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
                <div className="text-sm font-medium">Auth/Claims</div>
                <div className="text-sm text-zinc-500">Read-only</div>
                <div className="text-xs mt-1">
                  {JSON.stringify(claims || {}, null, 0)}
                </div>
              </div>
            </div>
          )}

          {tab === "rates" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-500">Rates</div>
                <RoleGuard allow={["owner", "super_admin"]}>
                  <button
                    className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-800"
                    onClick={() => openRateModal(id)}
                  >
                    Add Rate
                  </button>
                </RoleGuard>
              </div>

              <div className="hidden md:block overflow-x-auto rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Effective Date</th>
                      <th className="px-3 py-2">Hourly Rate</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratesLoading ? (
                      <tr>
                        <td className="px-3 py-4" colSpan={3}>
                          Loading…
                        </td>
                      </tr>
                    ) : rates.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-zinc-500" colSpan={3}>
                          No rates.
                        </td>
                      </tr>
                    ) : (
                      rates.map((r) => (
                        <tr
                          key={r.id}
                          className="border-t border-zinc-100 dark:border-zinc-700"
                        >
                          <td className="px-3 py-2">
                            {formatDate(r.effectiveDate)}
                          </td>
                          <td className="px-3 py-2">
                            ${Number(r.hourlyRate || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <RoleGuard allow={["owner", "super_admin"]}>
                              <button
                                className="text-blue-600 dark:text-blue-400 underline"
                                onClick={() => openRateModal(id, r)}
                              >
                                Edit
                              </button>
                            </RoleGuard>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2">
                {ratesLoading ? (
                  <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
                    Loading…
                  </div>
                ) : rates.length === 0 ? (
                  <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
                    No rates.
                  </div>
                ) : (
                  rates.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {formatDate(r.effectiveDate)}
                        </div>
                        <div>${Number(r.hourlyRate || 0).toFixed(2)}</div>
                      </div>
                      <div className="mt-2 text-right">
                        <RoleGuard allow={["owner", "super_admin"]}>
                          <button
                            className="text-blue-600 dark:text-blue-400 underline text-sm"
                            onClick={() => openRateModal(id, r)}
                          >
                            Edit
                          </button>
                        </RoleGuard>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === "docs" && (
            <div className="space-y-2">
              {docsLoading ? (
                <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
                  Loading…
                </div>
              ) : docs.length === 0 ? (
                <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
                  No documents found.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {docs.map((d) => (
                    <a
                      key={d.url}
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm underline"
                    >
                      {d.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {editOpen && employee && (
        <EmployeeEditModal
          employee={employee}
          onClose={() => setEditOpen(false)}
          onUpdated={(partial) =>
            setEmployee((prev) => (prev ? { ...prev, ...partial } : prev))
          }
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function formatDate(ts: any): string {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    return d ? d.toLocaleDateString() : "—";
  } catch {
    return "—";
  }
}

async function openRateModal(
  employeeId: string,
  existing?: { id: string; effectiveDate: any; hourlyRate: number }
) {
  // Lightweight prompt-based modal to avoid extra file complexity here
  const effective = prompt(
    "Effective Date (YYYY-MM-DD)",
    existing?.effectiveDate?.toDate
      ? existing.effectiveDate.toDate().toISOString().slice(0, 10)
      : ""
  );
  if (!effective) return;
  const rateStr = prompt(
    "Hourly Rate",
    existing?.hourlyRate != null ? String(existing.hourlyRate) : ""
  );
  if (!rateStr) return;
  const rate = Number(rateStr);
  if (Number.isNaN(rate) || rate <= 0) return alert("Invalid rate");

  if (!getApps().length) initializeApp(firebaseConfig);
  const db = getFirestore();
  const dt = new Date(effective + "T00:00:00");
  try {
    if (existing?.id) {
      await updateDoc(doc(db, "employeeRates", existing.id), {
        employeeId,
        effectiveDate: (globalThis as any).firebase?.firestore?.Timestamp
          ?.fromDate
          ? (globalThis as any).firebase.firestore.Timestamp.fromDate(dt)
          : dt,
        hourlyRate: rate,
        updatedAt: serverTimestamp(),
      } as any);
    } else {
      await addDoc(collection(db, "employeeRates"), {
        employeeId,
        effectiveDate: (globalThis as any).firebase?.firestore?.Timestamp
          ?.fromDate
          ? (globalThis as any).firebase.firestore.Timestamp.fromDate(dt)
          : dt,
        hourlyRate: rate,
        createdAt: serverTimestamp(),
      } as any);
    }
    // Trigger a soft reload of rates by reloading the page section: simplest way
    location.reload();
  } catch (e) {
    alert("Failed to save rate");
  }
}
