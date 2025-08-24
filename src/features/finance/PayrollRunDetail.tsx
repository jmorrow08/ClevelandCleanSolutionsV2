import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";
import {
  approveTimesheets,
  calculateRunTotals,
} from "../../services/queries/payroll";
import { useAuth } from "../../context/AuthContext";

type RunDoc = {
  id: string;
  status?: "draft" | "review" | "approved" | "locked";
  periodStart?: any;
  periodEnd?: any;
  totals?: any;
};

type Timesheet = {
  id: string;
  employeeId: string;
  jobId?: string | null;
  start?: any;
  end?: any;
  hours?: number;
  approvedInRunId?: string | null;
};

export default function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { show } = useToast();
  const { claims } = useAuth();
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<RunDoc | null>(null);
  const [tsLoading, setTsLoading] = useState(true);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const canRead = !!(claims?.admin || claims?.owner || claims?.super_admin);
    if (!canRead || !id) {
      setLoading(false);
      setRun(null);
      return;
    }
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const snap = await getDoc(doc(db, "payrollRuns", id));
        if (snap.exists()) setRun({ id, ...(snap.data() as any) });
      } finally {
        setLoading(false);
      }
    })();
  }, [id, claims]);

  useEffect(() => {
    const canRead = !!(claims?.admin || claims?.owner || claims?.super_admin);
    if (!canRead || !id) {
      setTimesheets([]);
      setTsLoading(false);
      return;
    }
    (async () => {
      setTsLoading(true);
      try {
        const db = getFirestore();
        // List all timesheets in the period; mark approved ones
        const runRef = doc(db, "payrollRuns", id);
        const runSnap = await getDoc(runRef);
        const r: any = runSnap.data() || {};
        const qy = query(
          collection(db, "timesheets"),
          where("start", ">=", r?.periodStart),
          where("start", "<", r?.periodEnd),
          orderBy("start", "desc")
        );
        const snap = await getDocs(qy);
        const list: Timesheet[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setTimesheets(list);
      } finally {
        setTsLoading(false);
      }
    })();
  }, [id, claims]);

  const approvedCount = useMemo(
    () => timesheets.filter((t) => t.approvedInRunId === id).length,
    [timesheets, id]
  );

  async function doApproveSelected() {
    if (!id) return;
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (ids.length === 0) return;
    try {
      setBusy(true);
      const res = await approveTimesheets(id, ids);
      show({ type: "success", message: `Approved ${res.count} entries.` });
      // Refresh list
      const db = getFirestore();
      const runRef = doc(db, "payrollRuns", id);
      const runSnap = await getDoc(runRef);
      const r: any = runSnap.data() || {};
      const qy = query(
        collection(db, "timesheets"),
        where("start", ">=", r?.periodStart),
        where("start", "<", r?.periodEnd),
        orderBy("start", "desc")
      );
      const snap = await getDocs(qy);
      const list: Timesheet[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setTimesheets(list);
      setSelected({});
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Approve failed" });
    } finally {
      setBusy(false);
    }
  }

  async function doLockRun() {
    if (!id) return;
    try {
      setBusy(true);
      const totals = await calculateRunTotals(id);
      const db = getFirestore();
      await updateDoc(doc(db, "payrollRuns", id), {
        status: "locked",
        totals,
        totalEarnings: totals.totalEarnings,
        updatedAt: serverTimestamp(),
      } as any);
      show({ type: "success", message: "Run locked with totals." });
      setRun((prev) => (prev ? { ...prev, status: "locked", totals } : prev));
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Lock failed" });
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!run?.totals) return;
    const lines: string[] = ["employeeId,hours,earnings,hourlyRate"];
    for (const [empId, v] of Object.entries<any>(run.totals.byEmployee || {})) {
      const hours = Number(v.hours || 0).toFixed(2);
      const earnings = Number(v.earnings || 0).toFixed(2);
      const rate = v.hourlyRate != null ? Number(v.hourlyRate).toFixed(2) : "";
      lines.push(`${empId},${hours},${earnings},${rate}`);
    }
    lines.push(
      `TOTAL,${Number(run.totals.totalHours || 0).toFixed(2)},${Number(
        run.totals.totalEarnings || 0
      ).toFixed(2)},`
    );
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const end = run.periodEnd?.toDate ? run.periodEnd.toDate() : new Date();
    a.download = `payroll-run-${id}-${end.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function fmt(ts: any): string {
    try {
      const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
      if (!d) return "—";
      return d.toLocaleDateString();
    } catch {
      return "—";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <button
            className="text-sm underline mr-2"
            onClick={() => navigate("/finance")}
          >
            Back
          </button>
          <span className="font-medium">Payroll Run</span>
          {run?.id && (
            <span className="ml-2 text-xs text-zinc-500">{run.id}</span>
          )}
        </div>
        <div className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-700">
          {String(run?.status || "draft").toUpperCase()}
        </div>
      </div>

      {!(claims?.admin || claims?.owner || claims?.super_admin) ? (
        <div className="text-sm text-zinc-500">You do not have access.</div>
      ) : loading || !run ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1">
          <div className="text-sm">
            Period: {fmt(run.periodStart)} - {fmt(run.periodEnd)}
          </div>
          {run.totals && (
            <div className="mt-1 text-sm text-zinc-500">
              Totals: hours {Number(run.totals.totalHours || 0).toFixed(2)},
              earnings ${Number(run.totals.totalEarnings || 0).toFixed(2)}
            </div>
          )}
          <RoleGuard allow={["owner", "super_admin"]}>
            <div className="mt-2 flex items-center gap-2">
              <button
                className={`px-3 py-1.5 rounded-md text-white ${
                  busy ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
                }`}
                onClick={doLockRun}
                disabled={busy || run.status === "locked"}
              >
                {busy
                  ? "Working…"
                  : run.status === "locked"
                  ? "Locked"
                  : "Lock & Compute Totals"}
              </button>
              <button
                className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                onClick={exportCsv}
                disabled={!run.totals}
              >
                Export CSV
              </button>
            </div>
          </RoleGuard>
        </div>
      )}

      <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1">
        <div className="flex items-center justify-between">
          <div className="font-medium">Timesheets in Period</div>
          <div className="text-sm text-zinc-500">Approved: {approvedCount}</div>
        </div>

        {tsLoading ? (
          <div className="text-sm text-zinc-500 mt-2">Loading…</div>
        ) : timesheets.length === 0 ? (
          <div className="text-sm text-zinc-500 mt-2">No entries.</div>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full text-sm">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="px-2 py-1">Approve</th>
                  <th className="px-2 py-1">Employee</th>
                  <th className="px-2 py-1">Start</th>
                  <th className="px-2 py-1">End</th>
                  <th className="px-2 py-1">Hours</th>
                  <th className="px-2 py-1">Job</th>
                  <th className="px-2 py-1">Approved</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((t) => {
                  const isApproved = t.approvedInRunId === id;
                  const start = t.start?.toDate
                    ? t.start.toDate().toLocaleString()
                    : "—";
                  const end = t.end?.toDate
                    ? t.end.toDate().toLocaleString()
                    : "—";
                  return (
                    <tr
                      key={t.id}
                      className="border-t border-zinc-100 dark:border-zinc-700"
                    >
                      <td className="px-2 py-1">
                        <RoleGuard allow={["owner", "super_admin"]}>
                          <input
                            type="checkbox"
                            disabled={
                              isApproved || busy || run?.status === "locked"
                            }
                            checked={!!selected[t.id]}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [t.id]: e.target.checked,
                              }))
                            }
                          />
                        </RoleGuard>
                      </td>
                      <td className="px-2 py-1">{t.employeeId}</td>
                      <td className="px-2 py-1">{start}</td>
                      <td className="px-2 py-1">{end}</td>
                      <td className="px-2 py-1">
                        {Number(t.hours || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1">{t.jobId || "—"}</td>
                      <td className="px-2 py-1">{isApproved ? "Yes" : "No"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <RoleGuard allow={["owner", "super_admin"]}>
          <div className="mt-3 flex items-center justify-end">
            <button
              className={`px-3 py-1.5 rounded-md text-white ${
                busy ? "bg-zinc-400" : "bg-green-600 hover:bg-green-700"
              }`}
              onClick={doApproveSelected}
              disabled={busy || run?.status === "locked"}
            >
              {busy ? "Working…" : "Approve Selected"}
            </button>
          </div>
        </RoleGuard>
      </div>
    </div>
  );
}
