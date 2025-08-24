import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  runTransaction,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

type Item = {
  id: string;
  name: string;
  unit?: string;
  unitCost?: number;
  stockQty?: number;
};

export default function AddSupplyModal({
  open,
  invoiceId,
  onClose,
  onAdded,
}: {
  open: boolean;
  invoiceId: string;
  onClose: () => void;
  onAdded?: (payload: {
    itemId: string;
    description: string;
    qty: number;
    rate: number;
    inventoryTransactionId?: string;
  }) => void;
}) {
  const { user } = useAuth();
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [qty, setQty] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    const qref = query(
      collection(db, "inventoryItems"),
      orderBy("name", "asc")
    );
    const unsub = onSnapshot(
      qref,
      (snap) => {
        const list: Item[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setItems(list);
        setLoading(false);
      },
      () => {
        setItems([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [open]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) || null,
    [items, selectedId]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !saving && onClose()}
      />
      <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
        <div className="text-lg font-medium">Add Supply to Invoice</div>
        <div className="mt-3 space-y-3">
          {loading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : (
            <>
              <div>
                <label className="block text-sm mb-1">Item</label>
                <select
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  <option value="">Select an item…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} — {i.stockQty ?? 0} in stock @ $
                      {Number(i.unitCost || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              {!!selected && (
                <div className="text-xs text-zinc-500">
                  Unit: {selected.unit || "unit"} • Rate: $
                  {Number(selected.unitCost || 0).toLocaleString()} • Stock:{" "}
                  {selected.stockQty ?? 0}
                </div>
              )}
            </>
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
              if (!selected || !Number.isFinite(q) || q <= 0) {
                show({ type: "error", message: "Select item and quantity." });
                return;
              }
              if (q > Number(selected.stockQty || 0)) {
                show({ type: "error", message: "Insufficient stock." });
                return;
              }
              try {
                setSaving(true);
                if (!getApps().length) initializeApp(firebaseConfig);
                const db = getFirestore();
                // Decrement stock and create usage transaction linked to invoice
                let txId = "";
                await runTransaction(db, async (tx) => {
                  const ref = doc(db, "inventoryItems", selected.id);
                  const newQty = Number(selected.stockQty || 0) - q;
                  tx.update(ref, {
                    stockQty: newQty,
                    updatedAt: serverTimestamp(),
                  });
                });
                const usageDoc = await addDoc(
                  collection(db, "inventoryTransactions"),
                  {
                    itemId: selected.id,
                    type: "usage",
                    qty: q,
                    costPerUnit: selected.unitCost || 0,
                    linkedInvoiceId: invoiceId,
                    createdAt: serverTimestamp(),
                    createdBy: user?.uid || null,
                  } as any
                );
                txId = usageDoc.id;
                onAdded?.({
                  itemId: selected.id,
                  description: `${selected.name} (${
                    selected.unit || "unit"
                  }) x${q}`,
                  qty: q,
                  rate: selected.unitCost || 0,
                  inventoryTransactionId: txId,
                });
                onClose();
              } catch (e: any) {
                show({
                  type: "error",
                  message: e?.message || "Failed to add supply",
                });
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
          >
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
