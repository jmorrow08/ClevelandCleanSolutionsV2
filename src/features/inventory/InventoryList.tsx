import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";
import { useAuth } from "../../context/AuthContext";
import NewItemModal from "./NewItemModal";
import EditItemModal from "./EditItemModal";
import RestockModal from "./RestockModal";
import RecordUsageModal from "./RecordUsageModal";

export type InventoryItem = {
  id: string;
  name: string;
  sku?: string;
  unit?: string;
  unitCost?: number;
  stockQty?: number;
  reorderPoint?: number;
  vendor?: string;
  createdAt?: any;
  updatedAt?: any;
};

export default function InventoryList() {
  const navigate = useNavigate();
  const { claims } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [restocking, setRestocking] = useState<InventoryItem | null>(null);
  const [recordingUsage, setRecordingUsage] = useState<InventoryItem | null>(
    null
  );

  useEffect(() => {
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    const qref = query(
      collection(db, "inventoryItems"),
      orderBy("name", "asc")
    );
    const unsub = onSnapshot(
      qref,
      (snap) => {
        const list: InventoryItem[] = [];
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
  }, []);

  const filtered = useMemo(() => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter((it) =>
      [it.name, it.sku, it.vendor]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    );
  }, [items, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <RoleGuard allow={["owner", "super_admin"]}>
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
            onClick={() => setShowNew(true)}
          >
            New Item
          </button>
        </RoleGuard>
      </div>

      <div className="flex items-center gap-2">
        <input
          className="border rounded-md px-3 py-1 bg-white dark:bg-zinc-900 flex-1"
          placeholder="Search by name, SKU, vendor"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="text-sm text-zinc-500">
          {filtered.length} item{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-zinc-500">No items found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Stock</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Unit Cost</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Reorder Pt</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr
                  key={it.id}
                  className="border-t border-zinc-100 dark:border-zinc-700"
                >
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2">{it.sku || "—"}</td>
                  <td
                    className={`px-3 py-2 ${
                      (it.stockQty || 0) <= (it.reorderPoint || -1)
                        ? "text-red-600"
                        : ""
                    }`}
                  >
                    {Number(it.stockQty || 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{it.unit || "—"}</td>
                  <td className="px-3 py-2">
                    ${Number(it.unitCost || 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{it.vendor || "—"}</td>
                  <td className="px-3 py-2">{it.reorderPoint ?? "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      className="px-2 py-1 text-xs rounded-md border"
                      onClick={() => navigate(`/inventory/${it.id}`)}
                    >
                      View
                    </button>
                    <RoleGuard allow={["owner", "super_admin"]}>
                      <button
                        className="ml-2 px-2 py-1 text-xs rounded-md border"
                        onClick={() => setRestocking(it)}
                      >
                        Restock
                      </button>
                      <button
                        className="ml-2 px-2 py-1 text-xs rounded-md border"
                        onClick={() => setRecordingUsage(it)}
                      >
                        Record Usage
                      </button>
                      <button
                        className="ml-2 px-2 py-1 text-xs rounded-md border"
                        onClick={() => setEditing(it)}
                      >
                        Edit Item
                      </button>
                    </RoleGuard>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewItemModal
          open={showNew}
          onClose={() => setShowNew(false)}
          onCreated={(created) => {
            setItems((prev) => [created, ...prev]);
            setShowNew(false);
          }}
        />
      )}

      {!!editing && (
        <EditItemModal
          open={!!editing}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setItems((prev) =>
              prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
            );
            setEditing(null);
          }}
        />
      )}

      {!!restocking && (
        <RestockModal
          open={!!restocking}
          item={restocking}
          onClose={() => setRestocking(null)}
          onRestocked={(updated) => {
            setItems((prev) =>
              prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
            );
            setRestocking(null);
          }}
        />
      )}

      {!!recordingUsage && (
        <RecordUsageModal
          open={!!recordingUsage}
          item={recordingUsage}
          onClose={() => setRecordingUsage(null)}
          onUsed={(updated) => {
            setItems((prev) =>
              prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
            );
            setRecordingUsage(null);
          }}
        />
      )}
    </div>
  );
}
