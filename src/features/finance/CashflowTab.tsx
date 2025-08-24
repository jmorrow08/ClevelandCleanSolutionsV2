import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { subDays } from "date-fns";

type Point = { date: string; inflow: number; outflow: number };

export default function CashflowTab() {
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<Point[]>([]);
  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const end = new Date();
        const start = subDays(end, 90);
        const inflows: Record<string, number> = {};
        const outflowsPayroll: Record<string, number> = {};
        const outflowsExpenses: Record<string, number> = {};
        const unsubPayments = onSnapshot(
          query(
            collection(db, "payments"),
            where("createdAt", ">=", Timestamp.fromDate(start)),
            where("createdAt", "<", Timestamp.fromDate(end)),
            orderBy("createdAt", "desc")
          ),
          (snap) => {
            Object.keys(inflows).forEach((k) => delete inflows[k]);
            snap.forEach((d) => {
              const v: any = d.data();
              const dts: any = v?.receivedAt || v?.createdAt;
              const dt = dts?.toDate ? dts.toDate() : undefined;
              const key = dt ? dt.toISOString().slice(0, 10) : "";
              const amt = Number(v?.amount ?? 0) || 0;
              if (key) inflows[key] = (inflows[key] || 0) + amt;
            });
            setPoints(
              mergeSeries(
                inflows,
                sumRecords(outflowsPayroll, outflowsExpenses)
              )
            );
          }
        );
        const unsubPayroll = onSnapshot(
          query(
            collection(db, "payrollRuns"),
            where("periodEnd", ">=", Timestamp.fromDate(start)),
            where("periodEnd", "<", Timestamp.fromDate(end)),
            orderBy("periodEnd", "desc")
          ),
          (snap) => {
            Object.keys(outflowsPayroll).forEach(
              (k) => delete outflowsPayroll[k]
            );
            snap.forEach((d) => {
              const v: any = d.data();
              const dt = v?.periodEnd?.toDate
                ? v.periodEnd.toDate()
                : undefined;
              const key = dt ? dt.toISOString().slice(0, 10) : "";
              const amt = Number(v?.totalEarnings ?? 0) || 0;
              if (key) outflowsPayroll[key] = (outflowsPayroll[key] || 0) + amt;
            });
            setPoints(
              mergeSeries(
                inflows,
                sumRecords(outflowsPayroll, outflowsExpenses)
              )
            );
          },
          () => {
            // ignore payroll listener errors
          }
        );
        const unsubExpenses = onSnapshot(
          query(
            collection(db, "expenses"),
            where("paidAt", ">=", Timestamp.fromDate(start)),
            where("paidAt", "<", Timestamp.fromDate(end)),
            orderBy("paidAt", "desc")
          ),
          (snap) => {
            Object.keys(outflowsExpenses).forEach(
              (k) => delete outflowsExpenses[k]
            );
            snap.forEach((d) => {
              const v: any = d.data();
              const dt = v?.paidAt?.toDate ? v.paidAt.toDate() : undefined;
              const key = dt ? dt.toISOString().slice(0, 10) : "";
              const amt = Number(v?.amount ?? 0) || 0;
              if (key)
                outflowsExpenses[key] = (outflowsExpenses[key] || 0) + amt;
            });
            setPoints(
              mergeSeries(
                inflows,
                sumRecords(outflowsPayroll, outflowsExpenses)
              )
            );
          },
          () => {
            // permission denied or other listener error; omit expenses from outflows
            Object.keys(outflowsExpenses).forEach(
              (k) => delete outflowsExpenses[k]
            );
            setPoints(
              mergeSeries(
                inflows,
                sumRecords(outflowsPayroll, outflowsExpenses)
              )
            );
          }
        );
        return () => {
          unsubPayments();
          unsubPayroll();
          unsubExpenses();
        };
      } finally {
        setLoading(false);
      }
    }
    const cleanup = load();
    return () => {
      // ensure any listeners are cleaned up
      if (typeof cleanup === "function") (cleanup as any)();
    };
  }, []);
  return (
    <div className="space-y-2">
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : points.length === 0 ? (
        <div className="text-sm text-zinc-500">No data.</div>
      ) : (
        <div className="text-sm text-zinc-500">
          Cashflow series ready ({points.length} pts)
        </div>
      )}
    </div>
  );
}

function mergeSeries(
  inflows: Record<string, number>,
  outflows: Record<string, number>
): Point[] {
  const all = new Set<string>([
    ...Object.keys(inflows),
    ...Object.keys(outflows),
  ]);
  return [...all].sort().map((k) => ({
    date: k,
    inflow: inflows[k] || 0,
    outflow: outflows[k] || 0,
  }));
}

function sumRecords(
  a: Record<string, number>,
  b: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(a)) {
    result[k] = (result[k] || 0) + (Number(v) || 0);
  }
  for (const [k, v] of Object.entries(b)) {
    result[k] = (result[k] || 0) + (Number(v) || 0);
  }
  return result;
}
