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
import { useSettings } from "../../context/SettingsContext";
import { renderInvoicePdf, renderInvoicePreview } from "../../lib/invoicePdf";
import { useAppConfig } from "@/config/appConfig";

type Invoice = {
  id: string;
  invoiceNumber?: string;
  status?: string;
  createdAt?: any;
  dueDate?: Date;
  totalAmount?: number;
  amount?: number;
};
type Payment = {
  id: string;
  amount?: number;
  createdAt?: any;
  invoiceId?: string;
};

export default function Billing() {
  const { settings } = useSettings();
  const { companyName } = useAppConfig();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

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
          console.warn("Client Billing invoices may need index", e?.message);
        }
        try {
          // Read client payments from Stripe extension: customers/{uid}/payments
          const uid = auth.currentUser?.uid;
          if (uid) {
            // Attempt to read subcollection with most recent first; fall back without order if needed
            try {
              const paySnap = await getDocs(
                query(
                  collection(db, "customers", uid, "payments"),
                  orderBy("created", "desc")
                )
              );
              const payList: Payment[] = [];
              paySnap.forEach((d) =>
                payList.push({ id: d.id, ...(d.data() as any) })
              );
              setPayments(payList);
            } catch (_inner) {
              const paySnap = await getDocs(
                collection(db, "customers", uid, "payments")
              );
              const payList: Payment[] = [];
              paySnap.forEach((d) =>
                payList.push({ id: d.id, ...(d.data() as any) })
              );
              setPayments(payList);
            }
          }
        } catch (e: any) {
          console.warn("Client Billing payments read", e?.message);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg p-4 card-bg shadow-elev-1">
        <div className="font-medium">Invoices</div>
        {loading ? (
          <div className="text-sm text-zinc-500 mt-1">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="text-sm text-zinc-500 mt-1">No invoices.</div>
        ) : (
          <ul className="text-sm mt-2">
            {invoices.slice(0, 10).map((inv) => (
              <li
                key={inv.id}
                className="py-2 border-b border-zinc-100 dark:border-zinc-700 flex items-center justify-between gap-2"
              >
                <div>
                  Invoice #{inv.invoiceNumber || inv.id} — {inv.status || "—"} —
                  ${Number(inv.totalAmount ?? inv.amount ?? 0).toLocaleString()}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    className="px-2 py-1 text-xs rounded-md border"
                    onClick={async () => {
                      const company = {
                        name:
                          settings?.companyProfile?.name ||
                          settings?.emailBranding?.fromName ||
                          companyName,
                        email:
                          settings?.companyProfile?.email ||
                          settings?.emailBranding?.fromEmail ||
                          "",
                        phone: settings?.companyProfile?.phone || "",
                      };
                      await renderInvoicePreview({
                        company,
                        logoUrl:
                          settings?.companyProfile?.logoDataUrl || "/vite.svg",
                        invoice: {
                          id: inv.id,
                          invoiceNumber: (inv as any).invoiceNumber || inv.id,
                          status: inv.status,
                          dueDate: inv.dueDate || inv.createdAt,
                          total:
                            Number(inv.totalAmount ?? inv.amount ?? 0) || 0,
                          payeeEmail: (inv as any)?.payeeEmail || "",
                          clientName: (inv as any).clientName || "",
                          notes: (inv as any).memo || (inv as any).notes || "",
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
                          companyName,
                        email:
                          settings?.companyProfile?.email ||
                          settings?.emailBranding?.fromEmail ||
                          "",
                        phone: settings?.companyProfile?.phone || "",
                      };
                      await renderInvoicePdf({
                        company,
                        logoUrl:
                          settings?.companyProfile?.logoDataUrl || "/vite.svg",
                        invoice: {
                          id: inv.id,
                          invoiceNumber: (inv as any).invoiceNumber || inv.id,
                          status: inv.status,
                          dueDate: inv.dueDate || inv.createdAt,
                          total:
                            Number(inv.totalAmount ?? inv.amount ?? 0) || 0,
                          payeeEmail: (inv as any)?.payeeEmail || "",
                          clientName: (inv as any).clientName || "",
                          notes: (inv as any).memo || (inv as any).notes || "",
                        },
                      });
                    }}
                  >
                    Download
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-lg p-4 card-bg shadow-elev-1">
        <div className="font-medium">Payments</div>
        {loading ? (
          <div className="text-sm text-zinc-500 mt-1">Loading…</div>
        ) : payments.length === 0 ? (
          <div className="text-sm text-zinc-500 mt-1">No payments.</div>
        ) : (
          <ul className="text-sm mt-2">
            {payments.slice(0, 10).map((p) => (
              <li
                key={p.id}
                className="py-1 border-b border-zinc-100 dark:border-zinc-700"
              >
                {p.id} — ${Number(p.amount || 0).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
