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
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";
import EmployeeRateModal from "./EmployeeRateModal";

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

type Location = {
  id: string;
  locationName: string;
};

export default function EmployeeRatesOverview() {
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<RateDoc[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<
    "all" | "per_visit" | "hourly" | "monthly"
  >("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RateDoc | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");

  const handleAddRate = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setEditing(null);
    setModalOpen(true);
  };

  const handleEditRate = (rate: RateDoc) => {
    setSelectedEmployeeId(rate.employeeId || "");
    setEditing(rate);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditing(null);
    setSelectedEmployeeId("");
  };

  const handleRateSaved = async () => {
    // Refresh the rates list
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const [ratesSnap, employeesSnap, locationsSnap] = await Promise.all([
        getDocs(collection(db, "employeeRates")),
        getDocs(collection(db, "employeeMasterList")),
        getDocs(query(
          collection(db, "locations"),
          where("status", "==", true),
          orderBy("locationName", "asc")
        )),
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

      const locationsList: Location[] = [];
      locationsSnap.forEach((d) => {
        const data = d.data() as any;
        locationsList.push({
          id: d.id,
          locationName: data.locationName || "Unnamed Location",
        });
      });

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
      setLocations(locationsList);
      setRates(list);
    } catch (error) {
      console.error("Error refreshing rates:", error);
    }
  };

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const [ratesSnap, employeesSnap, locationsSnap] = await Promise.all([
          getDocs(collection(db, "employeeRates")),
          getDocs(collection(db, "employeeMasterList")),
          getDocs(query(
            collection(db, "locations"),
            where("status", "==", true),
            orderBy("locationName", "asc")
          )),
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

        const locationsList: Location[] = [];
        locationsSnap.forEach((d) => {
          const data = d.data() as any;
          locationsList.push({
            id: d.id,
            locationName: data.locationName || "Unnamed Location",
          });
        });
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
        setLocations(locationsList);
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
            onClick={() => {
              setSelectedEmployeeId("");
              setEditing(null);
              setModalOpen(true);
            }}
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
                        onClick={() => handleEditRate(r)}
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

      <EmployeeRateModal
        isOpen={modalOpen}
        onClose={handleModalClose}
        employeeId={selectedEmployeeId || undefined}
        employees={employees}
        editingRate={editing}
        onSave={handleRateSaved}
      />
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
