import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";

type PayrollRow = {
  id: string;
  payPeriodStartDate?: any;
  payPeriodEndDate?: any;
  status?: string;
  totalEarnings?: number;
  netPay?: number | null;
  paymentDate?: any;
};

function formatCurrency(n?: number | null) {
  if (typeof n !== "number") return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function PayrollPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [rows, setRows] = useState<PayrollRow[]>([]);

  useEffect(() => {
    (async () => {
      if (!user?.uid) return;
      try {
        setLoading(true);
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        // Resolve profileId
        let profileId: string | null = null;
        try {
          const us = await getDoc(doc(db, "users", user.uid));
          profileId =
            us.exists() && typeof (us.data() as any).profileId === "string"
              ? (us.data() as any).profileId
              : null;
        } catch {}
        const qy = query(
          collection(db, "employeePayroll"),
          where("employeeProfileId", "==", profileId || ""),
          orderBy("payPeriodStartDate", "desc"),
          limit(24)
        );
        const snap = await getDocs(qy);
        const list: PayrollRow[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setRows(list);
      } catch (e: any) {
        setError(e?.message || "Failed to load payroll.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Payroll</h1>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
          No payroll records found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2">Pay Period</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Net / Total</th>
                <th className="px-3 py-2">Payment Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const start = r.payPeriodStartDate?.toDate
                  ? r.payPeriodStartDate.toDate()
                  : r.payPeriodStartDate?.seconds
                  ? new Date(r.payPeriodStartDate.seconds * 1000)
                  : null;
                const end = r.payPeriodEndDate?.toDate
                  ? r.payPeriodEndDate.toDate()
                  : r.payPeriodEndDate?.seconds
                  ? new Date(r.payPeriodEndDate.seconds * 1000)
                  : null;
                const payment = r.paymentDate?.toDate
                  ? r.paymentDate.toDate()
                  : r.paymentDate?.seconds
                  ? new Date(r.paymentDate.seconds * 1000)
                  : null;
                const isPaid = (r.status || "").toLowerCase() === "paid";
                const displayTotal =
                  isPaid && typeof r.netPay === "number"
                    ? r.netPay
                    : r.totalEarnings || null;
                return (
                  <tr
                    key={r.id}
                    className="border-t border-zinc-100 dark:border-zinc-700"
                  >
                    <td className="px-3 py-2">
                      {start
                        ? start.toLocaleDateString(
                            {} as any,
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            } as any
                          )
                        : "—"}{" "}
                      -{" "}
                      {end
                        ? end.toLocaleDateString(
                            {} as any,
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            } as any
                          )
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          isPaid
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {isPaid ? "Paid" : "Pending"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {formatCurrency(displayTotal)}
                    </td>
                    <td className="px-3 py-2">
                      {payment ? payment.toLocaleDateString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
