import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";

type RawRate = any;
type RateDoc = {
  id?: string;
  employeeId?: string;
  employeeProfileId?: string;
  employeeName?: string;
  rateType: "per_visit" | "hourly" | "monthly";
  amount: number;
  effectiveDate?: any;
  locationId?: string | null;
  locationName?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

type Employee = {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
};

export default function EmployeeRatesOverview() {
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<RateDoc[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<
    "all" | "per_visit" | "hourly" | "monthly"
  >("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RateDoc | null>(null);
  const [form, setForm] = useState<{
    employeeId: string;
    rateType: "per_visit" | "hourly" | "monthly";
    amount: string;
    effectiveDate: string;
    locationId: string;
    monthlyPayDay: string;
  }>({
    employeeId: "",
    rateType: "per_visit",
    amount: "",
    effectiveDate: "",
    locationId: "",
    monthlyPayDay: "1",
  });

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const [ratesSnap, employeesSnap] = await Promise.all([
          getDocs(collection(db, "employeeRates")),
          getDocs(collection(db, "employeeMasterList")),
        ]);
        const employeeList: Employee[] = [];
        employeesSnap.forEach((d) =>
          employeeList.push({ id: d.id, ...(d.data() as any) })
        );
        const employeeNameMap = new Map<string, string>();
        for (const e of employeeList) {
          const name =
            e.fullName ||
            [e.firstName, e.lastName].filter(Boolean).join(" ") ||
            e.id;
          employeeNameMap.set(e.id, name);
        }
        const list: RateDoc[] = [];
        ratesSnap.forEach((d) => {
          const raw = { id: d.id, ...(d.data() as any) };
          const norm = normalizeRate(raw);
          const eid = norm.employeeId || norm.employeeProfileId || "";
          const employeeName =
            raw.employeeName || employeeNameMap.get(eid) || eid || "";
          list.push({ ...norm, id: d.id, employeeName });
        });
        list.sort(
          (a, b) =>
            (normalizeEffectiveDate(b)?.getTime?.() || 0) -
            (normalizeEffectiveDate(a)?.getTime?.() || 0)
        );
        setEmployees(employeeList);
        setRates(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rates.filter((r) => {
      const matchesType =
        filterType === "all" ? true : r.rateType === filterType;
      const target = `${r.employeeName || ""} ${
        r.locationName || r.locationId || ""
      }`.toLowerCase();
      const matchesSearch = q ? target.includes(q) : true;
      return matchesType && matchesSearch;
    });
  }, [rates, search, filterType]);

  function openAdd() {
    setEditing(null);
    setForm({
      employeeId: "",
      rateType: "per_visit",
      amount: "",
      effectiveDate: "",
      locationId: "",
      monthlyPayDay: "1",
    });
    setModalOpen(true);
  }

  function openEdit(r: RateDoc) {
    setEditing(r);
    const eff = normalizeEffectiveDate(r);
    setForm({
      employeeId: r.employeeId || r.employeeProfileId || "",
      rateType: r.rateType,
      amount: String(r.amount ?? ""),
      effectiveDate: eff
        ? new Date(eff.getTime() - eff.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 10)
        : "",
      locationId: r.locationId || "",
      monthlyPayDay: String((r as any).monthlyPayDay || "1"),
    });
    setModalOpen(true);
  }

  async function save() {
    const selectedEmployeeId = form.employeeId.trim();
    if (!selectedEmployeeId) return alert("Select employee");
    const amountNum = Number(form.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0)
      return alert("Invalid amount");
    if (!form.effectiveDate) return alert("Effective date required");
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();

    const payload: any = {
      employeeId: selectedEmployeeId,
      employeeProfileId: selectedEmployeeId,
      rateType: form.rateType,
      amount: amountNum,
      effectiveDate: new Date(form.effectiveDate + "T00:00:00"),
      locationId: form.locationId?.trim() ? form.locationId.trim() : null,
      updatedAt: serverTimestamp(),
    };
    if (form.rateType === "hourly") payload.hourlyRate = amountNum;
    if (form.rateType === "per_visit") payload.rate = amountNum;
    if (form.rateType === "monthly") {
      payload.monthlyRate = amountNum;
      payload.monthlyPayDay = Number(form.monthlyPayDay) || 1;
    }

    const employeeName = employees.find((e) => e.id === selectedEmployeeId);
    if (employeeName) {
      payload.employeeName =
        employeeName.fullName ||
        [employeeName.firstName, employeeName.lastName]
          .filter(Boolean)
          .join(" ") ||
        employeeName.id;
    }

    if (editing?.id)
      await updateDoc(doc(db, "employeeRates", editing.id), payload);
    else
      await addDoc(collection(db, "employeeRates"), {
        ...payload,
        createdAt: serverTimestamp(),
      });

    // Refresh list
    const snap = await getDocs(collection(db, "employeeRates"));
    const list: RateDoc[] = [];
    snap.forEach((d) =>
      list.push(normalizeRate({ id: d.id, ...(d.data() as any) }))
    );
    list.sort(
      (a, b) =>
        (normalizeEffectiveDate(b)?.getTime?.() || 0) -
        (normalizeEffectiveDate(a)?.getTime?.() || 0)
    );
    setRates(list);
    setModalOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Search</label>
          <input
            className="w-full border rounded-md px-3 py-2 card-bg"
            placeholder="Search by employee or location"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-48">
          <label className="block text-xs text-zinc-500 mb-1">Type</label>
          <select
            className="w-full border rounded-md px-3 py-2 card-bg"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
          >
            <option value="all">all</option>
            <option value="per_visit">per_visit</option>
            <option value="hourly">hourly</option>
            <option value="monthly">monthly</option>
          </select>
        </div>
        <RoleGuard allow={["owner", "super_admin"]}>
          <button
            className="h-10 px-3 rounded-md border card-bg"
            onClick={openAdd}
          >
            Add Rate
          </button>
        </RoleGuard>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-xs">
        Per job/visit rate (piece-rate) — not hourly
      </div>

      <div className="overflow-x-auto rounded-lg card-bg shadow-elev-1">
        <table className="min-w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Effective</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500" colSpan={6}>
                  No rates.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-zinc-100 dark:border-zinc-700"
                >
                  <td className="px-3 py-2">
                    {r.employeeName || r.employeeId || r.employeeProfileId}
                  </td>
                  <td className="px-3 py-2">{r.rateType}</td>
                  <td className="px-3 py-2">{formatMoney(r.amount || 0)}</td>
                  <td className="px-3 py-2">{formatDate(r.effectiveDate)}</td>
                  <td className="px-3 py-2">
                    {r.locationName || r.locationId || "All"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RoleGuard allow={["owner", "super_admin"]}>
                      <button
                        className="text-blue-600 dark:text-blue-400 underline"
                        onClick={() => openEdit(r)}
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

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative w-[640px] max-w-[96vw] rounded-lg card-bg shadow-elev-2 p-4">
            <div className="text-lg font-medium mb-2">
              {editing?.id ? "Edit Rate" : "Add Rate"}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-zinc-500 mb-1">
                  Employee
                </label>
                <select
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={form.employeeId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, employeeId: e.target.value }))
                  }
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName ||
                        [e.firstName, e.lastName].filter(Boolean).join(" ") ||
                        e.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Rate Type
                </label>
                <select
                  className="w-full border rounded-md px-3 py-2 card-bg"
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
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
              {form.rateType === "monthly" && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Monthly Pay Day
                  </label>
                  <select
                    className="w-full border rounded-md px-3 py-2 card-bg"
                    value={form.monthlyPayDay}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, monthlyPayDay: e.target.value }))
                    }
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={String(day)}>
                        {day}
                        {day === 1
                          ? "st"
                          : day === 2
                          ? "nd"
                          : day === 3
                          ? "rd"
                          : "th"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Effective Date
                </label>
                <input
                  type="date"
                  className="w-full border rounded-md px-3 py-2 card-bg"
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
                  className="w-full border rounded-md px-3 py-2 card-bg"
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
                className="px-3 py-1.5 rounded-md border card-bg"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                onClick={save}
                disabled={
                  !form.employeeId || !form.amount || !form.effectiveDate
                }
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

function normalizeRate(raw: RawRate): RateDoc {
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
    employeeName: raw?.employeeName,
    rateType,
    amount,
    effectiveDate: raw?.effectiveDate || raw?.createdAt,
    locationId: raw?.locationId || null,
    locationName: raw?.locationName || null,
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  } as RateDoc;
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

function formatDate(ts: any): string {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    return d ? d.toLocaleDateString() : "—";
  } catch {
    return "—";
  }
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
