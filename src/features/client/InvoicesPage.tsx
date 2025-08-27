import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { renderInvoicePdf, renderInvoicePreview } from "../../lib/invoicePdf";
import { useSettings } from "../../context/SettingsContext";

type Invoice = {
  id: string;
  invoiceNumber?: string;
  status?: string;
  createdAt?: any;
  dueDate?: any;
  totalAmount?: number;
  amount?: number;
};

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
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const auth = getAuth();
        const email = auth.currentUser?.email;
        if (!email) return setLoading(false);
        const db = getFirestore();
        try {
          const invQ = query(
            collection(db, "invoices"),
            where("payeeEmail", "==", email),
            orderBy("createdAt", "desc")
          );
          const invSnap = await getDocs(invQ);
          const invList: Invoice[] = [];
          invSnap.forEach((d) =>
            invList.push({ id: d.id, ...(d.data() as any) })
          );
          setInvoices(invList);
        } catch (e: any) {
          console.warn("Client invoices list may need index", e?.message);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Invoices</h1>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1 mt-4">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="text-sm text-zinc-500">No invoices.</div>
        ) : (
          <ul className="text-sm divide-y divide-zinc-200 dark:divide-zinc-700">
            {invoices.map((inv) => {
              const statusInfo = getInvoiceStatusInfo(inv);
              return (
                <li
                  key={inv.id}
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      Invoice #{inv.invoiceNumber || inv.id} — $
                      {Number(
                        inv.totalAmount ?? inv.amount ?? 0
                      ).toLocaleString()}
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.className}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      className="px-2 py-1 text-xs rounded-md border"
                      onClick={async () => {
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
                            invoiceNumber: (inv as any).invoiceNumber || inv.id,
                            status: inv.status,
                            dueDate: inv.dueDate || inv.createdAt,
                            total:
                              Number(inv.totalAmount ?? inv.amount ?? 0) || 0,
                            payeeEmail: (inv as any)?.payeeEmail || "",
                            clientName: (inv as any).clientName || "",
                            notes:
                              (inv as any).memo || (inv as any).notes || "",
                          },
                        });
                      }}
                    >
                      View
                    </button>
                    <button
                      className="px-2 py-1 text-xs rounded-md border"
                      onClick={async () => {
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
                            invoiceNumber: (inv as any).invoiceNumber || inv.id,
                            status: inv.status,
                            dueDate: inv.dueDate || inv.createdAt,
                            total:
                              Number(inv.totalAmount ?? inv.amount ?? 0) || 0,
                            payeeEmail: (inv as any)?.payeeEmail || "",
                            clientName: (inv as any).clientName || "",
                            notes:
                              (inv as any).memo || (inv as any).notes || "",
                          },
                        });
                      }}
                    >
                      Download
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
