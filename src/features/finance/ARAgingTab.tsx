import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useSettings } from "../../context/SettingsContext";

type Invoice = {
  id: string;
  status?: string;
  createdAt?: any;
  totalAmount?: number;
  amount?: number;
};

export default function ARAgingTab() {
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    const qref = query(collection(db, "invoices"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(qref, (snap) => {
      const list: Invoice[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setInvoices(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const buckets = useMemo(() => {
    const terms = Number(settings?.billingTermsDays ?? 30);
    const now = new Date();
    const result = { b0: 0, b30: 0, b60: 0, b90: 0, b90p: 0 };
    invoices.forEach((inv) => {
      const created = inv.createdAt?.toDate
        ? inv.createdAt.toDate()
        : undefined;
      const total = Number(inv.totalAmount ?? inv.amount ?? 0) || 0;
      const paid = Number((inv as any).totalPaid ?? 0) || 0;
      const dueAmount = Math.max(0, total - paid);
      if (!created || dueAmount <= 0) return;
      const due = new Date(created);
      due.setDate(due.getDate() + terms);
      const days = Math.max(
        0,
        Math.floor((now.getTime() - due.getTime()) / 86400000)
      );
      if (days <= 0) result.b0 += dueAmount;
      else if (days <= 30) result.b30 += dueAmount;
      else if (days <= 60) result.b60 += dueAmount;
      else if (days <= 90) result.b90 += dueAmount;
      else result.b90p += dueAmount;
    });
    return result;
  }, [invoices, settings?.billingTermsDays]);

  return (
    <div className="space-y-2 text-sm">
      {loading ? (
        <div className="text-zinc-500">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded-md p-3 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1">
              <div className="text-xs text-zinc-500">0–30</div>
              <div className="font-medium">${buckets.b0.toLocaleString()}</div>
            </div>
            <div className="rounded-md p-3 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1">
              <div className="text-xs text-zinc-500">31–60</div>
              <div className="font-medium">${buckets.b30.toLocaleString()}</div>
            </div>
            <div className="rounded-md p-3 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1">
              <div className="text-xs text-zinc-500">61–90</div>
              <div className="font-medium">${buckets.b60.toLocaleString()}</div>
            </div>
            <div className="rounded-md p-3 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1">
              <div className="text-xs text-zinc-500">90</div>
              <div className="font-medium">${buckets.b90.toLocaleString()}</div>
            </div>
            <div className="rounded-md p-3 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1">
              <div className="text-xs text-zinc-500">90+</div>
              <div className="font-medium">
                ${buckets.b90p.toLocaleString()}
              </div>
            </div>
          </div>
          <div className="text-xs text-zinc-500 mt-2">
            Using AR Terms: {Number(settings?.billingTermsDays ?? 30)} days
          </div>
        </>
      )}
    </div>
  );
}
