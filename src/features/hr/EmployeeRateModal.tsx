import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";

type Location = {
  id: string;
  locationName: string;
};

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

type RateForm = {
  employeeId: string;
  rateType: "per_visit" | "hourly" | "monthly";
  amount: string;
  effectiveDate: string;
  locationId: string;
  monthlyPayDay: string;
};

type Employee = {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
};

type EmployeeRateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  employeeId?: string;
  employees?: Employee[];
  editingRate?: RateDoc | null;
  onSave?: () => void;
};

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

export default function EmployeeRateModal({
  isOpen,
  onClose,
  employeeId,
  employees = [],
  editingRate,
  onSave,
}: EmployeeRateModalProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState<RateForm>({
    employeeId: "",
    rateType: "per_visit",
    amount: "",
    effectiveDate: "",
    locationId: "",
    monthlyPayDay: "1",
  });
  const [saving, setSaving] = useState(false);

  // Load locations when modal opens
  useEffect(() => {
    if (!isOpen) return;

    async function loadLocations() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const locationsSnap = await getDocs(query(
          collection(db, "locations"),
          where("status", "==", true),
          orderBy("locationName", "asc")
        ));

        const locationsList: Location[] = [];
        locationsSnap.forEach((d) => {
          const data = d.data() as any;
          locationsList.push({
            id: d.id,
            locationName: data.locationName || "Unnamed Location",
          });
        });
        setLocations(locationsList);
      } catch (error) {
        console.error("Error loading locations:", error);
      }
    }

    loadLocations();
  }, [isOpen]);

  // Initialize form when modal opens or editingRate changes
  useEffect(() => {
    if (!isOpen) return;

    if (editingRate) {
      const normalized = normalizeRate(editingRate);
      const eff = normalizeEffectiveDate(normalized);
      setForm({
        employeeId: normalized.employeeId || employeeId || "",
        rateType: (normalized.rateType as any) || "per_visit",
        amount: String(normalized.amount ?? ""),
        effectiveDate: eff
          ? new Date(eff.getTime() - eff.getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 10)
          : "",
        locationId: normalized.locationId || "",
        monthlyPayDay: "1", // Default for now
      });
    } else {
      setForm({
        employeeId: employeeId || "",
        rateType: "per_visit",
        amount: "",
        effectiveDate: "",
        locationId: "",
        monthlyPayDay: "1",
      });
    }
  }, [isOpen, editingRate]);

  const handleSave = async () => {
    const targetEmployeeId = form.employeeId || employeeId;
    if (!targetEmployeeId) {
      alert("Employee is required");
      return;
    }

    const rateType = form.rateType;
    const amountNum = Number(form.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      alert("Invalid amount");
      return;
    }
    if (!form.effectiveDate) {
      alert("Effective date required");
      return;
    }

    const effective = new Date(form.effectiveDate + "T00:00:00");

    setSaving(true);
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();

      const payload: any = {
        employeeId: targetEmployeeId,
        employeeProfileId: targetEmployeeId,
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

      onClose();
      if (onSave) onSave();
    } catch (error) {
      console.error("Error saving rate:", error);
      alert("Failed to save rate");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-800 rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4">
          {editingRate ? "Edit Rate" : "Add Rate"}
        </h3>

        <div className="space-y-4">
          {(!employeeId || employees.length > 0) && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Employee
              </label>
              <select
                className="w-full border rounded-md px-3 py-2 card-bg"
                value={form.employeeId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, employeeId: e.target.value }))
                }
                disabled={!!employeeId}
              >
                <option value="">
                  {employeeId ? "—" : "-- Select Employee --"}
                </option>
                {(employees.length > 0 ? employees : []).map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName ||
                     [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
                     employee.id}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">
              Rate Type
            </label>
            <select
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={form.rateType}
              onChange={(e) =>
                setForm((f) => ({ ...f, rateType: e.target.value as any }))
              }
            >
              <option value="per_visit">Per Visit</option>
              <option value="hourly">Hourly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Amount ($)
            </label>
            <input
              type="number"
              step="0.01"
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={form.amount}
              onChange={(e) =>
                setForm((f) => ({ ...f, amount: e.target.value }))
              }
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
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
            <label className="block text-sm font-medium mb-1">
              Location (optional)
            </label>
            <select
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={form.locationId}
              onChange={(e) =>
                setForm((f) => ({ ...f, locationId: e.target.value }))
              }
            >
              <option value="">All locations</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.locationName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded mt-4 p-2">
          Per job/visit rate (piece-rate) — not hourly
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-md border card-bg"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSave}
            disabled={saving || !form.employeeId || !form.amount || !form.effectiveDate}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
