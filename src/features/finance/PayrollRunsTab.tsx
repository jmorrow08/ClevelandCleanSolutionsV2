import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
  where,
} from "firebase/firestore";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { computeLastCompletedPeriod } from "../../services/payrollPeriods";
import {
  createPayrollRun,
  backfillRateSnapshots,
} from "../../services/queries/payroll";

type Run = {
  id: string;
  status?: string;
  periodStart?: any;
  periodEnd?: any;
  totalEarnings?: number;
};

type ScanPreview = {
  periodId: string;
  jobsCount: number;
  assignmentsCount: number;
  employees: Array<{
    employeeId: string;
    jobs: number;
    totalAmount: number;
    employeeName?: string;
  }>;
  missingRates: Array<{
    serviceHistoryId: string;
    employeeId: string;
    locationId?: string | null;
  }>;
  previewTotals?: { totalAmount?: number };
};

type DrawerRow = {
  id: string;
  employeeId: string;
  jobId?: string | null;
  amount?: number;
  units?: number;
  unitRate?: number;
  start?: any;
  serviceDate?: any;
  source?: string;
};

export default function PayrollRunsTab() {
  const { claims } = useAuth();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const [creatingRun, setCreatingRun] = useState(false);
  const [periodStartInput, setPeriodStartInput] = useState<string>("");
  const [periodEndInput, setPeriodEndInput] = useState<string>("");
  const [scan, setScan] = useState<ScanPreview | null>(null);
  const [drawerRun, setDrawerRun] = useState<Run | null>(null);
  const [drawerRows, setDrawerRows] = useState<DrawerRow[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillStartDate, setBackfillStartDate] = useState<string>("");
  const [backfillEndDate, setBackfillEndDate] = useState<string>("");
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
        const qy = query(
          collection(db, "payrollRuns"),
          orderBy("periodEnd", "desc")
        );
        const snap = await getDocs(qy);
        const list: Run[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setRuns(list);
        // Default period to current cycle
        const cycle = (settings?.payrollCycle as any) || {};
        const period = computeLastCompletedPeriod(new Date(), cycle);
        const end = period ? period.end : new Date();
        const start = period
          ? period.start
          : new Date(end.getTime() - 14 * 86400000);
        const toLocalDate = (d: Date) =>
          new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 10);
        setPeriodStartInput(toLocalDate(start));
        setPeriodEndInput(toLocalDate(end));
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

  function toDateFromInput(s: string): Date | null {
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function configureFunctionsForEmulator(fns: ReturnType<typeof getFunctions>) {
    try {
      // Only connect in dev when explicitly enabled
      if (
        import.meta.env.DEV &&
        (import.meta.env as any).VITE_USE_FIREBASE_EMULATOR === "true"
      ) {
        connectFunctionsEmulator(fns, "127.0.0.1", 5001);
      }
    } catch {}
  }

  async function doScan() {
    try {
      setBusy(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const fns = getFunctions();
      configureFunctionsForEmulator(fns);
      const callable = httpsCallable(fns, "payrollScan");
      const start = toDateFromInput(periodStartInput);
      const end = toDateFromInput(periodEndInput);
      if (!start || !end) throw new Error("Select a valid start/end date.");
      const res: any = await callable({
        periodStart: start.getTime(),
        periodEnd: end.getTime(),
      });
      setScan(res.data as ScanPreview);
      const mr = (res.data?.missingRates || []) as any[];
      if (mr.length)
        show({
          type: "info",
          message: `${mr.length} assignments are missing rates.`,
        });
      else
        show({ type: "success", message: "Scan complete. No missing rates." });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Scan failed" });
    } finally {
      setBusy(false);
    }
  }

  async function doGenerate() {
    try {
      setBusy(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const fns = getFunctions();
      configureFunctionsForEmulator(fns);
      const callable = httpsCallable(fns, "payrollGenerate");
      const start = toDateFromInput(periodStartInput);
      const end = toDateFromInput(periodEndInput);
      if (!start || !end) throw new Error("Select a valid start/end date.");
      const gen: any = await callable({
        periodStart: start.getTime(),
        periodEnd: end.getTime(),
        periodId: scan?.periodId,
      });
      show({
        type: "success",
        message: `Generated ${gen.data?.created || 0} drafts.`,
      });
      // Refresh runs list
      const db = getFirestore();
      const qy = query(
        collection(db, "payrollRuns"),
        orderBy("periodEnd", "desc")
      );
      const snap = await getDocs(qy);
      const fresh: Run[] = [];
      snap.forEach((d) => fresh.push({ id: d.id, ...(d.data() as any) }));
      setRuns(fresh);
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Generate failed" });
    } finally {
      setBusy(false);
    }
  }

  async function doCreatePayrollRun() {
    try {
      setCreatingRun(true);
      const start = toDateFromInput(periodStartInput);
      const end = toDateFromInput(periodEndInput);
      if (!start || !end) throw new Error("Select a valid start/end date.");

      const result = await createPayrollRun(start, end);

      show({
        type: "success",
        message: `Payroll run created successfully with ID: ${result.id}`,
      });

      // Refresh runs list
      const db = getFirestore();
      const qy = query(
        collection(db, "payrollRuns"),
        orderBy("periodEnd", "desc")
      );
      const snap = await getDocs(qy);
      const fresh: Run[] = [];
      snap.forEach((d) => fresh.push({ id: d.id, ...(d.data() as any) }));
      setRuns(fresh);

      // Navigate to the new run detail
      window.location.href = `/finance/payroll/${result.id}`;
    } catch (e: any) {
      console.error("Create payroll run error:", e);
      show({
        type: "error",
        message:
          e?.message ||
          "Failed to create payroll run. Please check your permissions and try again.",
      });
    } finally {
      setCreatingRun(false);
    }
  }

  async function openDrawer(run: Run) {
    try {
      setDrawerRun(run);
      setDrawerLoading(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const qy = query(
        collection(db, "timesheets"),
        where("approvedInRunId", "==", run.id)
      );
      const snap = await getDocs(qy);
      const list: DrawerRow[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setDrawerRows(list);
    } catch (_) {
      setDrawerRows([]);
    } finally {
      setDrawerLoading(false);
    }
  }

  function closeDrawer() {
    setDrawerRun(null);
    setDrawerRows([]);
    setDrawerLoading(false);
  }

  async function handleBackfill() {
    if (!backfillStartDate || !backfillEndDate) {
      show({ type: "error", message: "Please select start and end dates" });
      return;
    }

    setBackfilling(true);
    try {
      const startDate = new Date(backfillStartDate);
      const endDate = new Date(backfillEndDate);

      const result = await backfillRateSnapshots(startDate, endDate);

      show({
        type: "success",
        message: `Backfill completed: ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors`,
      });

      // Reset form
      setBackfillStartDate("");
      setBackfillEndDate("");
    } catch (error) {
      console.error("Backfill error:", error);
      show({
        type: "error",
        message: error instanceof Error ? error.message : "Backfill failed",
      });
    } finally {
      setBackfilling(false);
    }
  }

  function fmt(ts: any): string {
    try {
      const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
      if (!d) return "—";
      return d.toLocaleString();
    } catch {
      return "—";
    }
  }

  return (
    <div className="space-y-3">
      <RoleGuard allow={["admin", "owner", "super_admin"]}>
        <div className="rounded-lg p-3 card-bg shadow-elev-1">
          <div className="text-sm font-medium mb-2">Payroll Runs</div>
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            For scanning jobs and generating timesheets, use{" "}
            <a href="/finance/payroll-prep" className="underline">
              Payroll Prep
            </a>
            .
          </div>
        </div>
      </RoleGuard>

      <RoleGuard allow={["admin", "owner", "super_admin"]}>
        <div className="rounded-lg p-3 card-bg shadow-elev-1 mt-4">
          <div className="text-sm font-medium mb-2">
            Backfill Rate Snapshots
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <label className="block">
              <div className="text-xs text-zinc-500">Start Date</div>
              <input
                type="date"
                className="mt-1 w-full px-2 py-1.5 rounded-md border card-bg"
                value={backfillStartDate}
                onChange={(e) => setBackfillStartDate(e.target.value)}
              />
            </label>
            <label className="block">
              <div className="text-xs text-zinc-500">End Date</div>
              <input
                type="date"
                className="mt-1 w-full px-2 py-1.5 rounded-md border card-bg"
                value={backfillEndDate}
                onChange={(e) => setBackfillEndDate(e.target.value)}
              />
            </label>
            <div className="md:col-span-2">
              <button
                className={`w-full px-3 py-1.5 rounded-md text-white ${
                  backfilling ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
                }`}
                onClick={handleBackfill}
                disabled={backfilling}
              >
                {backfilling ? "Backfilling…" : "Backfill Rate Snapshots"}
              </button>
            </div>
          </div>
          <div className="text-xs text-zinc-500 mt-2">
            This will scan timesheets in the date range and add missing rate
            snapshots.
          </div>
        </div>
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
              className="py-2 border-b border-zinc-100 dark:border-zinc-700 flex items-center justify-between"
            >
              <div>
                <Link to={`/finance/payroll/${r.id}`} className="underline">
                  Run {r.id}
                </Link>{" "}
                — {String(r.status || "").toUpperCase()}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 rounded-md border card-bg"
                  onClick={() => openDrawer(r)}
                >
                  View Timesheets
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {drawerRun && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/40" onClick={closeDrawer} />
          <div className="absolute right-0 top-0 h-full w-[640px] max-w-[96vw] card-bg shadow-elev-3 p-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-medium">
                Timesheets — {drawerRun.id}
              </div>
              <button className="text-sm underline" onClick={closeDrawer}>
                Close
              </button>
            </div>
            {drawerLoading ? (
              <div className="text-sm text-zinc-500 mt-3">Loading…</div>
            ) : drawerRows.length === 0 ? (
              <div className="text-sm text-zinc-500 mt-3">No entries.</div>
            ) : (
              <div className="overflow-x-auto mt-3">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-zinc-500">
                    <tr>
                      <th className="px-2 py-1">Employee</th>
                      <th className="px-2 py-1">Job</th>
                      <th className="px-2 py-1">Start</th>
                      <th className="px-2 py-1">Units</th>
                      <th className="px-2 py-1">Rate</th>
                      <th className="px-2 py-1">Amount</th>
                      <th className="px-2 py-1">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drawerRows.map((t) => (
                      <tr
                        key={t.id}
                        className="border-t border-zinc-100 dark:border-zinc-700"
                      >
                        <td className="px-2 py-1">{t.employeeId}</td>
                        <td className="px-2 py-1">{t.jobId || "—"}</td>
                        <td className="px-2 py-1">
                          {fmt(t.start || t.serviceDate)}
                        </td>
                        <td className="px-2 py-1">
                          {Number(t.units || 0).toFixed(0)}
                        </td>
                        <td className="px-2 py-1">
                          {Number(t.unitRate || 0).toFixed(2)}
                        </td>
                        <td className="px-2 py-1">
                          {Number(t.amount || 0).toFixed(2)}
                        </td>
                        <td className="px-2 py-1">{t.source || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
