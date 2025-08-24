import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { format } from "date-fns";
import { useLocation } from "react-router-dom";
import { RoleGuard } from "../../context/RoleGuard";
import { useToast } from "../../context/ToastContext";
import { useQuickActions } from "../../context/QuickActionsContext";

type Invoice = {
  id: string;
  status?: string;
  createdAt?: any;
  dueDate?: any;
  totalAmount?: number;
  amount?: number;
  payeeEmail?: string;
};

function formatCurrency(n?: number) {
  const x = Number(n || 0) || 0;
  return `$${x.toLocaleString()}`;
}

function formatDate(ts?: any) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : undefined;
  return d ? format(d, "MMM d, yyyy") : "—";
}

export default function InvoicesTab() {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [statusFilter, setStatusFilter] = useState<"All" | "Unpaid" | "paid">(
    "All"
  );
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<{
    clientId: string;
    dueDate: string;
    amount: string;
  }>({
    clientId: "",
    dueDate: "",
    amount: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const { show } = useToast();
  const {
    pendingNewInvoice,
    consumeNewInvoiceRequest,
    newInvoiceRequestedVersion,
  } = useQuickActions();

  useEffect(() => {
    // Seed search from query param (?search= or ?clientId=)
    const params = new URLSearchParams(location.search);
    const qp = params.get("search") || params.get("clientId") || "";
    if (qp) setSearch((prev) => (prev ? prev : qp));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        // Default recent invoices, order by createdAt desc
        let qref = query(
          collection(db, "invoices"),
          orderBy("createdAt", "desc"),
          limit(100)
        );
        // If filtering for Unpaid or paid, Firestore needs a where clause + orderBy createdAt
        if (statusFilter === "Unpaid" || statusFilter === "paid") {
          try {
            qref = query(
              collection(db, "invoices"),
              where("status", "==", statusFilter),
              orderBy("createdAt", "desc"),
              limit(100)
            );
          } catch (e: any) {
            console.warn(
              "Invoices status filter may require index",
              e?.message
            );
          }
        }
        const snap = await getDocs(qref);
        const list: Invoice[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setInvoices(list);
      } catch (e: any) {
        setError(e?.message || "Failed to load invoices");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [statusFilter]);

  // Respond to QuickActions trigger
  useEffect(() => {
    if (pendingNewInvoice) {
      setShowNew(true);
      consumeNewInvoiceRequest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newInvoiceRequestedVersion]);

  const filtered = useMemo(() => {
    if (!search) return invoices;
    const s = search.toLowerCase();
    return invoices.filter((inv) =>
      [inv.id, inv.payeeEmail, inv.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    );
  }, [invoices, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm">Status</label>
          <select
            className="border border-[color:var(--border)] rounded-md px-2 py-1 bg-[color:var(--card)] text-[color:var(--text)]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option>All</option>
            <option>Unpaid</option>
            <option>paid</option>
          </select>
        </div>
        <input
          placeholder="Search by ID, email, status"
          className="border border-[color:var(--border)] rounded-md px-3 py-1 flex-1 bg-[color:var(--card)] text-[color:var(--text)]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <RoleGuard allow={["admin", "owner", "super_admin"]}>
          <button
            className="px-3 py-1.5 rounded-md bg-[color:var(--brand)] hover:brightness-95 text-white text-sm focus-ring"
            onClick={() => setShowNew(true)}
          >
            New Invoice
          </button>
        </RoleGuard>
      </div>

      <div className="hidden md:block overflow-x-auto rounded-lg bg-[color:var(--card)] shadow-elev-1">
        <table className="min-w-full text-sm">
          <thead className="text-left text-[color:var(--text)] opacity-60">
            <tr>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-4 text-[color:var(--text)] opacity-60"
                  colSpan={5}
                >
                  {statusFilter === "All" && !search
                    ? "No invoices found."
                    : "No matching invoices."}
                </td>
              </tr>
            ) : (
              filtered.map((inv) => {
                const amount = Number(inv.totalAmount ?? inv.amount ?? 0) || 0;
                return (
                  <tr
                    key={inv.id}
                    className="border-t border-[color:var(--border)]"
                  >
                    <td className="px-3 py-2">{inv.id}</td>
                    <td className="px-3 py-2">{inv.status || "—"}</td>
                    <td className="px-3 py-2">{formatDate(inv.dueDate)}</td>
                    <td className="px-3 py-2">{formatCurrency(amount)}</td>
                    <td className="px-3 py-2 text-right">
                      <RoleGuard allow={["super_admin"]}>
                        <button
                          className="px-2 py-1 text-xs rounded-md bg-red-600/10 text-red-700 dark:text-red-400 cursor-not-allowed"
                          title="Delete is super_admin-only and not implemented yet"
                          disabled
                        >
                          Delete
                        </button>
                      </RoleGuard>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile TableCard list */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="rounded-lg p-3 bg-[color:var(--card)] shadow-elev-1 text-sm text-[color:var(--text)] opacity-60">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg p-3 bg-[color:var(--card)] shadow-elev-1 text-sm text-[color:var(--text)] opacity-60">
            {statusFilter === "All" && !search
              ? "No invoices found."
              : "No matching invoices."}
          </div>
        ) : (
          filtered.map((inv) => {
            const amount = Number(inv.totalAmount ?? inv.amount ?? 0) || 0;
            return (
              <div
                key={inv.id}
                className="rounded-lg p-3 bg-[color:var(--card)] shadow-elev-1"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{inv.id}</div>
                  <div className="text-sm">{formatCurrency(amount)}</div>
                </div>
                <div className="text-xs text-[color:var(--text)] opacity-60 mt-1 flex items-center justify-between">
                  <span>Status: {inv.status || "—"}</span>
                  <span>Due: {formatDate(inv.dueDate)}</span>
                </div>
                <div className="mt-2 text-right">
                  <RoleGuard allow={["super_admin"]}>
                    <button
                      className="px-2 py-1 text-xs rounded-md bg-red-600/10 text-red-700 dark:text-red-400 cursor-not-allowed"
                      title="Delete is super_admin-only and not implemented yet"
                      disabled
                    >
                      Delete
                    </button>
                  </RoleGuard>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !submitting && setShowNew(false)}
          />
          <div className="relative w-full max-w-md rounded-lg bg-[color:var(--card)] shadow-elev-3 p-4">
            <div className="text-lg font-medium">New Invoice</div>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm mb-1">Client ID</label>
                <input
                  className="w-full border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--card)] text-[color:var(--text)]"
                  value={form.clientId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, clientId: e.target.value }))
                  }
                  placeholder="clientProfileId or account id"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Due Date</label>
                <input
                  type="date"
                  className="w-full border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--card)] text-[color:var(--text)]"
                  value={form.dueDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dueDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Amount (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--card)] text-[color:var(--text)]"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--text)] focus-ring"
                onClick={() => setShowNew(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded-md text-white bg-[color:var(--brand)] hover:brightness-95 disabled:opacity-60 focus-ring"
                onClick={async () => {
                  const clientId = form.clientId.trim();
                  const dueStr = form.dueDate;
                  const amountNum = Number(form.amount);
                  if (
                    !clientId ||
                    !dueStr ||
                    !isFinite(amountNum) ||
                    amountNum <= 0
                  ) {
                    show({
                      type: "error",
                      message: "Fill client, due date, and positive amount.",
                    });
                    return;
                  }
                  try {
                    setSubmitting(true);
                    const db = getFirestore();
                    const due = Timestamp.fromDate(
                      new Date(`${dueStr}T00:00:00`)
                    );
                    const optimistic: Invoice = {
                      id: `tmp-${Math.random().toString(36).slice(2)}`,
                      status: "pending",
                      createdAt: new Date(),
                      dueDate: due.toDate(),
                      amount: amountNum,
                    } as any;
                    setInvoices((prev) => [optimistic, ...prev]);
                    const ref = await addDoc(collection(db, "invoices"), {
                      clientId,
                      dueDate: due,
                      amount: amountNum,
                      status: "pending",
                      createdAt: serverTimestamp(),
                    });
                    // Replace optimistic with real
                    setInvoices((prev) => [
                      { ...optimistic, id: ref.id, createdAt: new Date() },
                      ...prev.filter((x) => x.id !== optimistic.id),
                    ]);
                    setShowNew(false);
                    setForm({ clientId: "", dueDate: "", amount: "" });
                    show({ type: "success", message: "Invoice created." });
                  } catch (e: any) {
                    // remove optimistic entry
                    setInvoices((prev) =>
                      prev.filter((x) => !x.id.startsWith("tmp-"))
                    );
                    show({
                      type: "error",
                      message: e?.message || "Failed to create invoice",
                    });
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
              >
                {submitting ? "Saving…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
