import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { firebaseConfig } from "../../../services/firebase";

type Ticket = { id: string; status?: string };

export default function MyQueue() {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const tQ = query(
          collection(db, "supportTickets"),
          where("status", "==", "open"),
          orderBy("createdAt", "desc")
        );
        const tSnap = await getDocs(tQ);
        const list: Ticket[] = [];
        tSnap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setTickets(list);
      } catch (e: any) {
        console.warn("MyQueue tickets may require index", e?.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="rounded-lg p-4 card-bg shadow-elev-1">
      <div className="font-medium">My Queue</div>
      {loading ? (
        <div className="text-sm text-zinc-500 mt-2">Loading…</div>
      ) : tickets.length === 0 ? (
        <div className="text-sm text-zinc-500 mt-2">No items in queue.</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {tickets.slice(0, 5).map((t) => (
            <li key={t.id} className="text-sm">
              Ticket {t.id}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
