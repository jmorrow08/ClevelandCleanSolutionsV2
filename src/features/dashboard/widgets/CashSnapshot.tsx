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
import { subDays } from "date-fns";
import { ServiceAgreementProjectionService } from "../../../services/serviceAgreementProjections";

type Point = { date: string; inflow: number; outflow: number };

export default function CashSnapshot() {
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<Point[]>([]);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const end = new Date();
        const start = subDays(end, 90);

        // Inflows: invoices status paid in last 90d
        const actualInflows: Record<string, number> = {};
        try {
          const paidQ = query(
            collection(db, "invoices"),
            where("status", "==", "paid"),
            where("createdAt", ">=", Timestamp.fromDate(start)),
            where("createdAt", "<", Timestamp.fromDate(end)),
            orderBy("createdAt", "desc")
          );
          const snap = await getDocs(paidQ);
          snap.forEach((d) => {
            const v: any = d.data();
            const dt = v?.createdAt?.toDate ? v.createdAt.toDate() : undefined;
            const day = dt ? dt.toISOString().slice(0, 10) : "";
            const amt = Number(v?.totalAmount ?? v?.amount ?? 0) || 0;
            if (day) actualInflows[day] = (actualInflows[day] || 0) + amt;
          });
        } catch (e: any) {
          console.warn("Cash inflows query may require index", e?.message);
        }

        // Projected inflows from service agreements
        const projectedInflows: Record<string, number> = {};
        try {
          const projectedData =
            await ServiceAgreementProjectionService.getProjectedCashflow(90);
          projectedData.forEach((point) => {
            projectedInflows[point.date] = point.inflow;
          });
        } catch (e: any) {
          console.warn("Error loading projected inflows", e?.message);
        }

        // Outflows: payrollRuns totals in last 90d (using periodEnd)
        const outflows: Record<string, number> = {};
        try {
          const prQ = query(
            collection(db, "payrollRuns"),
            where("periodEnd", ">=", Timestamp.fromDate(start)),
            where("periodEnd", "<", Timestamp.fromDate(end)),
            orderBy("periodEnd", "desc")
          );
          const snap = await getDocs(prQ);
          snap.forEach((d) => {
            const v: any = d.data();
            const dt = v?.periodEnd?.toDate ? v.periodEnd.toDate() : undefined;
            const day = dt ? dt.toISOString().slice(0, 10) : "";
            const amt = Number(v?.totalEarnings ?? 0) || 0;
            if (day) outflows[day] = (outflows[day] || 0) + amt;
          });
        } catch (e: any) {
          console.warn("Cash outflows query may require index", e?.message);
        }

        // Merge actual and projected inflows
        const combinedInflows: Record<string, number> = {};
        const allDays = new Set<string>([
          ...Object.keys(actualInflows),
          ...Object.keys(projectedInflows),
          ...Object.keys(outflows),
        ]);

        allDays.forEach((day) => {
          combinedInflows[day] =
            (actualInflows[day] || 0) + (projectedInflows[day] || 0);
        });

        // Merge by day
        const merged: Point[] = [...allDays].sort().map((d) => ({
          date: d,
          inflow: combinedInflows[d] || 0,
          outflow: outflows[d] || 0,
        }));
        setPoints(merged.slice(-30));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="rounded-lg p-4 card-bg shadow-elev-1">
      <div className="font-medium">Cash Snapshot</div>
      {loading ? (
        <div className="text-sm text-zinc-500 mt-2">Loading…</div>
      ) : points.length === 0 ? (
        <div className="text-sm text-zinc-500 mt-2">No recent data.</div>
      ) : (
        <div className="text-sm text-zinc-500 mt-2">
          Inflows vs Outflows (includes projections)
        </div>
      )}
    </div>
  );
}
