import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";

type Item = {
  id: string;
  name: string;
  sku?: string;
  unit?: string;
  unitCost?: number;
  stockQty?: number;
  reorderPoint?: number;
  vendor?: string;
};

type Txn = {
  id: string;
  type: "purchase" | "usage" | "return" | "adjustment" | string;
  qty: number;
  costPerUnit?: number;
  linkedInvoiceId?: string | null;
  linkedJobId?: string | null;
  createdAt?: any;
  createdBy?: string | null;
};

function formatDate(ts?: any) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : undefined;
  return d ? d.toLocaleString() : "—";
}

export default function InventoryDetail() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<Item | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);

  useEffect(() => {
    if (!id) return;
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    (async () => {
      const snap = await getDoc(doc(db, "inventoryItems", id));
      if (snap.exists()) setItem({ id: snap.id, ...(snap.data() as any) });
      setLoading(false);
    })();
    const qref = query(
      collection(db, "inventoryTransactions"),
      where("itemId", "==", id),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(qref, (snap) => {
      const list: Txn[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setTxns(list);
    });
    return () => unsub();
  }, [id]);

  const totals = useMemo(() => {
    const purchases = txns
      .filter((t) => t.type === "purchase")
      .reduce((s, t) => s + (Number(t.qty || 0) || 0), 0);
    const usage = txns
      .filter((t) => t.type === "usage")
      .reduce((s, t) => s + (Number(t.qty || 0) || 0), 0);
    return { purchases, usage };
  }, [txns]);

  if (!id) return <div className="text-sm text-zinc-500">Missing item id.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-xs text-zinc-500">
            <Link to="/inventory" className="hover:underline">
              Inventory
            </Link>{" "}
            / {item?.name || "…"}
          </div>
          <h1 className="text-2xl font-semibold">{item?.name || "Loading…"}</h1>
        </div>
      </div>

      {loading && !item ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : !item ? (
        <div className="text-sm text-zinc-500">Item not found.</div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-lg card-bg shadow-elev-1 p-4">
            <div className="text-sm text-zinc-500">Stock Summary</div>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <div>SKU</div>
                <div className="text-zinc-500">{item.sku || "—"}</div>
              </div>
              <div className="flex items-center justify-between">
                <div>Unit</div>
                <div className="text-zinc-500">{item.unit || "—"}</div>
              </div>
              <div className="flex items-center justify-between">
                <div>Unit Cost</div>
                <div className="text-zinc-500">
                  ${Number(item.unitCost || 0).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>Vendor</div>
                <div className="text-zinc-500">{item.vendor || "—"}</div>
              </div>
              <div className="flex items-center justify-between">
                <div>Stock Qty</div>
                <div className="text-zinc-500">
                  {Number(item.stockQty || 0).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>Reorder Point</div>
                <div className="text-zinc-500">{item.reorderPoint ?? "—"}</div>
              </div>
              <div className="flex items-center justify-between">
                <div>Purchased</div>
                <div className="text-zinc-500">{totals.purchases}</div>
              </div>
              <div className="flex items-center justify-between">
                <div>Used</div>
                <div className="text-zinc-500">{totals.usage}</div>
              </div>
            </div>
          </div>
          <div className="md:col-span-2 rounded-lg card-bg shadow-elev-1 p-0 overflow-hidden">
            <div className="px-4 py-3 text-sm text-zinc-500 border-b border-zinc-200 dark:border-zinc-700">
              Recent Transactions
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Cost/Unit</th>
                    <th className="px-3 py-2">Linked Invoice</th>
                    <th className="px-3 py-2">Linked Job</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-zinc-500" colSpan={6}>
                        No transactions.
                      </td>
                    </tr>
                  ) : (
                    txns.map((t) => (
                      <tr
                        key={t.id}
                        className="border-t border-zinc-100 dark:border-zinc-700"
                      >
                        <td className="px-3 py-2">{t.type}</td>
                        <td className="px-3 py-2">{t.qty}</td>
                        <td className="px-3 py-2">
                          {t.costPerUnit != null
                            ? `$${Number(t.costPerUnit).toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {t.linkedInvoiceId || "—"}
                        </td>
                        <td className="px-3 py-2">{t.linkedJobId || "—"}</td>
                        <td className="px-3 py-2">{formatDate(t.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
