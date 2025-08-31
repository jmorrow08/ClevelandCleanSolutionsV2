import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../../services/firebase";
import { addDays } from "date-fns";
import { useSettings } from "../../../context/SettingsContext";
import { getClientNames } from "../../../services/queries/resolvers";
import { Link } from "react-router-dom";
import { format } from "date-fns";

type Invoice = {
  id: string;
  status?: string;
  createdAt?: any;
  totalAmount?: number;
  amount?: number;
};
type Agreement = {
  id: string;
  clientId?: string;
  contractEndDate?: Date;
  contractStartDate?: Date;
  isActive?: boolean;
  agreementName?: string;
  frequency?: string;
  updatedAt?: any;
};
type Ticket = { id: string; status?: string };

export default function Alerts() {
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [overdue, setOverdue] = useState<Invoice[]>([]);
  const [expiring, setExpiring] = useState<Agreement[]>([]);
  const [openTickets, setOpenTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Overdue invoices: fetch Unpaid ordered by createdAt; compute due in UI based on billingTermsDays
        try {
          const invQ = query(
            collection(db, "invoices"),
            where("status", "==", "Unpaid"),
            orderBy("createdAt", "asc")
          );
          const snap = await getDocs(invQ);
          const terms = Number(settings?.billingTermsDays ?? 30);
          const now = new Date();
          const list: Invoice[] = [];
          snap.forEach((d) => {
            const v = d.data() as any;
            const created = v?.createdAt?.toDate
              ? v.createdAt.toDate()
              : undefined;
            if (created) {
              const due = new Date(created);
              due.setDate(due.getDate() + terms);
              if (due < now) list.push({ id: d.id, ...v });
            }
          });
          setOverdue(list);
        } catch (e: any) {
          console.warn("Overdue invoices query may require index", e?.message);
        }

        // Expiring service agreements: try server-side window with client-side filter fallback
        try {
          const now = new Date();
          const soon = addDays(now, 30);
          try {
            // Attempt server-side range query (requires composite index)
            const agrQ = query(
              collection(db, "serviceAgreements"),
              where("isActive", "==", true),
              where("contractEndDate", ">=", Timestamp.fromDate(now)),
              where("contractEndDate", "<=", Timestamp.fromDate(soon)),
              orderBy("contractEndDate", "asc")
            );
            const snap = await getDocs(agrQ);
            const list: Agreement[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
            setExpiring(list);
          } catch (rangeErr: any) {
            console.warn(
              "Falling back to client-side filter for expiring agreements",
              rangeErr?.message
            );
            const agrQ = query(
              collection(db, "serviceAgreements"),
              where("isActive", "==", true)
            );
            const snap = await getDocs(agrQ);
            const list: Agreement[] = [];
            snap.forEach((d) => {
              const v = d.data() as any;
              const end = v?.contractEndDate?.toDate
                ? v.contractEndDate.toDate()
                : undefined;
              if (end && end >= now && end <= soon)
                list.push({ id: d.id, ...v });
            });
            setExpiring(list);
          }
        } catch (e: any) {
          console.warn("Agreements query failed", e?.message);
        }

        // Open support tickets
        try {
          const tQ = query(
            collection(db, "supportTickets"),
            where("status", "==", "open")
          );
          const snap = await getDocs(tQ);
          const list: Ticket[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setOpenTickets(list);
        } catch (e: any) {
          console.warn("Support tickets query may require index", e?.message);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [settings?.billingTermsDays]);

  return (
    <div className="rounded-lg p-4 card-bg shadow-elev-1">
      <div className="font-medium">Alerts</div>
      {loading ? (
        <div className="text-sm text-zinc-500 mt-2">Loading…</div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3">
          <div>
            <div className="text-sm font-medium">Overdue Invoices</div>
            {overdue.length === 0 ? (
              <div className="text-sm text-zinc-500">None</div>
            ) : (
              <ul className="text-sm list-disc pl-5">
                {overdue.slice(0, 5).map((i) => (
                  <li key={i.id}>Invoice {i.id}</li>
                ))}
              </ul>
            )}
          </div>
          <ExpiringAgreementsList items={expiring} />
          <div>
            <div className="text-sm font-medium">Open Support Tickets</div>
            {openTickets.length === 0 ? (
              <div className="text-sm text-zinc-500">None</div>
            ) : (
              <ul className="text-sm list-disc pl-5">
                {openTickets.slice(0, 5).map((t) => (
                  <li key={t.id}>Ticket {t.id}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExpiringAgreementsList({ items }: { items: Agreement[] }) {
  const [rows, setRows] = useState<
    { id: string; clientLabel: string; end: Date; label: string }[]
  >([]);

  useEffect(() => {
    (async () => {
      const out: {
        id: string;
        clientLabel: string;
        end: Date;
        label: string;
      }[] = [];
      const slice = items.slice(0, 5);
      const clientIds = slice.map((a) => a.clientId || "");
      const names = await getClientNames(clientIds);
      for (let idx = 0; idx < slice.length; idx++) {
        const a = slice[idx];
        const clientLabel = names[idx] || a.clientId || "Client";
        const end = a.contractEndDate
          ? typeof (a.contractEndDate as any).toDate === "function"
            ? (a.contractEndDate as any).toDate()
            : new Date(a.contractEndDate)
          : new Date();
        const label = a.agreementName || a.frequency || "Agreement";
        out.push({ id: a.id, clientLabel, end, label });
      }
      setRows(out);
    })();
  }, [items]);

  return (
    <div>
      <div className="text-sm font-medium">Expiring Agreements (30d)</div>
      {rows.length === 0 ? (
        <div className="text-sm text-zinc-500">None</div>
      ) : (
        <ul className="text-sm list-disc pl-5">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to={`/crm/clients/${
                  items.find((x) => x.id === r.id)?.clientId || ""
                }`}
                className="text-blue-600 dark:text-blue-400 underline"
              >
                {r.clientLabel}
              </Link>
              : {r.label} — {format(r.end, "MMM d, yyyy")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
