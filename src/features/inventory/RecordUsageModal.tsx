import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  runTransaction,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

export default function RecordUsageModal({
  open,
  item,
  onClose,
  onUsed,
}: {
  open: boolean;
  item: any;
  onClose: () => void;
  onUsed?: (updated: any) => void;
}) {
  const { show } = useToast();
  const { user } = useAuth();
  const [qty, setQty] = useState("");
  const [clientResponsible, setClientResponsible] = useState(false);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState("");
  const [linkedJobId, setLinkedJobId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setQty("");
    setClientResponsible(false);
    setLinkedInvoiceId("");
    setLinkedJobId("");
  }, [open, item]);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !saving && onClose()}
      />
      <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
        <div className="text-lg font-medium">Record Usage - {item.name}</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Quantity Used</label>
            <input
              type="number"
              min="1"
              step="1"
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="cr"
              type="checkbox"
              checked={clientResponsible}
              onChange={(e) => setClientResponsible(e.target.checked)}
            />
            <label htmlFor="cr" className="text-sm">
              Client responsible (add to invoice)
            </label>
          </div>
          {clientResponsible && (
            <div className="space-y-2">
              <div>
                <label className="block text-sm mb-1">Linked Invoice ID</label>
                <input
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={linkedInvoiceId}
                  onChange={(e) => setLinkedInvoiceId(e.target.value)}
                  placeholder="invoice doc id"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">
                  Linked Job ID (optional)
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={linkedJobId}
                  onChange={(e) => setLinkedJobId(e.target.value)}
                  placeholder="service job id"
                />
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
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
              const q = Number(qty);
              if (!Number.isFinite(q) || q <= 0) {
                show({ type: "error", message: "Provide quantity used." });
                return;
              }
              if (q > Number(item.stockQty || 0)) {
                show({ type: "error", message: "Insufficient stock." });
                return;
              }
              try {
                setSaving(true);
                if (!getApps().length) initializeApp(firebaseConfig);
                const db = getFirestore();
                const itemRef = doc(db, "inventoryItems", item.id);
                await runTransaction(db, async (tx) => {
                  const newQty = Number(item.stockQty || 0) - q;
                  tx.update(itemRef, {
                    stockQty: newQty,
                    updatedAt: serverTimestamp(),
                  });
                });
                const txDoc = await addDoc(
                  collection(db, "inventoryTransactions"),
                  {
                    itemId: item.id,
                    type: "usage",
                    qty: q,
                    costPerUnit: item.unitCost || null,
                    linkedInvoiceId:
                      clientResponsible && linkedInvoiceId
                        ? linkedInvoiceId
                        : null,
                    linkedJobId: linkedJobId || null,
                    createdAt: serverTimestamp(),
                    createdBy: user?.uid || null,
                  } as any
                );
                // If client responsible, attempt to push line into invoice
                if (clientResponsible && linkedInvoiceId) {
                  try {
                    await addDoc(
                      collection(db, `invoices/${linkedInvoiceId}/lineItems`),
                      {
                        description: `${item.name} (${
                          item.unit || "unit"
                        }) x${q}`,
                        qty: q,
                        rate: item.unitCost || 0,
                        amount: q * (item.unitCost || 0),
                        source: {
                          type: "inventory",
                          itemId: item.id,
                          inventoryTransactionId: txDoc.id,
                        },
                        createdAt: serverTimestamp(),
                      }
                    );
                  } catch {}
                }
                onUsed?.({ ...item, stockQty: Number(item.stockQty || 0) - q });
                show({ type: "success", message: "Usage recorded." });
              } catch (e: any) {
                show({
                  type: "error",
                  message: e?.message || "Failed to record usage",
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
  );
}
