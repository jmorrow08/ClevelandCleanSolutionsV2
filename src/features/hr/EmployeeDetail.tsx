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

export default function EmployeeDetail({
  employeeId,
}: {
  employeeId?: string;
}) {
  const params = useParams<{ id: string }>();
  const id = (employeeId || (params as any)?.id) as string | undefined;
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tab, setTab] = useState<"profile" | "rates" | "docs">("profile");
  const [editOpen, setEditOpen] = useState(false);
  const [rates, setRates] = useState<any[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docs, setDocs] = useState<{ name: string; url: string }[]>([]);
  const { claims } = useAuth();

  type RateDoc = {
    id?: string;
    employeeId?: string;
    employeeProfileId?: string;
    rateType?: "per_visit" | "hourly" | "monthly";
    amount?: number;
    hourlyRate?: number;
    rate?: number;
    effectiveDate?: any;
    locationId?: string | null;
    locationName?: string | null;
    createdAt?: any;
    updatedAt?: any;
  };

  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<RateDoc | null>(null);
  const [form, setForm] = useState<{
    rateType: "per_visit" | "hourly" | "monthly";
    amount: string;
    effectiveDate: string;
    locationId: string;
  }>({ rateType: "per_visit", amount: "", effectiveDate: "", locationId: "" });

  function handleOpenAddRate() {
    setEditingRate(null);
    setForm({
      rateType: "per_visit",
      amount: "",
      effectiveDate: "",
      locationId: "",
    });
    setRateModalOpen(true);
  }

  function handleOpenEditRate(r: any) {
    const n = normalizeRate(r);
    const eff = normalizeEffectiveDate(n);
    setEditingRate({ ...n, id: r?.id });
    setForm({
      rateType: (n.rateType as any) || "per_visit",
      amount: String(n.amount ?? ""),
      effectiveDate: eff
        ? new Date(eff.getTime() - eff.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 10)
        : "",
      locationId: n.locationId || "",
    });
    setRateModalOpen(true);
  }

  async function handleSaveRate() {
    if (!id) return;
    const rateType = form.rateType;
    const amountNum = Number(form.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0)
      return alert("Invalid amount");
    if (!form.effectiveDate) return alert("Effective date required");
    const effective = new Date(form.effectiveDate + "T00:00:00");

    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();

      const payload: any = {
        employeeId: id,
        employeeProfileId: id,
        rateType,
        amount: amountNum,
        effectiveDate: effective,
        locationId: form.locationId?.trim() ? form.locationId.trim() : null,
        updatedAt: serverTimestamp(),
      };
      if (rateType === "hourly") payload.hourlyRate = amountNum;
      if (rateType === "per_visit") payload.rate = amountNum;
      if (rateType === "monthly") payload.monthlyRate = amountNum;

      if (editingRate?.id) {
        await updateDoc(doc(db, "employeeRates", editingRate.id), payload);
      } else {
        await addDoc(collection(db, "employeeRates"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      // Refresh list
      setRateModalOpen(false);
      setRatesLoading(true);
      try {
        const q1 = getDocs(
          query(
            collection(db, "employeeRates"),
            where("employeeId", "==", id),
            orderBy("effectiveDate", "desc")
          )
        );
        const q2 = getDocs(
          query(
            collection(db, "employeeRates"),
            where("employeeProfileId", "==", id)
          )
        );
        const [s1, s2] = await Promise.allSettled([q1, q2]);
        const collected: Record<string, any> = {};
        if (s1.status === "fulfilled")
          s1.value.forEach(
            (d) => (collected[d.id] = { id: d.id, ...(d.data() as any) })
          );
        if (s2.status === "fulfilled")
          s2.value.forEach(
            (d) => (collected[d.id] = { id: d.id, ...(d.data() as any) })
          );
        const list = Object.values(collected) as any[];
        list.sort(
          (a, b) =>
            (normalizeEffectiveDate(b)?.getTime?.() || 0) -
            (normalizeEffectiveDate(a)?.getTime?.() || 0)
        );
        setRates(list);
      } finally {
        setRatesLoading(false);
      }
    } catch (e) {
      alert("Failed to save rate");
    }
  }

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
        // Primary: V2 schema using employeeId + effectiveDate ordering
        const q1 = getDocs(
          query(
            collection(db, "employeeRates"),
            where("employeeId", "==", id),
            orderBy("effectiveDate", "desc")
          )
        );
        // Fallback: V1 schema using employeeProfileId (may lack effectiveDate)
        const q2 = getDocs(
          query(
            collection(db, "employeeRates"),
            where("employeeProfileId", "==", id)
          )
        );
        const [s1, s2] = await Promise.allSettled([q1, q2]);
        const collected: Record<string, any> = {};
        if (s1.status === "fulfilled") {
          s1.value.forEach(
            (d) => (collected[d.id] = { id: d.id, ...(d.data() as any) })
          );
        }
        if (s2.status === "fulfilled") {
          s2.value.forEach(
            (d) => (collected[d.id] = { id: d.id, ...(d.data() as any) })
          );
        }
        const list = Object.values(collected) as any[];
        list.sort((a: any, b: any) => {
          const ad = normalizeEffectiveDate(a);
          const bd = normalizeEffectiveDate(b);
          return (bd?.getTime?.() || 0) - (ad?.getTime?.() || 0);
        });
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
                    onClick={() => handleOpenAddRate()}
                  >
                    Add Rate
                  </button>
                </RoleGuard>
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-xs">
                Per job/visit rate (piece-rate) — not hourly
              </div>

              <div className="hidden md:block overflow-x-auto rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Effective Date</th>
                      <th className="px-3 py-2">Rate Type</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Scope</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratesLoading ? (
                      <tr>
                        <td className="px-3 py-4" colSpan={5}>
                          Loading…
                        </td>
                      </tr>
                    ) : rates.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-zinc-500" colSpan={5}>
                          No rates.
                        </td>
                      </tr>
                    ) : (
                      rates.map((r) => {
                        const n = normalizeRate(r);
                        return (
                          <tr
                            key={r.id}
                            className="border-t border-zinc-100 dark:border-zinc-700"
                          >
                            <td className="px-3 py-2">
                              {formatDate(n.effectiveDate)}
                            </td>
                            <td className="px-3 py-2">{n.rateType}</td>
                            <td className="px-3 py-2">
                              {formatMoney(n.amount || 0)}
                            </td>
                            <td className="px-3 py-2">
                              {n.locationName ||
                                n.locationId ||
                                "All locations"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <RoleGuard allow={["owner", "super_admin"]}>
                                <button
                                  className="text-blue-600 dark:text-blue-400 underline"
                                  onClick={() => handleOpenEditRate(r)}
                                >
                                  Edit
                                </button>
                              </RoleGuard>
                            </td>
                          </tr>
                        );
                      })
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
                  rates.map((r) => {
                    const n = normalizeRate(r);
                    return (
                      <div
                        key={r.id}
                        className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium">
                            {formatDate(n.effectiveDate)}
                          </div>
                          <div>{formatMoney(n.amount || 0)}</div>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          {n.rateType} ·{" "}
                          {n.locationName || n.locationId || "All locations"}
                        </div>
                        <div className="mt-2 text-right">
                          <RoleGuard allow={["owner", "super_admin"]}>
                            <button
                              className="text-blue-600 dark:text-blue-400 underline text-sm"
                              onClick={() => handleOpenEditRate(r)}
                            >
                              Edit
                            </button>
                          </RoleGuard>
                        </div>
                      </div>
                    );
                  })
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

      {rateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setRateModalOpen(false)}
          />
          <div className="relative w-[560px] max-w-[96vw] rounded-lg bg-white dark:bg-zinc-800 shadow-elev-2 p-4">
            <div className="text-lg font-medium mb-2">
              {editingRate?.id ? "Edit Rate" : "Add Rate"}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Rate Type
                </label>
                <select
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                  value={form.rateType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rateType: e.target.value as any }))
                  }
                >
                  <option value="per_visit">per_visit (piece-rate)</option>
                  <option value="hourly">hourly</option>
                  <option value="monthly">monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Effective Date
                </label>
                <input
                  type="date"
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                  value={form.effectiveDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, effectiveDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Location ID (optional)
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                  value={form.locationId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, locationId: e.target.value }))
                  }
                  placeholder="locationId (leave blank for all)"
                />
              </div>
            </div>
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded mt-3 p-2">
              Per job/visit rate (piece-rate) — not hourly
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                onClick={() => setRateModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSaveRate}
                disabled={!form.amount || !form.effectiveDate || !id}
              >
                Save
              </button>
            </div>
          </div>
        </div>
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

function normalizeEffectiveDate(r: any): Date | null {
  try {
    const ts = r?.effectiveDate || r?.createdAt;
    if (!ts) return null;
    return ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts);
  } catch {
    return null;
  }
}

function normalizeRate(raw: any): RateDoc {
  const rateType =
    (raw?.rateType as any) ||
    (raw?.hourlyRate != null ? "hourly" : undefined) ||
    "per_visit";
  const amount =
    (typeof raw?.amount === "number" ? raw.amount : null) ??
    (typeof raw?.hourlyRate === "number" ? raw.hourlyRate : null) ??
    (typeof raw?.rate === "number" ? raw.rate : null) ??
    0;
  return {
    id: raw?.id,
    employeeId: raw?.employeeId,
    employeeProfileId: raw?.employeeProfileId,
    rateType,
    amount,
    effectiveDate: raw?.effectiveDate || raw?.createdAt,
    locationId: raw?.locationId || null,
    locationName: raw?.locationName || null,
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  } as RateDoc;
}

function formatMoney(v: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    }).format(v);
  } catch {
    return `$${Number(v || 0).toFixed(2)}`;
  }
}
