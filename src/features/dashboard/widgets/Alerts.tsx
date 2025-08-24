import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { firebaseConfig } from "../../../services/firebase";
import { addDays } from "date-fns";
import { useSettings } from "../../../context/SettingsContext";

type Invoice = {
  id: string;
  status?: string;
  createdAt?: any;
  totalAmount?: number;
  amount?: number;
};
type Agreement = { id: string; endDate?: any; updatedAt?: any };
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

        // Expiring service agreements: use updatedAt desc; filter endDate within 30d
        try {
          const agrQ = query(
            collection(db, "serviceAgreements"),
            orderBy("updatedAt", "desc")
          );
          const snap = await getDocs(agrQ);
          const soon = addDays(new Date(), 30);
          const list: Agreement[] = [];
          snap.forEach((d) => {
            const v = d.data() as any;
            const end = v?.endDate?.toDate ? v.endDate.toDate() : undefined;
            if (end && end <= soon) list.push({ id: d.id, ...v });
          });
          setExpiring(list);
        } catch (e: any) {
          console.warn("Agreements query may require index", e?.message);
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
    <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
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
          <div>
            <div className="text-sm font-medium">Expiring Agreements (30d)</div>
            {expiring.length === 0 ? (
              <div className="text-sm text-zinc-500">None</div>
            ) : (
              <ul className="text-sm list-disc pl-5">
                {expiring.slice(0, 5).map((a) => (
                  <li key={a.id}>Agreement {a.id}</li>
                ))}
              </ul>
            )}
          </div>
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
