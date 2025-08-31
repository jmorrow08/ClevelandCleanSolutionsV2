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
import { applyPaymentToInvoice } from "../../services/queries/finance";

type Payment = {
  id: string;
  invoiceId?: string;
  amount?: number;
  method?: "cash" | "card" | "ach" | string;
  receivedAt?: any;
  createdAt?: any;
};

export default function PaymentsPage() {
  const { claims, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{
    invoiceId: string;
    amount: string;
    method: "cash" | "card" | "ach";
    receivedAt: string; // yyyy-mm-dd
  }>({
    invoiceId: "",
    amount: "",
    method: "cash",
    receivedAt: toInputDate(new Date()),
  });
  const { show } = useToast();

  useEffect(() => {
    // Wait for auth claims so we don't attach listeners that will 403
    const canRead = !!(claims?.admin || claims?.owner || claims?.super_admin);
    if (authLoading) return;
    if (!canRead) {
      setPayments([]);
      setLoading(false);
      return;
    }
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    const qref = query(
      collection(db, "payments"),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    const unsub = onSnapshot(
      qref,
      (snap) => {
        const list: Payment[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setPayments(list);
        setLoading(false);
      },
      (err) => {
        // Permission denied or other listener error
        console.error("payments onSnapshot error", err);
        setPayments([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [claims, authLoading]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-500">Recent payments</div>
        <RoleGuard allow={["admin", "owner", "super_admin"]}>
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
            onClick={() => setShowNew(true)}
          >
            Record Payment
          </button>
        </RoleGuard>
      </div>

      {!(claims?.admin || claims?.owner || claims?.super_admin) ? (
        <div className="text-sm text-zinc-500">You do not have access.</div>
      ) : loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : payments.length === 0 ? (
        <div className="text-sm text-zinc-500">No payments recorded.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg card-bg shadow-elev-1">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Received</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-zinc-100 dark:border-zinc-700"
                >
                  <td className="px-3 py-2">{p.invoiceId || "—"}</td>
                  <td className="px-3 py-2">
                    ${Number(p.amount || 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{p.method || "—"}</td>
                  <td className="px-3 py-2">
                    {formatDate(p.receivedAt || p.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RoleGuard allow={["super_admin"]}>
                      <button
                        className="px-2 py-1 text-xs rounded-md bg-red-600/10 text-red-700 dark:text-red-400"
                        onClick={async () => {
                          if (
                            !confirm(
                              "Delete this payment? This cannot be undone."
                            )
                          )
                            return;
                          try {
                            const db = getFirestore();
                            await deleteDoc(doc(db, "payments", p.id));
                            // apply recomputation is optional; leave as is and rely on listeners
                            show({
                              type: "success",
                              message: "Payment deleted.",
                            });
                          } catch (e: any) {
                            show({
                              type: "error",
                              message: e?.message || "Failed to delete payment",
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
          <div className="relative w-full max-w-md rounded-lg card-bg shadow-elev-3 p-4">
            <div className="text-lg font-medium">Record Payment</div>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm mb-1">Invoice ID</label>
                <input
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={form.invoiceId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, invoiceId: e.target.value }))
                  }
                  placeholder="invoice document id"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Amount (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Method</label>
                <select
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={form.method}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, method: e.target.value as any }))
                  }
                >
                  <option value="cash">cash</option>
                  <option value="card">card</option>
                  <option value="ach">ach</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Received At</label>
                <input
                  type="date"
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={form.receivedAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, receivedAt: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-md border card-bg"
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
                  const invoiceId = form.invoiceId.trim();
                  const amt = Number(form.amount);
                  if (!invoiceId || !Number.isFinite(amt) || amt <= 0) {
                    show({
                      type: "error",
                      message: "Provide invoice id and positive amount.",
                    });
                    return;
                  }
                  try {
                    setCreating(true);
                    const db = getFirestore();
                    const received = Timestamp.fromDate(
                      new Date(`${form.receivedAt}T00:00:00`)
                    );
                    await addDoc(collection(db, "payments"), {
                      invoiceId,
                      amount: amt,
                      method: form.method,
                      receivedAt: received,
                      createdAt: serverTimestamp(),
                    });
                    await applyPaymentToInvoice(invoiceId, amt);
                    setShowNew(false);
                    setForm({
                      invoiceId: "",
                      amount: "",
                      method: "cash",
                      receivedAt: toInputDate(new Date()),
                    });
                    show({ type: "success", message: "Payment recorded." });
                  } catch (e: any) {
                    show({
                      type: "error",
                      message: e?.message || "Failed to record payment",
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
