import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

type Expense = {
  id: string;
  vendor?: string;
  category?: string;
  amount?: number;
  paidAt?: any;
  createdAt?: any;
  memo?: string;
};

export default function ExpensesPage() {
  const { claims, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [active, setActive] = useState<"all" | "inventory">("all");
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{
    vendor: string;
    category: string;
    amount: string;
    paidAt: string; // yyyy-mm-dd
    memo: string;
  }>({
    vendor: "",
    category: "",
    amount: "",
    paidAt: toInputDate(new Date()),
    memo: "",
  });
  const { show } = useToast();

  useEffect(() => {
    const canRead = !!(claims?.owner || claims?.super_admin);
    if (authLoading) return;
    if (!canRead) {
      setExpenses([]);
      setLoading(false);
      return;
    }
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    const qref = query(
      collection(db, "expenses"),
      orderBy("paidAt", "desc"),
      limit(100)
    );
    const unsub = onSnapshot(
      qref,
      (snap) => {
        const list: Expense[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setExpenses(list);
        setLoading(false);
      },
      () => {
        setExpenses([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [claims, authLoading]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-500">Recent expenses</div>
        <RoleGuard allow={["owner", "super_admin"]}>
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
            onClick={() => setShowNew(true)}
          >
            Record Expense
          </button>
        </RoleGuard>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="flex gap-2">
          <button
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              active === "all"
                ? "border-zinc-900 dark:border-zinc-100"
                : "border-transparent text-zinc-500"
            }`}
            onClick={() => setActive("all")}
          >
            All Expenses
          </button>
          <button
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              active === "inventory"
                ? "border-zinc-900 dark:border-zinc-100"
                : "border-transparent text-zinc-500"
            }`}
            onClick={() => setActive("inventory")}
          >
            Inventory Purchases
          </button>
        </nav>
      </div>

      {!(claims?.owner || claims?.super_admin) ? (
        <div className="text-sm text-zinc-500">You do not have access.</div>
      ) : loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : expenses.length === 0 ? (
        <div className="text-sm text-zinc-500">No expenses recorded.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Memo</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(active === "inventory"
                ? expenses.filter(
                    (e) =>
                      (e.category || "").toLowerCase().includes("suppl") ||
                      (e.memo || "")
                        .toLowerCase()
                        .includes("inventory purchase")
                  )
                : expenses
              ).map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-zinc-100 dark:border-zinc-700"
                >
                  <td className="px-3 py-2">{e.vendor || "—"}</td>
                  <td className="px-3 py-2">{e.category || "—"}</td>
                  <td className="px-3 py-2">
                    ${Number(e.amount || 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {formatDate(e.paidAt || e.createdAt)}
                  </td>
                  <td
                    className="px-3 py-2 max-w-[240px] truncate"
                    title={e.memo || ""}
                  >
                    {e.memo || "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RoleGuard allow={["super_admin"]}>
                      <button
                        className="px-2 py-1 text-xs rounded-md bg-red-600/10 text-red-700 dark:text-red-400"
                        onClick={async () => {
                          if (
                            !confirm(
                              "Delete this expense? This cannot be undone."
                            )
                          )
                            return;
                          try {
                            const db = getFirestore();
                            await deleteDoc(doc(db, "expenses", e.id));
                            // Listener will reflect deletion
                            show({
                              type: "success",
                              message: "Expense deleted.",
                            });
                          } catch (err: any) {
                            show({
                              type: "error",
                              message:
                                err?.message || "Failed to delete expense",
                            });
                          }
                        }}
                      >
                        Delete
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !creating && setShowNew(false)}
          />
          <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
            <div className="text-lg font-medium">Record Expense</div>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm mb-1">Vendor</label>
                <input
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={form.vendor}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, vendor: e.target.value }))
                  }
                  placeholder="e.g., Home Depot"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Category</label>
                <input
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                  placeholder="e.g., Supplies"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Amount (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Paid At</label>
                <input
                  type="date"
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={form.paidAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, paidAt: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Memo</label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={form.memo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, memo: e.target.value }))
                  }
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                onClick={() => setShowNew(false)}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-white ${
                  creating ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
                }`}
                onClick={async () => {
                  const vendor = form.vendor.trim();
                  const category = form.category.trim();
                  const amt = Number(form.amount);
                  if (
                    !vendor ||
                    !category ||
                    !Number.isFinite(amt) ||
                    amt <= 0
                  ) {
                    show({
                      type: "error",
                      message: "Provide vendor, category, and positive amount.",
                    });
                    return;
                  }
                  try {
                    setCreating(true);
                    const db = getFirestore();
                    const paidAt = Timestamp.fromDate(
                      new Date(`${form.paidAt}T00:00:00`)
                    );
                    await addDoc(collection(db, "expenses"), {
                      vendor,
                      category,
                      amount: amt,
                      paidAt,
                      memo: form.memo.trim() || null,
                      createdAt: serverTimestamp(),
                    });
                    setShowNew(false);
                    setForm({
                      vendor: "",
                      category: "",
                      amount: "",
                      paidAt: toInputDate(new Date()),
                      memo: "",
                    });
                    show({ type: "success", message: "Expense recorded." });
                  } catch (e: any) {
                    show({
                      type: "error",
                      message: e?.message || "Failed to record expense",
                    });
                  } finally {
                    setCreating(false);
                  }
                }}
                disabled={creating}
              >
                {creating ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(ts?: any) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : undefined;
  return d ? d.toLocaleDateString() : "—";
}
