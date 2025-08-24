import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  updateDoc,
  Timestamp,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import AddSupplyModal from "./AddSupplyModal";

export type InvoiceRecord = {
  id: string;
  status?: "pending" | "paid" | "void" | string;
  dueDate?: any;
  amount?: number;
  memo?: string;
};

function toInputDateValue(value?: any): string {
  const d = value?.toDate
    ? value.toDate()
    : value instanceof Date
    ? value
    : undefined;
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function coerceAmountString(n?: number): string {
  if (n === undefined || n === null) return "";
  const as = Number(n);
  return Number.isFinite(as) ? String(as) : "";
}

export default function InvoiceEditModal({
  open,
  invoice,
  onClose,
  onSaved,
}: {
  open: boolean;
  invoice: InvoiceRecord | null;
  onClose: () => void;
  onSaved?: (updated: InvoiceRecord) => void;
}) {
  const { show } = useToast();
  const initial = useMemo(() => invoice, [invoice]);
  const [dueDate, setDueDate] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [status, setStatus] = useState<"pending" | "paid" | "void" | "">("");
  const [saving, setSaving] = useState(false);
  const [showAddSupply, setShowAddSupply] = useState(false);

  useEffect(() => {
    if (!open || !initial) return;
    setDueDate(toInputDateValue(initial.dueDate));
    setAmount(coerceAmountString(initial.amount));
    setMemo(initial.memo || "");
    setStatus((initial.status as any) || "pending");
  }, [open, initial]);

  if (!open || !invoice) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !saving && onClose()}
      />
      <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
        <div className="text-lg font-medium">Edit Invoice</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Due Date</label>
            <input
              type="date"
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Amount (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Memo</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Status</label>
            <select
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="pending">pending</option>
              <option value="paid">paid</option>
              <option value="void">void</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
            onClick={() => setShowAddSupply(true)}
            disabled={saving}
          >
            + Add Supply
          </button>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
              onClick={() => onClose()}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className={`px-3 py-1.5 rounded-md text-white ${
                saving ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
              }`}
              onClick={async () => {
                const amt = Number(amount);
                if (!dueDate || !Number.isFinite(amt) || amt < 0) {
                  show({
                    type: "error",
                    message: "Provide a due date and valid amount.",
                  });
                  return;
                }
                try {
                  setSaving(true);
                  if (!getApps().length) initializeApp(firebaseConfig);
                  const db = getFirestore();
                  const dueTs = Timestamp.fromDate(
                    new Date(`${dueDate}T00:00:00`)
                  );
                  await updateDoc(doc(db, "invoices", invoice.id), {
                    dueDate: dueTs,
                    amount: amt,
                    memo: memo || "",
                    status: status || "pending",
                  });
                  const updated: InvoiceRecord = {
                    ...invoice,
                    dueDate: dueTs,
                    amount: amt,
                    memo: memo || "",
                    status: status || "pending",
                  };
                  show({ type: "success", message: "Invoice updated." });
                  onSaved?.(updated);
                  onClose();
                } catch (e: any) {
                  show({
                    type: "error",
                    message: e?.message || "Failed to update invoice",
                  });
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
      {showAddSupply && (
        <AddSupplyModal
          open={showAddSupply}
          invoiceId={invoice.id}
          onClose={() => setShowAddSupply(false)}
          onAdded={async (payload) => {
            try {
              if (!getApps().length) initializeApp(firebaseConfig);
              const db = getFirestore();
              await addDoc(collection(db, `invoices/${invoice.id}/lineItems`), {
                description: payload.description,
                qty: payload.qty,
                rate: payload.rate,
                amount: payload.qty * payload.rate,
                source: {
                  type: "inventory",
                  itemId: payload.itemId,
                  inventoryTransactionId:
                    payload.inventoryTransactionId || null,
                },
                createdAt: serverTimestamp(),
              });
              // optimistic: nothing else to do; total recompute is out of scope
              show({ type: "success", message: "Supply added to invoice." });
            } catch (e: any) {
              show({
                type: "error",
                message: e?.message || "Failed to add supply",
              });
            }
          }}
        />
      )}
    </div>
  );
}
