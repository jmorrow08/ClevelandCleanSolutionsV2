import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";

export type AgreementDoc = {
  id?: string;
  clientId: string;
  frequency?: string;
  includedServices?: string[];
  specialInstructions?: string;
  paymentAmount?: number;
  paymentFrequency?: string;
  contractStartDate?: any;
  contractEndDate?: any;
  renewalTerms?: string;
  serviceAgreementUrl?: string;
  isActive?: boolean;
};

export function ServiceAgreementModal({
  clientId,
  agreementId,
  mode,
  onClose,
  onSaved,
  onDeleted,
}: {
  clientId: string;
  agreementId?: string | null;
  mode: "create" | "edit" | "view";
  onClose: () => void;
  onSaved?: (doc: AgreementDoc) => void;
  onDeleted?: (id: string) => void;
}) {
  const [loading, setLoading] = useState(mode !== "create");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AgreementDoc>({
    clientId,
    frequency: "monthly",
    includedServices: [],
    specialInstructions: "",
    paymentAmount: undefined,
    paymentFrequency: "monthly",
    contractStartDate: undefined,
    contractEndDate: undefined,
    renewalTerms: "auto-renew",
    serviceAgreementUrl: "",
    isActive: true,
  });

  const readOnly = mode === "view";

  useEffect(() => {
    (async () => {
      if (mode === "create" || !agreementId) return;
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const snap = await getDoc(doc(db, "serviceAgreements", agreementId));
        if (snap.exists()) {
          const d = snap.data() as any;
          setForm({ id: snap.id, ...(d as any) });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [agreementId, mode]);

  async function save() {
    try {
      setSaving(true);
      setError(null);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const payload: any = {
        ...form,
        clientId,
        updatedAt: serverTimestamp(),
      };
      if (mode === "create") {
        payload.createdAt = serverTimestamp();
        const ref = await addDoc(collection(db, "serviceAgreements"), payload);
        const saved = { ...form, id: ref.id } as AgreementDoc;
        onSaved && onSaved(saved);
      } else if (form.id) {
        await setDoc(doc(db, "serviceAgreements", form.id), payload, {
          merge: true,
        });
        onSaved && onSaved(form);
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form.id) return;
    if (!confirm("Delete this agreement? This cannot be undone.")) return;
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      await deleteDoc(doc(db, "serviceAgreements", form.id));
      onDeleted && onDeleted(form.id);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to delete");
    }
  }

  function update<K extends keyof AgreementDoc>(
    key: K,
    value: AgreementDoc[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-elev-2 max-w-2xl w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">
            {mode === "create" ? "New" : readOnly ? "View" : "Edit"} Service
            Agreement
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 text-sm rounded-md border"
              onClick={onClose}
            >
              Close
            </button>
            {mode !== "view" && (
              <button
                className="px-3 py-1.5 text-sm rounded-md border bg-blue-600 text-white disabled:opacity-60"
                disabled={saving}
                onClick={save}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
            {form.id && (
              <RoleGuard allow={["super_admin"]}>
                <button
                  className="px-3 py-1.5 text-sm rounded-md border bg-red-600 text-white"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              </RoleGuard>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-500 mt-2">Loading…</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <LabeledInput
              label="Frequency"
              value={form.frequency || ""}
              readOnly={readOnly}
              onChange={(v) => update("frequency", v)}
            />
            <LabeledInput
              label="Payment Amount"
              type="number"
              value={String(form.paymentAmount ?? "")}
              readOnly={readOnly}
              onChange={(v) => update("paymentAmount", Number(v))}
            />
            <LabeledInput
              label="Payment Frequency"
              value={form.paymentFrequency || ""}
              readOnly={readOnly}
              onChange={(v) => update("paymentFrequency", v)}
            />
            <LabeledInput
              label="Contract Start (YYYY-MM-DD)"
              value={toDateInput(form.contractStartDate)}
              readOnly={readOnly}
              onChange={(v) => update("contractStartDate", fromDateInput(v))}
            />
            <LabeledInput
              label="Contract End (YYYY-MM-DD)"
              value={toDateInput(form.contractEndDate)}
              readOnly={readOnly}
              onChange={(v) => update("contractEndDate", fromDateInput(v))}
            />
            <LabeledInput
              label="Renewal Terms"
              value={form.renewalTerms || ""}
              readOnly={readOnly}
              onChange={(v) => update("renewalTerms", v)}
            />
            <LabeledInput
              label="Contract URL"
              value={form.serviceAgreementUrl || ""}
              readOnly={readOnly}
              onChange={(v) => update("serviceAgreementUrl", v)}
            />
            <LabeledTextarea
              label="Included Services (comma separated)"
              value={(form.includedServices || []).join(", ")}
              readOnly={readOnly}
              onChange={(v) =>
                update(
                  "includedServices",
                  v
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
            />
            <LabeledTextarea
              label="Special Instructions"
              value={form.specialInstructions || ""}
              readOnly={readOnly}
              onChange={(v) => update("specialInstructions", v)}
            />
            <div className="flex items-center gap-2">
              <input
                id="isActive"
                type="checkbox"
                checked={!!form.isActive}
                disabled={readOnly}
                onChange={(e) => update("isActive", e.target.checked)}
              />
              <label htmlFor="isActive">Active</label>
            </div>

            {error ? (
              <div className="md:col-span-2 text-red-600">{error}</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  readOnly,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      <input
        type={type}
        className="w-full rounded-md border bg-transparent p-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
      />
    </div>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="md:col-span-2">
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      <textarea
        className="w-full rounded-md border bg-transparent p-2 text-sm"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
      />
    </div>
  );
}

function toDateInput(ts: any): string {
  try {
    const d: Date | null = ts?.toDate
      ? ts.toDate()
      : ts instanceof Date
      ? ts
      : null;
    if (!d) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function fromDateInput(s: string): any {
  if (!s) return undefined;
  const dt = new Date(s + "T00:00:00");
  // Let Firestore convert via serverTimestamp on write if needed; here we return a JS Date
  return dt;
}
