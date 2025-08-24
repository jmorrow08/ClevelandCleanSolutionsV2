import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";

export default function EditItemModal({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: any;
  onClose: () => void;
  onSaved?: (updated: any) => void;
}) {
  const { show } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");

  useEffect(() => {
    if (!open || !item) return;
    setName(item.name || "");
    setSku(item.sku || "");
    setUnit(item.unit || "");
    setUnitCost(item.unitCost != null ? String(item.unitCost) : "");
    setVendor(item.vendor || "");
    setReorderPoint(item.reorderPoint != null ? String(item.reorderPoint) : "");
  }, [open, item]);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !saving && onClose()}
      />
      <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
        <div className="text-lg font-medium">Edit Item</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Name</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">SKU</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Unit</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Unit Cost (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Vendor</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Reorder Point</label>
              <input
                type="number"
                min="0"
                step="1"
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
              />
            </div>
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
              const n = name.trim();
              const cost = Number(unitCost);
              const rp = reorderPoint ? Number(reorderPoint) : undefined;
              if (!n || !Number.isFinite(cost) || cost < 0) {
                show({
                  type: "error",
                  message: "Provide name and valid unit cost.",
                });
                return;
              }
              try {
                setSaving(true);
                if (!getApps().length) initializeApp(firebaseConfig);
                const db = getFirestore();
                await updateDoc(doc(db, "inventoryItems", item.id), {
                  name: n,
                  sku: sku.trim() || null,
                  unit: unit.trim() || null,
                  unitCost: cost,
                  reorderPoint: Number.isFinite(rp!) ? rp : null,
                  vendor: vendor.trim() || null,
                  updatedAt: serverTimestamp(),
                });
                const updated = {
                  ...item,
                  name: n,
                  sku: sku.trim() || null,
                  unit: unit.trim() || null,
                  unitCost: cost,
                  reorderPoint: Number.isFinite(rp!) ? rp : null,
                  vendor: vendor.trim() || null,
                };
                onSaved?.(updated);
                show({ type: "success", message: "Item updated." });
              } catch (e: any) {
                show({
                  type: "error",
                  message: e?.message || "Failed to update item",
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
