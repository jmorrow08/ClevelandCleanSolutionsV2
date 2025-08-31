import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";

type Row = {
  id: string;
  employeeId: string;
  jobId?: string | null;
  start?: any;
  end?: any;
  hours?: number;
  approvedInRunId?: string | null;
};

export default function AllTimesheetsAdmin() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [nameQuery, setNameQuery] = useState<string>("");
  const [onlyUnapproved, setOnlyUnapproved] = useState<boolean>(false);
  const [dateFilter, setDateFilter] = useState<string>(""); // YYYY-MM-DD

  useEffect(() => {
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        // Simple default: last 14 days
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 14);
        const qy = query(
          collection(db, "timesheets"),
          where("start", ">=", Timestamp.fromDate(start)),
          orderBy("start", "desc"),
          limit(500)
        );
        const snap = await getDocs(qy);
        const list: Row[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setRows(list);
      } catch (e) {
        // ignore errors silently on first pass
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const day = dateFilter.trim();
    return rows.filter((r) => {
      if (onlyUnapproved && r.approvedInRunId) return false;
      if (day) {
        const d = r.start?.toDate ? r.start.toDate() : undefined;
        const key = d ? d.toISOString().slice(0, 10) : "";
        if (key !== day) return false;
      }
      if (!q) return true;
      const hay = [r.employeeId, r.jobId || "", r.id].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, nameQuery, onlyUnapproved, dateFilter]);

  function formatDT(ts: any): string {
    try {
      const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
      if (!d) return "—";
      return d.toLocaleString();
    } catch {
      return "—";
    }
  }

  const totalHours = useMemo(
    () => filtered.reduce((sum, r) => sum + (Number(r.hours || 0) || 0), 0),
    [filtered]
  );

  return (
    <RoleGuard allow={["owner", "admin", "super_admin"]}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-500">All Timesheets (14 days)</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            placeholder="Search by employeeId/jobId/id"
            className="border rounded-md px-3 py-2 card-bg"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyUnapproved}
              onChange={(e) => setOnlyUnapproved(e.target.checked)}
            />
            Unapproved only
          </label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border rounded-md px-3 py-2 card-bg"
          />
        </div>

        <div className="overflow-x-auto rounded-lg card-bg shadow-elev-1">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Approved</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-3" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={6}>
                    No results.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-zinc-100 dark:border-zinc-700"
                  >
                    <td className="px-3 py-2">{formatDT(r.start)}</td>
                    <td className="px-3 py-2">{formatDT(r.end)}</td>
                    <td className="px-3 py-2">
                      {Number(r.hours || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">{r.employeeId}</td>
                    <td className="px-3 py-2">{r.jobId || "—"}</td>
                    <td className="px-3 py-2">
                      {r.approvedInRunId ? "Yes" : "No"}
                    </td>
                  </tr>
                ))
              )}
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
      </div>
    </RoleGuard>
  );
}
