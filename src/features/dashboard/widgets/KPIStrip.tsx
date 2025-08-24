import { useEffect, useMemo, useState } from "react";
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
import { startOfDay, subDays } from "date-fns";

type KpiData = {
  revenue30d: number;
  unpaidCount: number;
  jobsToday: number;
  openTickets: number;
};

export default function KPIStrip() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KpiData>({
    revenue30d: 0,
    unpaidCount: 0,
    jobsToday: 0,
    openTickets: 0,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        const now = new Date();
        const thirtyDaysAgo = subDays(now, 30);
        const startToday = startOfDay(now);
        const endToday = new Date(startToday);
        endToday.setDate(endToday.getDate() + 1);

        // Revenue: sum of invoices where status == 'paid' and createdAt in last 30d
        let revenue30d = 0;
        try {
          const paidQ = query(
            collection(db, "invoices"),
            where("status", "==", "paid"),
            where("createdAt", ">=", Timestamp.fromDate(thirtyDaysAgo)),
            where("createdAt", "<", Timestamp.fromDate(now)),
            orderBy("createdAt", "desc")
          );
          const paidSnap = await getDocs(paidQ);
          paidSnap.forEach((d) => {
            const inv = d.data() as any;
            const amount = Number(inv?.totalAmount ?? inv?.amount ?? 0) || 0;
            revenue30d += amount;
          });
        } catch (e: any) {
          console.warn("Invoices paid query may require index", e?.message);
        }

        // Unpaid invoices count: status == 'Unpaid'
        let unpaidCount = 0;
        try {
          const unpaidQ = query(
            collection(db, "invoices"),
            where("status", "==", "Unpaid")
          );
          const unpaidSnap = await getDocs(unpaidQ);
          unpaidCount = unpaidSnap.size;
        } catch (e: any) {
          console.warn("Unpaid invoices query may require index", e?.message);
        }

        // Jobs today count: serviceHistory in [startToday, endToday)
        let jobsToday = 0;
        try {
          const jobsQ = query(
            collection(db, "serviceHistory"),
            where("serviceDate", ">=", Timestamp.fromDate(startToday)),
            where("serviceDate", "<", Timestamp.fromDate(endToday))
          );
          const jobsSnap = await getDocs(jobsQ);
          jobsToday = jobsSnap.size;
        } catch (e: any) {
          console.warn("Jobs today query may require index", e?.message);
        }

        // Open support tickets count: status == 'open'
        let openTickets = 0;
        try {
          const ticketsQ = query(
            collection(db, "supportTickets"),
            where("status", "==", "open")
          );
          const tSnap = await getDocs(ticketsQ);
          openTickets = tSnap.size;
        } catch (e: any) {
          console.warn("Support tickets query may require index", e?.message);
        }

        setData({ revenue30d, unpaidCount, jobsToday, openTickets });
      } catch (e: any) {
        setError(e?.message || "Failed to load KPIs");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const cards = useMemo(
    () => [
      {
        label: "Revenue (30d)",
        value:
          data.revenue30d > 0 ? `$${data.revenue30d.toLocaleString()}` : "$0",
      },
      { label: "Unpaid Invoices", value: String(data.unpaidCount) },
      { label: "Jobs Today", value: String(data.jobsToday) },
      { label: "Open Tickets", value: String(data.openTickets) },
    ],
    [data]
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((k) => (
        <div
          key={k.label}
          className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1"
        >
          <div className="text-xs uppercase text-zinc-500">{k.label}</div>
          <div className="text-xl font-semibold mt-1">
            {loading ? "…" : error ? "—" : k.value}
          </div>
        </div>
      ))}
    </div>
  );
}
