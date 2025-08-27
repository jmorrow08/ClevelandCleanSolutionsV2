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
  deleteDoc,
  doc,
  runTransaction,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseConfig } from "../../services/firebase";
import { format } from "date-fns";
import { useLocation } from "react-router-dom";
import { RoleGuard } from "../../context/RoleGuard";
import { useToast } from "../../context/ToastContext";
import { useQuickActions } from "../../context/QuickActionsContext";
import InvoiceEditModal, { type InvoiceRecord } from "./InvoiceEditModal";
import { useSettings } from "../../context/SettingsContext";
import { renderInvoicePdf, renderInvoicePreview } from "../../lib/invoicePdf";
import { useAuth } from "../../context/AuthContext";

type Invoice = {
  id: string;
  invoiceNumber?: string;
  status?: "pending" | "paid" | "void" | string;
  createdAt?: any;
  dueDate?: any;
  totalAmount?: number;
  amount?: number;
  payeeEmail?: string;
  memo?: string;
};

function formatCurrency(n?: number) {
  const x = Number(n || 0) || 0;
  return `$${x.toLocaleString()}`;
}

function formatDate(ts?: any) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : undefined;
  return d ? format(d, "MMM d, yyyy") : "—";
}

// Utility function to determine invoice status and styling
function getInvoiceStatusInfo(invoice: Invoice) {
  const status = (invoice.status || "").toLowerCase();

  // If explicitly paid, show as paid
  if (status === "paid") {
    return {
      label: "Paid",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
    };
  }

  // Check if past due
  const dueDate = invoice.dueDate?.toDate
    ? invoice.dueDate.toDate()
    : invoice.dueDate instanceof Date
    ? invoice.dueDate
    : null;

  if (dueDate && dueDate < new Date()) {
    return {
      label: "Past Due",
      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
    };
  }

  // Default to pending
  return {
    label: "Pending",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
  };
}

export default function InvoicesPage() {
  const { claims } = useAuth();
  const location = useLocation();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "All" | "pending" | "paid" | "void"
  >("All");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
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
    const params = new URLSearchParams(location.search);
    const qp = params.get("search") || params.get("clientId") || "";
    if (qp) setSearch((prev) => (prev ? prev : qp));
     
  }, [location.search]);

  useEffect(() => {
    const canRead = !!(claims?.admin || claims?.owner || claims?.super_admin);
    if (!canRead) {
      setLoading(false);
      setError("no-access");
      setInvoices([]);
      return;
    }
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        let qref = query(
          collection(db, "invoices"),
          orderBy("createdAt", "desc"),
          limit(100)
        );
        if (statusFilter !== "All") {
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
  }, [statusFilter, claims]);

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

  function exportCsv() {
    const header = ["Invoice", "Status", "Due", "Amount"];
    const rows = filtered.map((inv) => {
      const amount = Number(inv.totalAmount ?? inv.amount ?? 0) || 0;
      return [
        inv.id,
        inv.status || "",
        formatDate(inv.dueDate),
        String(amount),
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function getNextInvoiceNumber(baseDate: Date) {
    // Try Cloud Function first (matches V1 behavior)
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const functions = getFunctions();
      const callable: any = httpsCallable(functions, "getNextInvoiceNumber");
      const res = await callable({});
      const data = (res?.data as any) || {};
      if (data.invoiceNumber && data.bucket) return data;
    } catch (_) {
      // fall through to Firestore transaction
    }
    // Fallback: Firestore transaction counter per YYYYMM
    const yyyy = String(baseDate.getFullYear());
    const mm = String(baseDate.getMonth() + 1).padStart(2, "0");
    const bucket = `${yyyy}${mm}`;
    const db = getFirestore();
    const counterRef = doc(db, "counters", `invoice_${bucket}`);
    try {
      const seq = await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists()
          ? Number((snap.data() as any).current || 0)
          : 0;
        const updated = current + 1;
        tx.set(
          counterRef,
          { current: updated, yearMonth: bucket, updatedAt: serverTimestamp() },
          { merge: true }
        );
        return updated;
      });
      const padded = String(seq).padStart(4, "0");
      return { invoiceNumber: `INV-${bucket}-${padded}`, bucket };
    } catch (_) {
      // Last resort: timestamp-based fallback
      const padded = String(Date.now() % 10000).padStart(4, "0");
      return { invoiceNumber: `INV-${bucket}-${padded}`, bucket };
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm">Status</label>
          <select
            className="border rounded-md px-2 py-1 bg-white dark:bg-zinc-900"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option>All</option>
            <option value="pending">pending</option>
            <option value="paid">paid</option>
            <option value="void">void</option>
          </select>
        </div>
        <input
          placeholder="Search by ID, email, status"
          className="border rounded-md px-3 py-1 flex-1 bg-white dark:bg-zinc-900"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-2 ml-auto">
          <button
            className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900 text-sm"
            onClick={exportCsv}
          >
            Export CSV
          </button>
          <RoleGuard allow={["admin", "owner", "super_admin"]}>
            <button
              className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
              onClick={() => setShowNew(true)}
            >
              New Invoice
            </button>
          </RoleGuard>
        </div>
      </div>

      {!(claims?.admin || claims?.owner || claims?.super_admin) ? (
        <div className="text-sm text-zinc-500">You do not have access.</div>
      ) : (
        <div className="hidden md:block overflow-x-auto rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-500">
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
                  <td className="px-3 py-4 text-zinc-500" colSpan={5}>
                    {statusFilter === "All" && !search
                      ? "No invoices found."
                      : "No matching invoices."}
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const amount =
                    Number(inv.totalAmount ?? inv.amount ?? 0) || 0;
                  return (
                    <tr
                      key={inv.id}
                      className="border-t border-zinc-100 dark:border-zinc-700"
                    >
                      <td className="px-3 py-2">
                        {inv.invoiceNumber || inv.id}
                      </td>
                      <td className="px-3 py-2">
                        {(() => {
                          const statusInfo = getInvoiceStatusInfo(inv);
                          return (
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusInfo.className}`}
                            >
                              {statusInfo.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2">{formatDate(inv.dueDate)}</td>
                      <td className="px-3 py-2">{formatCurrency(amount)}</td>
                      <td className="px-3 py-2 text-right">
                        <RoleGuard allow={["admin", "owner", "super_admin"]}>
                          <button
                            className="px-2 py-1 text-xs rounded-md border"
                            onClick={() => {
                              setSelected(inv);
                              setEditOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="ml-2 px-2 py-1 text-xs rounded-md border"
                            onClick={async () => {
                              try {
                                const company = {
                                  name:
                                    settings?.companyProfile?.name ||
                                    settings?.emailBranding?.fromName ||
                                    "Cleveland Clean Solutions",
                                  email:
                                    settings?.companyProfile?.email ||
                                    settings?.emailBranding?.fromEmail ||
                                    "",
                                  phone: settings?.companyProfile?.phone || "",
                                };
                                await renderInvoicePreview({
                                  company,
                                  logoUrl:
                                    settings?.companyProfile?.logoDataUrl ||
                                    "/vite.svg",
                                  invoice: {
                                    id: inv.id,
                                    invoiceNumber:
                                      (inv as any).invoiceNumber || inv.id,
                                    status: inv.status,
                                    dueDate: inv.dueDate,
                                    total:
                                      Number(
                                        inv.totalAmount ?? inv.amount ?? 0
                                      ) || 0,
                                    notes:
                                      (inv as any).memo ||
                                      (inv as any).notes ||
                                      "",
                                    payeeEmail: (inv as any).payeeEmail || "",
                                    clientName: (inv as any).clientName || "",
                                  },
                                });
                              } catch (e: any) {
                                show({
                                  type: "error",
                                  message:
                                    e?.message || "Failed to render preview",
                                });
                              }
                            }}
                          >
                            View
                          </button>
                          <button
                            className="ml-2 px-2 py-1 text-xs rounded-md border"
                            onClick={async () => {
                              try {
                                const company = {
                                  name:
                                    settings?.companyProfile?.name ||
                                    settings?.emailBranding?.fromName ||
                                    "Cleveland Clean Solutions",
                                  email:
                                    settings?.companyProfile?.email ||
                                    settings?.emailBranding?.fromEmail ||
                                    "",
                                  phone: settings?.companyProfile?.phone || "",
                                };
                                await renderInvoicePdf({
                                  company,
                                  logoUrl:
                                    settings?.companyProfile?.logoDataUrl ||
                                    "/vite.svg",
                                  invoice: {
                                    id: inv.id,
                                    invoiceNumber:
                                      (inv as any).invoiceNumber || inv.id,
                                    status: inv.status,
                                    dueDate: inv.dueDate,
                                    total:
                                      Number(
                                        inv.totalAmount ?? inv.amount ?? 0
                                      ) || 0,
                                    notes:
                                      (inv as any).memo ||
                                      (inv as any).notes ||
                                      "",
                                    payeeEmail: (inv as any).payeeEmail || "",
                                    clientName: (inv as any).clientName || "",
                                  },
                                });
                              } catch (e: any) {
                                show({
                                  type: "error",
                                  message:
                                    e?.message || "Failed to download PDF",
                                });
                              }
                            }}
                          >
                            Download
                          </button>
                        </RoleGuard>
                        <RoleGuard allow={["super_admin"]}>
                          <button
                            className="ml-2 px-2 py-1 text-xs rounded-md bg-red-600/10 text-red-700 dark:text-red-400"
                            onClick={async () => {
                              if (
                                !confirm(
                                  "Delete this invoice? This cannot be undone."
                                )
                              )
                                return;
                              try {
                                const db = getFirestore();
                                await deleteDoc(doc(db, "invoices", inv.id));
                                setInvoices((prev) =>
                                  prev.filter((x) => x.id !== inv.id)
                                );
                                show({
                                  type: "success",
                                  message: "Invoice deleted.",
                                });
                              } catch (e: any) {
                                show({
                                  type: "error",
                                  message: e?.message || "Failed to delete",
                                });
                              }
                            }}
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
      )}

      {(claims?.admin || claims?.owner || claims?.super_admin) && (
        <div className="md:hidden space-y-2">
          {loading ? (
            <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
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
                  className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {inv.invoiceNumber || inv.id}
                    </div>
                    <div className="text-sm">{formatCurrency(amount)}</div>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>Status:</span>
                      {(() => {
                        const statusInfo = getInvoiceStatusInfo(inv);
                        return (
                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusInfo.className}`}
                          >
                            {statusInfo.label}
                          </span>
                        );
                      })()}
                    </div>
                    <span>Due: {formatDate(inv.dueDate)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <RoleGuard allow={["admin", "owner", "super_admin"]}>
                      <button
                        className="px-2 py-1 text-xs rounded-md border"
                        onClick={() => {
                          setSelected(inv);
                          setEditOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="px-2 py-1 text-xs rounded-md border"
                        onClick={async () => {
                          try {
                            const company = {
                              name:
                                settings?.companyProfile?.name ||
                                settings?.emailBranding?.fromName ||
                                "Cleveland Clean Solutions",
                              email:
                                settings?.companyProfile?.email ||
                                settings?.emailBranding?.fromEmail ||
                                "",
                              phone: settings?.companyProfile?.phone || "",
                            };
                            await renderInvoicePreview({
                              company,
                              logoUrl:
                                settings?.companyProfile?.logoDataUrl ||
                                "/vite.svg",
                              invoice: {
                                id: inv.id,
                                invoiceNumber:
                                  (inv as any).invoiceNumber || inv.id,
                                status: inv.status,
                                dueDate: inv.dueDate,
                                total:
                                  Number(inv.totalAmount ?? inv.amount ?? 0) ||
                                  0,
                                notes: (inv as any).memo || "",
                                payeeEmail: (inv as any).payeeEmail || "",
                                clientName: (inv as any).clientName || "",
                              },
                            });
                          } catch (e: any) {
                            show({
                              type: "error",
                              message: e?.message || "Failed to render preview",
                            });
                          }
                        }}
                      >
                        View
                      </button>
                      <button
                        className="px-2 py-1 text-xs rounded-md border"
                        onClick={async () => {
                          try {
                            const company = {
                              name:
                                settings?.companyProfile?.name ||
                                settings?.emailBranding?.fromName ||
                                "Cleveland Clean Solutions",
                              email:
                                settings?.companyProfile?.email ||
                                settings?.emailBranding?.fromEmail ||
                                "",
                              phone: settings?.companyProfile?.phone || "",
                            };
                            await renderInvoicePdf({
                              company,
                              logoUrl:
                                settings?.companyProfile?.logoDataUrl ||
                                "/vite.svg",
                              invoice: {
                                id: inv.id,
                                invoiceNumber:
                                  (inv as any).invoiceNumber || inv.id,
                                status: inv.status,
                                dueDate: inv.dueDate,
                                total:
                                  Number(inv.totalAmount ?? inv.amount ?? 0) ||
                                  0,
                                notes: (inv as any).memo || "",
                                payeeEmail: (inv as any).payeeEmail || "",
                                clientName: (inv as any).clientName || "",
                              },
                            });
                          } catch (e: any) {
                            show({
                              type: "error",
                              message: e?.message || "Failed to download PDF",
                            });
                          }
                        }}
                      >
                        Download
                      </button>
                    </RoleGuard>
                    <RoleGuard allow={["super_admin"]}>
                      <button
                        className="px-2 py-1 text-xs rounded-md bg-red-600/10 text-red-700 dark:text-red-400"
                        onClick={async () => {
                          if (
                            !confirm(
                              "Delete this invoice? This cannot be undone."
                            )
                          )
                            return;
                          try {
                            const db = getFirestore();
                            await deleteDoc(doc(db, "invoices", inv.id));
                            setInvoices((prev) =>
                              prev.filter((x) => x.id !== inv.id)
                            );
                            show({
                              type: "success",
                              message: "Invoice deleted.",
                            });
                          } catch (e: any) {
                            show({
                              type: "error",
                              message: e?.message || "Failed to delete",
                            });
                          }
                        }}
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
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !submitting && setShowNew(false)}
          />
          <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
            <div className="text-lg font-medium">New Invoice</div>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm mb-1">Client ID</label>
                <input
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
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
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
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
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                onClick={() => setShowNew(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-white ${
                  submitting ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
                }`}
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
                    const { invoiceNumber, bucket } =
                      await getNextInvoiceNumber(new Date());
                    const ref = await addDoc(collection(db, "invoices"), {
                      clientId,
                      dueDate: due,
                      amount: amountNum,
                      status: "pending",
                      createdAt: serverTimestamp(),
                      invoiceNumber,
                      invoiceYearMonth: bucket,
                      invoiceNumberAssignedAt: serverTimestamp(),
                    });
                    setInvoices((prev) => [
                      {
                        ...optimistic,
                        id: ref.id,
                        createdAt: new Date(),
                        invoiceNumber,
                      },
                      ...prev.filter((x) => x.id !== optimistic.id),
                    ]);
                    setShowNew(false);
                    setForm({ clientId: "", dueDate: "", amount: "" });
                    show({ type: "success", message: "Invoice created." });
                  } catch (e: any) {
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

      <InvoiceEditModal
        open={editOpen}
        invoice={selected as InvoiceRecord | null}
        onClose={() => setEditOpen(false)}
        onSaved={(u) => {
          setInvoices((prev) =>
            prev.map((x) => (x.id === u.id ? { ...x, ...u } : x))
          );
        }}
      />
    </div>
  );
}
