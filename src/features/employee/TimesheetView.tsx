import { useEffect, useMemo, useState } from "react";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  getDocs,
} from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";
import { useSettings } from "../../context/SettingsContext";
import { computeLastCompletedPeriod } from "../../services/payrollPeriods";
import {
  calculateTimesheetEarnings,
  formatCurrency,
} from "../../utils/rateUtils";
import type { Timesheet } from "../../types/timesheet";

type EditingState = {
  id?: string | null;
  startInput: string;
  endInput: string;
  jobId: string;
  employeeComment?: string;
};

type PayrollHistoryItem = {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  totalHours: number;
  totalEarnings: number;
  status: string;
};

export default function TimesheetView() {
  const { user, claims } = useAuth();
  const { settings } = useSettings();
  const { show } = useToast();
  const [rows, setRows] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [payrollHistory, setPayrollHistory] = useState<PayrollHistoryItem[]>(
    []
  );
  const [historyLoading, setHistoryLoading] = useState(true);
  const [lockedRunIds, setLockedRunIds] = useState<Set<string>>(new Set());

  // Debug logging and token refresh
  useEffect(() => {
    // Force token refresh to ensure claims are up to date
    if (user) {
      user
        .getIdToken(true)
        .then(() => {
          // console.log("Token refreshed successfully");
        })
        .catch((error) => {
          // console.error("Token refresh failed:", error);
        });
    }
  }, [user, claims]);

  // Load locked payroll run IDs
  useEffect(() => {
    async function loadLockedRuns() {
      try {
        const db = getFirestore();

        // Query for locked payroll runs
        const lockedRunsQuery = query(
          collection(db, "payrollRuns"),
          where("status", "==", "locked")
        );

        const lockedRunsSnapshot = await getDocs(lockedRunsQuery);
        const lockedIds = new Set<string>();

        lockedRunsSnapshot.forEach((doc) => {
          lockedIds.add(doc.id);
        });

        setLockedRunIds(lockedIds);
      } catch (error) {
        // console.error("Error loading locked runs:", error);
      }
    }

    loadLockedRuns();
  }, []);

  // Calculate current pay period
  const currentPeriod = useMemo(() => {
    const cycle = (settings?.payrollCycle as any) || {};
    return computeLastCompletedPeriod(new Date(), cycle);
  }, [settings]);

  // Calculate estimated earnings for current period
  const currentPeriodEarnings = useMemo(() => {
    if (!currentPeriod) return 0;

    return rows.reduce((total, timesheet) => {
      const startDate = timesheet.start?.toDate
        ? timesheet.start.toDate()
        : null;
      if (!startDate) return total;

      // Check if timesheet is within current period
      if (startDate >= currentPeriod.start && startDate < currentPeriod.end) {
        return total + calculateTimesheetEarnings(timesheet);
      }
      return total;
    }, 0);
  }, [rows, currentPeriod]);

  // Calculate total hours for current period
  const currentPeriodHours = useMemo(() => {
    if (!currentPeriod) return 0;

    return rows.reduce((total, timesheet) => {
      const startDate = timesheet.start?.toDate
        ? timesheet.start.toDate()
        : null;
      if (!startDate) return total;

      // Check if timesheet is within current period
      if (startDate >= currentPeriod.start && startDate < currentPeriod.end) {
        return total + (Number(timesheet.hours || 0) || 0);
      }
      return total;
    }, 0);
  }, [rows, currentPeriod]);

  useEffect(() => {
    if (!user?.uid) return;
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        const db = getFirestore();
        // Show last 30 days of entries for the employee
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        const qy = query(
          collection(db, "timesheets"),
          where("employeeId", "==", user.uid),
          where("start", ">=", Timestamp.fromDate(start)),
          orderBy("start", "desc"),
          limit(200)
        );
        unsub = onSnapshot(
          qy,
          (snap) => {
            const list: Timesheet[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
            setRows(list);
            setLoading(false);
          },
          (error) => {
            // console.error("Timesheet query error:", error);
            show({
              type: "error",
              message: `Failed to load timesheets: ${error.message}`,
            });
            setLoading(false);
          }
        );
      } catch (error: any) {
        // console.error("Timesheet setup error:", error);
        show({
          type: "error",
          message: `Failed to setup timesheet query: ${error.message}`,
        });
        setLoading(false);
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, [user?.uid, show]);

  // Load payroll history
  useEffect(() => {
    if (!user?.uid) return;

    async function loadPayrollHistory() {
      try {
        setHistoryLoading(true);
        const db = getFirestore();

        // Query locked payroll runs
        const runsQuery = query(
          collection(db, "payrollRuns"),
          where("status", "==", "locked"),
          orderBy("periodEnd", "desc"),
          limit(12)
        );

        const runsSnap = await getDocs(runsQuery);
        const history: PayrollHistoryItem[] = [];

        for (const runDoc of runsSnap.docs) {
          const runData = runDoc.data() as any;

          // Query timesheets for this employee in this run
          const timesheetsQuery = query(
            collection(db, "timesheets"),
            where("employeeId", "==", user!.uid),
            where("approvedInRunId", "==", runDoc.id)
          );

          const timesheetsSnap = await getDocs(timesheetsQuery);
          let totalHours = 0;
          let totalEarnings = 0;

          timesheetsSnap.forEach((tsDoc) => {
            const tsData = tsDoc.data() as any;
            const hours = Number(tsData.hours || 0) || 0;

            totalHours += hours;
            totalEarnings += calculateTimesheetEarnings(tsData);
          });

          if (totalHours > 0 || totalEarnings > 0) {
            history.push({
              id: runDoc.id,
              periodStart: runData.periodStart?.toDate
                ? runData.periodStart.toDate()
                : new Date(runData.periodStart),
              periodEnd: runData.periodEnd?.toDate
                ? runData.periodEnd.toDate()
                : new Date(runData.periodEnd),
              totalHours,
              totalEarnings,
              status: runData.status || "locked",
            });
          }
        }

        setPayrollHistory(history);
      } catch (error: any) {
        // console.error("Payroll history load error:", error);
        show({
          type: "error",
          message: `Failed to load payroll history: ${error.message}`,
        });
      } finally {
        setHistoryLoading(false);
      }
    }

    loadPayrollHistory();
  }, [user?.uid, show]);

  const totalHours = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.hours || 0) || 0), 0),
    [rows]
  );

  function formatDT(ts: any): string {
    try {
      const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
      if (!d) return "—";
      return d.toLocaleString();
    } catch {
      return "—";
    }
  }

  function toLocalInputValue(d?: Date | null): string {
    if (!d) return "";
    const dt = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return dt.toISOString().slice(0, 16);
  }

  function computeHours(startStr: string, endStr: string): number {
    try {
      const s = startStr ? new Date(startStr) : null;
      const e = endStr ? new Date(endStr) : null;
      if (!s || !e) return 0;
      const diff = (e.getTime() - s.getTime()) / 3600000;
      return Math.max(0, Math.round(diff * 100) / 100);
    } catch {
      return 0;
    }
  }

  function openNew() {
    const now = new Date();
    const halfHourAgo = new Date(now.getTime() - 30 * 60000);
    setEditing({
      id: null,
      startInput: toLocalInputValue(halfHourAgo),
      endInput: toLocalInputValue(now),
      jobId: "",
    });
  }

  function openEdit(row: Timesheet) {
    const s = row.start?.toDate ? (row.start as any).toDate() : null;
    const e = row.end?.toDate ? (row.end as any).toDate() : null;
    setEditing({
      id: row.id,
      startInput: toLocalInputValue(s),
      endInput: toLocalInputValue(e),
      jobId: row.jobId || "",
      employeeComment: row.employeeComment || "",
    });
  }

  async function approveTimesheet(timesheetId: string) {
    if (!user?.uid) return;
    try {
      setSaving(true);
      const db = getFirestore();
      await updateDoc(doc(db, "timesheets", timesheetId), {
        employeeApproved: true,
        employeeComment: null,
        updatedAt: serverTimestamp(),
      });
      show({ type: "success", message: "Timesheet approved." });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to approve." });
    } finally {
      setSaving(false);
    }
  }

  async function saveEditing() {
    if (!user?.uid || !editing) return;
    const hours = computeHours(editing.startInput, editing.endInput);
    if (hours <= 0) {
      show({ type: "error", message: "End must be after start." });
      return;
    }
    try {
      setSaving(true);
      const db = getFirestore();
      const payload: any = {
        employeeId: user.uid,
        jobId: editing.jobId || null,
        start: Timestamp.fromDate(new Date(editing.startInput)),
        end: Timestamp.fromDate(new Date(editing.endInput)),
        hours,
        updatedAt: serverTimestamp(),
      };
      if (editing.id) {
        // For existing timesheets, preserve employeeApproved as false when editing
        // and include employeeComment if provided
        payload.employeeApproved = false;
        if (editing.employeeComment) {
          payload.employeeComment = editing.employeeComment;
        }
        await updateDoc(doc(db, "timesheets", editing.id), payload);
        show({ type: "success", message: "Timesheet updated." });
      } else {
        await addDoc(collection(db, "timesheets"), {
          ...payload,
          // Set defaults for new timesheets
          employeeApproved: false,
          adminApproved: false,
          rateSnapshot: null,
          units: 1,
          createdAt: serverTimestamp(),
        });
        show({ type: "success", message: "Timesheet added." });
      }
      setEditing(null);
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  // Check if timesheet is locked (has approvedInRunId and the run is locked)
  function isTimesheetLocked(timesheet: Timesheet): boolean {
    if (!timesheet.approvedInRunId) {
      return false;
    }

    // Check if the payroll run is locked
    return lockedRunIds.has(timesheet.approvedInRunId);
  }

  return (
    <div className="space-y-6">
      {/* Current Period Summary */}
      {currentPeriod && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
            Current Pay Period Summary
          </h3>
          <div className="text-xs text-blue-700 dark:text-blue-300 mb-2">
            {currentPeriod.start.toLocaleDateString()} -{" "}
            {currentPeriod.end.toLocaleDateString()}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-blue-600 dark:text-blue-400">Hours</div>
              <div className="font-medium text-blue-900 dark:text-blue-100">
                {currentPeriodHours.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-blue-600 dark:text-blue-400">
                Estimated Earnings
              </div>
              <div className="font-medium text-blue-900 dark:text-blue-100">
                {formatCurrency(currentPeriodEarnings)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payroll History */}
      <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="text-lg font-medium">Payroll History</h3>
        </div>
        <div className="p-4">
          {historyLoading ? (
            <div className="text-sm text-zinc-500">
              Loading payroll history...
            </div>
          ) : payrollHistory.length === 0 ? (
            <div className="text-sm text-zinc-500">
              No payroll history available.
            </div>
          ) : (
            <div className="space-y-3">
              {payrollHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {item.periodStart.toLocaleDateString()} -{" "}
                      {item.periodEnd.toLocaleDateString()}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {item.totalHours.toFixed(2)} hours
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-green-600 dark:text-green-400">
                      {formatCurrency(item.totalEarnings)}
                    </div>
                    <div className="text-xs text-zinc-500 capitalize">
                      {item.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Timesheet Section */}
      <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">My Timesheets (30 days)</h3>
            <RoleGuard allow={["owner", "super_admin", "admin"]}>
              <button
                className="px-3 py-1.5 rounded-md border card-bg text-sm"
                onClick={openNew}
              >
                Add Entry
              </button>
            </RoleGuard>
          </div>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-zinc-500">No entries.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg card-bg shadow-elev-1">
              <table className="min-w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Start</th>
                    <th className="px-3 py-2">End</th>
                    <th className="px-3 py-2">Hours</th>
                    <th className="px-3 py-2">Job ID</th>
                    <th className="px-3 py-2">Status/Actions</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-zinc-100 dark:border-zinc-700"
                    >
                      <td className="px-3 py-2">{formatDT(r.start)}</td>
                      <td className="px-3 py-2">{formatDT(r.end)}</td>
                      <td className="px-3 py-2">
                        {Number(r.hours || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">{r.jobId || "—"}</td>
                      <td className="px-3 py-2">
                        {r.employeeApproved ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Approved
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <button
                              className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                              onClick={() => approveTimesheet(r.id!)}
                              disabled={saving || isTimesheetLocked(r)}
                            >
                              {saving ? "Saving..." : "Approve"}
                            </button>
                            <button
                              className="text-xs text-blue-600 dark:text-blue-400 underline"
                              onClick={() => openEdit(r)}
                              disabled={isTimesheetLocked(r)}
                            >
                              Request change
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="text-blue-600 dark:text-blue-400 underline disabled:opacity-50"
                          onClick={() => openEdit(r)}
                          disabled={isTimesheetLocked(r)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-200 dark:border-zinc-700">
                    <td className="px-3 py-2" colSpan={2}>
                      Total
                    </td>
                    <td className="px-3 py-2">{totalHours.toFixed(2)}</td>
                    <td className="px-3 py-2" colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="rounded-lg p-3 card-bg shadow-elev-2 border border-zinc-200 dark:border-zinc-700">
          <div className="text-sm font-medium mb-2">
            {editing.id ? "Edit Entry" : "Add Entry"}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <label className="block">
              <div className="text-xs text-zinc-500">Start</div>
              <input
                type="datetime-local"
                className="mt-1 w-full px-2 py-1.5 rounded-md border card-bg"
                value={editing.startInput}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev ? { ...prev, startInput: e.target.value } : prev
                  )
                }
              />
            </label>
            <label className="block">
              <div className="text-xs text-zinc-500">End</div>
              <input
                type="datetime-local"
                className="mt-1 w-full px-2 py-1.5 rounded-md border card-bg"
                value={editing.endInput}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev ? { ...prev, endInput: e.target.value } : prev
                  )
                }
              />
            </label>
            <label className="block md:col-span-2">
              <div className="text-xs text-zinc-500">Job ID (optional)</div>
              <input
                type="text"
                placeholder="job-123"
                className="mt-1 w-full px-2 py-1.5 rounded-md border card-bg"
                value={editing.jobId}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev ? { ...prev, jobId: e.target.value } : prev
                  )
                }
              />
            </label>
            {editing.id && (
              <label className="block md:col-span-2">
                <div className="text-xs text-zinc-500">Comment (optional)</div>
                <textarea
                  placeholder="Add a comment about this change..."
                  className="mt-1 w-full px-2 py-1.5 rounded-md border card-bg"
                  value={editing.employeeComment || ""}
                  onChange={(e) =>
                    setEditing((prev) =>
                      prev ? { ...prev, employeeComment: e.target.value } : prev
                    )
                  }
                  rows={3}
                />
              </label>
            )}
            <div className="md:col-span-2 text-xs text-zinc-500">
              Hours:{" "}
              {computeHours(editing.startInput, editing.endInput).toFixed(2)}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              className="px-3 py-1.5 rounded-md border card-bg"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className={`px-3 py-1.5 rounded-md text-white ${
                saving ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
              }`}
              onClick={saveEditing}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
