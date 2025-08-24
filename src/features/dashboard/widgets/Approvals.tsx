import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
import { useAuth } from "../../../context/AuthContext";

type Run = {
  id: string;
  periodEnd?: any;
  status?: string;
  totalEarnings?: number;
};

export default function Approvals() {
  const { claims } = useAuth();
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<Run[]>([]);
  const [, setError] = useState<string | null>(null);

  useEffect(() => {
    const canRead = !!(claims?.admin || claims?.owner || claims?.super_admin);
    if (!canRead) {
      setLoading(false);
      setRuns([]);
      return;
    }
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const q = query(
          collection(db, "payrollRuns"),
          where("status", "in", ["draft", "review"]),
          orderBy("periodEnd", "desc")
        );
        const snap = await getDocs(q);
        const list: Run[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setRuns(list);
      } catch (e: any) {
        console.warn(
          "Approvals payrollRuns query may require index",
          e?.message
        );
        setError(e?.message || "Failed to load approvals");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [claims]);

  return (
    <div className="rounded-lg p-4 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1">
      <div className="font-medium">Approvals</div>
      {!(claims?.admin || claims?.owner || claims?.super_admin) ? (
        <div className="text-sm text-zinc-500 mt-2">No access.</div>
      ) : loading ? (
        <div className="text-sm text-zinc-500 mt-2">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="text-sm text-zinc-500 mt-2">No pending approvals.</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {runs.map((r) => (
            <li
              key={r.id}
              className="text-sm flex items-center justify-between"
            >
              <Link to={`/finance/payroll/${r.id}`} className="underline">
                Run {r.id}
              </Link>
              <span className="text-xs text-zinc-500">
                {String(r.status || "").toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
