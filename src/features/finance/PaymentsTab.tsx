import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";

type Payment = {
  id: string;
  amount?: number;
  method?: string;
  createdAt?: any;
  invoiceId?: string;
};

export default function PaymentsTab() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const q = query(
          collection(db, "payments"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const list: Payment[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setPayments(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : payments.length === 0 ? (
        <div className="text-sm text-zinc-500">No payments.</div>
      ) : (
        <ul className="text-sm">
          {payments.slice(0, 20).map((p) => (
            <li
              key={p.id}
              className="py-2 border-b border-zinc-100 dark:border-zinc-700"
            >
              Payment {p.id} — ${Number(p.amount || 0).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
