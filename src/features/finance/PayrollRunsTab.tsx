import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { computeLastCompletedPeriod } from "../../services/payrollPeriods";

type Run = {
  id: string;
  status?: string;
  periodStart?: any;
  periodEnd?: any;
  totalEarnings?: number;
};

export default function PayrollRunsTab() {
  const { claims } = useAuth();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<Run[]>([]);
  const [creating, setCreating] = useState(false);
  const { show } = useToast();
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
          orderBy("periodEnd", "desc")
        );
        const snap = await getDocs(q);
        const list: Run[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setRuns(list);
      } catch (e: any) {
        console.error("payrollRuns load error", e);
        setRuns([]);
        show({ type: "error", message: e?.message || "Failed to load runs" });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [claims]);
  return (
    <div className="space-y-3">
      <RoleGuard allow={["admin", "owner", "super_admin"]}>
        <button
          className={`px-3 py-1.5 rounded-md text-white ${
            creating ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
          }`}
          disabled={creating}
          onClick={async () => {
            try {
              setCreating(true);
              // Compute last completed period from org settings
              const cycle = (settings?.payrollCycle as any) || {};
              const period = computeLastCompletedPeriod(new Date(), cycle);
              // Fallback to previous biweekly Monday-aligned window if settings are not available
              const end = period
                ? period.end
                : (() => {
                    const x = new Date();
                    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
                    return x;
                  })();
              const start = period
                ? period.start
                : (() => {
                    const x = new Date(end);
                    x.setDate(x.getDate() - 14);
                    return x;
                  })();
              const db = getFirestore();
              const optimistic: Run = {
                id: `tmp-${Math.random().toString(36).slice(2)}`,
                status: "draft",
                periodStart: start,
                periodEnd: end,
              } as any;
              setRuns((prev) => [optimistic, ...prev]);
              const ref = await addDoc(collection(db, "payrollRuns"), {
                periodStart: Timestamp.fromDate(start),
                periodEnd: Timestamp.fromDate(end),
                status: "draft",
                createdAt: serverTimestamp(),
              });
              setRuns((prev) => [
                { ...optimistic, id: ref.id },
                ...prev.filter((r) => r.id !== optimistic.id),
              ]);
              show({ type: "success", message: "Draft payroll run created." });
            } catch (e: any) {
              setRuns((prev) => prev.filter((r) => !r.id.startsWith("tmp-")));
              show({
                type: "error",
                message: e?.message || "Failed to create draft",
              });
            } finally {
              setCreating(false);
            }
          }}
        >
          {creating ? "Creating…" : "Create Draft (last pay period)"}
        </button>
      </RoleGuard>
      {!(claims?.admin || claims?.owner || claims?.super_admin) ? (
        <div className="text-sm text-zinc-500">You do not have access.</div>
      ) : loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="text-sm text-zinc-500">No payroll runs.</div>
      ) : (
        <ul className="text-sm">
          {runs.slice(0, 20).map((r) => (
            <li
              key={r.id}
              className="py-2 border-b border-zinc-100 dark:border-zinc-700"
            >
              <Link to={`/finance/payroll/${r.id}`} className="underline">
                Run {r.id}
              </Link>{" "}
              — {String(r.status || "").toUpperCase()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
