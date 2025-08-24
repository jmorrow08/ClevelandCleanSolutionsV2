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

export default function RestockModal({
  open,
  item,
  onClose,
  onRestocked,
}: {
  open: boolean;
  item: any;
  onClose: () => void;
  onRestocked?: (updated: any) => void;
}) {
  const { show } = useToast();
  const { user } = useAuth();
  const [qty, setQty] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [vendor, setVendor] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setQty("");
    setCostPerUnit(item.unitCost != null ? String(item.unitCost) : "");
    setVendor(item.vendor || "");
  }, [open, item]);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !saving && onClose()}
      />
      <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
        <div className="text-lg font-medium">Restock {item.name}</div>
        <div className="mt-3 space-y-3">
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
          <div>
            <label className="block text-sm mb-1">Cost Per Unit (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={costPerUnit}
              onChange={(e) => setCostPerUnit(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Vendor</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </div>
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
              const cpu = Number(costPerUnit);
              if (
                !Number.isFinite(q) ||
                q <= 0 ||
                !Number.isFinite(cpu) ||
                cpu < 0
              ) {
                show({
                  type: "error",
                  message: "Provide quantity and valid cost per unit.",
                });
                return;
              }
              try {
                setSaving(true);
                if (!getApps().length) initializeApp(firebaseConfig);
                const db = getFirestore();
                const itemRef = doc(db, "inventoryItems", item.id);
                await runTransaction(db, async (tx) => {
                  const now = serverTimestamp();
                  const newQty = Number(item.stockQty || 0) + q;
                  tx.update(itemRef, {
                    stockQty: newQty,
                    unitCost: cpu,
                    vendor: vendor || null,
                    updatedAt: now,
                  });
                });
                await addDoc(collection(db, "inventoryTransactions"), {
                  itemId: item.id,
                  type: "purchase",
                  qty: q,
                  costPerUnit: cpu,
                  vendor: vendor || null,
                  createdAt: serverTimestamp(),
                  createdBy: user?.uid || null,
                } as any);
                // Mirror into expenses
                try {
                  const total = q * cpu;
                  await addDoc(collection(db, "expenses"), {
                    vendor: vendor || item.vendor || "Inventory",
                    category: "Supplies",
                    amount: total,
                    paidAt: serverTimestamp(),
                    memo: `Inventory purchase: ${item.name} x${q} @ $${cpu}`,
                    createdAt: serverTimestamp(),
                  });
                } catch {}
                onRestocked?.({
                  ...item,
                  stockQty: Number(item.stockQty || 0) + q,
                  unitCost: cpu,
                  vendor: vendor || null,
                });
                show({
                  type: "success",
                  message: "Stock updated and purchase recorded.",
                });
              } catch (e: any) {
                show({
                  type: "error",
                  message: e?.message || "Failed to restock",
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
