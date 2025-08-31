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
import { ServiceAgreementProjectionService } from "../../../services/serviceAgreementProjections";
import AgreementDetailsModal from "../../../components/ui/AgreementDetailsModal";
import { Calendar } from "lucide-react";

type KpiData = {
  revenue30d: number;
  expectedRevenue30d: number;
  unpaidCount: number;
  jobsToday: number;
  openTickets: number;
};

export default function KPIStrip() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KpiData>({
    revenue30d: 0,
    expectedRevenue30d: 0,
    unpaidCount: 0,
    jobsToday: 0,
    openTickets: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

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

        // Expected revenue from service agreements for next 30 days
        let expectedRevenue30d = 0;
        try {
          const endDate = subDays(now, -30); // 30 days from now
          expectedRevenue30d =
            await ServiceAgreementProjectionService.getRevenueByDateRange(
              now,
              endDate
            );
        } catch (e: any) {
          console.warn("Error calculating expected revenue", e?.message);
        }

        setData({
          revenue30d,
          expectedRevenue30d,
          unpaidCount,
          jobsToday,
          openTickets,
        });
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
        hasButton: false,
      },
      {
        label: "Expected Revenue (30d)",
        value:
          data.expectedRevenue30d > 0
            ? `$${data.expectedRevenue30d.toLocaleString()}`
            : "$0",
        hasButton: true,
        buttonAction: () => setShowModal(true),
      },
      {
        label: "Unpaid Invoices",
        value: String(data.unpaidCount),
        hasButton: false,
      },
      { label: "Jobs Today", value: String(data.jobsToday), hasButton: false },
      {
        label: "Open Tickets",
        value: String(data.openTickets),
        hasButton: false,
      },
    ],
    [data]
  );

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((k) => (
          <div key={k.label} className="rounded-lg p-4 card-bg shadow-elev-1">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-xs uppercase text-zinc-500">{k.label}</div>
                <div className="text-xl font-semibold mt-1">
                  {loading ? "…" : error ? "—" : k.value}
                </div>
              </div>
              {k.hasButton && (
                <button
                  onClick={k.buttonAction}
                  className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md transition-colors ml-2"
                  title="View agreement details"
                >
                  <Calendar className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <AgreementDetailsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
