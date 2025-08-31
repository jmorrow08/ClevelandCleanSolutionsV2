import { useEffect, useMemo, useState } from "react";
import { subDays } from "date-fns";
import { getDailyRange } from "../../services/queries/resolvers";

type Row = Record<string, string | number>;

function toDateKey(date: Date): number {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return Number(`${y}${m}${d}`);
}

function fromDateKey(key?: number): string {
  const s = String(key || "");
  if (s.length !== 8) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function exportCsv(filename: string, rows: Row[]) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const bom = "\uFEFF";
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")
    ),
  ].join("\n");
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    "revenue" | "ar" | "jobs" | "payroll" | "leads" | "churn"
  >("revenue");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const end = new Date();
        const start = subDays(end, 90);
        const data = await getDailyRange(toDateKey(start), toDateKey(end));
        const r: Row[] = data.map((d: any) => ({
          date: fromDateKey(d?.dateKey),
          revenue: Number(d?.kpis?.revenue || 0) || 0,
          ar_total: Number(d?.kpis?.arBuckets?.totalOutstanding || 0) || 0,
          jobsCompleted: Number(d?.kpis?.jobsCompleted || 0) || 0,
          payrollPct:
            Math.round((Number(d?.kpis?.payrollPct || 0) || 0) * 1000) / 10,
          newLeads: Number(d?.kpis?.newLeads || 0) || 0,
          churnRate:
            Math.round((Number(d?.kpis?.churnRate || 0) || 0) * 1000) / 10,
        }));
        setRows(r);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const visible = useMemo(() => {
    const colsByTab: Record<string, string[]> = {
      revenue: ["date", "revenue"],
      ar: ["date", "ar_total"],
      jobs: ["date", "jobsCompleted"],
      payroll: ["date", "payrollPct"],
      leads: ["date", "newLeads"],
      churn: ["date", "churnRate"],
    };
    const cols = colsByTab[tab] || ["date"];
    return rows.map((r) => {
      const x: Row = {};
      cols.forEach((c) => (x[c] = r[c]));
      return x;
    });
  }, [rows, tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Analytics Reports</h2>
        <button
          onClick={() => exportCsv(`${tab}-report.csv`, visible)}
          className="px-3 py-1 rounded-md text-sm bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
        >
          Export CSV
        </button>
      </div>
      <div className="flex gap-2 text-sm">
        {[
          { k: "revenue", label: "Revenue" },
          { k: "ar", label: "A/R Aging" },
          { k: "jobs", label: "Jobs" },
          { k: "payroll", label: "Payroll %" },
          { k: "leads", label: "Leads" },
          { k: "churn", label: "Churn" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as any)}
            className={`px-3 py-1 rounded-md ${
              tab === t.k
                ? "bg-zinc-900 text-white"
                : "bg-zinc-200 dark:bg-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg card-bg shadow-elev-1 overflow-x-auto">
        {loading ? (
          <div className="p-4 text-sm text-zinc-500">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="p-4 text-sm text-zinc-500">No data.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                {Object.keys(visible[0]).map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-700"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, idx) => (
                <tr
                  key={idx}
                  className="odd:bg-zinc-50/40 dark:odd:bg-zinc-900/40"
                >
                  {Object.keys(visible[0]).map((h) => (
                    <td key={h} className="px-3 py-2 whitespace-nowrap">
                      {String(r[h] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
