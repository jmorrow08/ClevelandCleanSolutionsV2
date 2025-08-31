import { useEffect, useMemo, useState } from "react";
import { subDays } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  getDailyRange,
  getLatestDailyAnalytics,
} from "../../services/queries/resolvers";
import type { AnalyticsDailyDoc } from "../../services/queries/resolvers";
import { Link } from "react-router-dom";
import { ServiceAgreementProjectionService } from "../../services/serviceAgreementProjections";

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState<AnalyticsDailyDoc | null>(null);
  const [revenueSeries, setRevenueSeries] = useState<
    Array<{ date: string; amount: number }>
  >([]);
  const [projectedRevenueSeries, setProjectedRevenueSeries] = useState<
    Array<{ date: string; amount: number }>
  >([]);
  const [jobsSeries, setJobsSeries] = useState<
    Array<{ date: string; count: number }>
  >([]);
  const [payrollPctSeries, setPayrollPctSeries] = useState<
    Array<{ date: string; pct: number }>
  >([]);

  useEffect(() => {
    async function load() {
      try {
        // Latest daily snapshot for KPI strip + AR
        const latestDoc = await getLatestDailyAnalytics();
        setLatest(latestDoc);

        // Last 90 days series
        const end = new Date();
        const start = subDays(end, 90);
        const startKey = toDateKey(start);
        const endKey = toDateKey(end);
        const days = await getDailyRange(startKey, endKey);

        const revSeries = days
          .map((d: any) => ({
            date: fromDateKey(d?.dateKey),
            amount: Number(d?.kpis?.revenue || 0) || 0,
          }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        setRevenueSeries(revSeries);

        // Load projected revenue from service agreements
        const projections =
          await ServiceAgreementProjectionService.getFinancialProjections(90);
        const projRevSeries = Object.entries(projections.monthlyBreakdown)
          .map(([monthKey, amount]) => ({
            date: `${monthKey}-01`, // Use first day of month for chart
            amount: amount,
          }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        setProjectedRevenueSeries(projRevSeries);

        const jSeries = days
          .map((d: any) => ({
            date: fromDateKey(d?.dateKey),
            count: Number(d?.kpis?.jobsCompleted || 0) || 0,
          }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        setJobsSeries(jSeries);

        const pSeries = days
          .map((d: any) => ({
            date: fromDateKey(d?.dateKey),
            pct: Number(d?.kpis?.payrollPct || 0) || 0,
          }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        setPayrollPctSeries(pSeries);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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

  const revenueChartData = useMemo(() => {
    // Combine actual and projected revenue data
    const combinedData: Record<string, { actual: number; projected: number }> =
      {};

    // Add actual revenue data
    revenueSeries.forEach((p) => {
      const monthKey = p.date.slice(5, 7); // Get MM from YYYY-MM-DD
      const yearKey = p.date.slice(0, 4);
      const key = `${yearKey}-${monthKey}`;
      if (!combinedData[key]) {
        combinedData[key] = { actual: 0, projected: 0 };
      }
      combinedData[key].actual = p.amount;
    });

    // Add projected revenue data
    projectedRevenueSeries.forEach((p) => {
      const monthKey = p.date.slice(5, 7);
      const yearKey = p.date.slice(0, 4);
      const key = `${yearKey}-${monthKey}`;
      if (!combinedData[key]) {
        combinedData[key] = { actual: 0, projected: 0 };
      }
      combinedData[key].projected = p.amount;
    });

    // Convert to array format for chart
    return Object.entries(combinedData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, values]) => ({
        date: dateKey,
        actual: values.actual,
        projected: values.projected,
        combined: values.actual + values.projected,
      }));
  }, [revenueSeries, projectedRevenueSeries]);
  const jobsChartData = useMemo(
    () => jobsSeries.map((p) => ({ date: p.date.slice(5), count: p.count })),
    [jobsSeries]
  );
  const payrollPctChartData = useMemo(
    () =>
      payrollPctSeries.map((p) => ({
        date: p.date.slice(5),
        pct: Math.round(p.pct * 1000) / 10,
      })),
    [payrollPctSeries]
  );

  const kpiCards = useMemo(() => {
    const k = (latest?.kpis as any) || {};
    const revenue = Number(k?.revenue || 0) || 0;
    const out = Number(k?.arBuckets?.totalOutstanding || 0) || 0;
    const jobs = Number(k?.jobsCompleted || 0) || 0;
    const payrollPct = Number(k?.payrollPct || 0) || 0;
    const newLeads = Number(k?.newLeads || 0) || 0;
    return [
      {
        label: "Revenue (today)",
        value: revenue > 0 ? `$${revenue.toLocaleString()}` : "$0",
      },
      {
        label: "A/R Outstanding",
        value: out > 0 ? `$${out.toLocaleString()}` : "$0",
      },
      { label: "Payroll %", value: `${Math.round(payrollPct * 1000) / 10}%` },
      { label: "Jobs Completed", value: String(jobs) },
      { label: "New Leads", value: String(newLeads) },
    ];
  }, [latest]);

  const arBuckets = (latest?.kpis as any)?.arBuckets || {
    current: 0,
    "30": 0,
    "60": 0,
    "90": 0,
  };
  const arData = [
    {
      bucket: "A/R Aging",
      current: Number(arBuckets.current || 0) || 0,
      b30: Number(arBuckets["30"] || 0) || 0,
      b60: Number(arBuckets["60"] || 0) || 0,
      b90: Number(arBuckets["90"] || 0) || 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <Link
          to="/analytics/reports"
          className="px-3 py-1 rounded-md text-sm bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
        >
          View Reports
        </Link>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="rounded-lg p-4 card-bg shadow-elev-1">
            <div className="text-xs uppercase text-zinc-500">{k.label}</div>
            <div className="text-xl font-semibold mt-1">
              {loading ? "…" : k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg card-bg shadow-elev-1 p-4 min-h-[240px]">
          <div className="font-medium mb-2">Revenue (30d)</div>
          {loading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : revenueChartData.length === 0 ? (
            <div className="text-sm text-zinc-500">No data.</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={revenueChartData}
                margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip
                  formatter={(value, name) => [
                    `$${Number(value).toLocaleString()}`,
                    name === "actual"
                      ? "Actual Revenue"
                      : name === "projected"
                      ? "Projected Revenue"
                      : "Total Revenue",
                  ]}
                />
                <Legend />
                <Bar
                  dataKey="actual"
                  stackId="revenue"
                  fill="#16a34a"
                  name="Actual"
                />
                <Bar
                  dataKey="projected"
                  stackId="revenue"
                  fill="#3b82f6"
                  name="Projected"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-lg card-bg shadow-elev-1 p-4 min-h-[240px]">
          <div className="font-medium mb-2">Jobs (30d)</div>
          {loading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : jobsChartData.length === 0 ? (
            <div className="text-sm text-zinc-500">No data.</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={jobsChartData}
                margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="jobs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#2563eb"
                  fillOpacity={1}
                  fill="url(#jobs)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-lg card-bg shadow-elev-1 p-4 min-h-[240px]">
          <div className="font-medium mb-2">A/R Aging (latest)</div>
          {loading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={arData}
                margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="bucket" hide />
                <YAxis hide />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="current"
                  stackId="ar"
                  fill="#10b981"
                  name="Current"
                />
                <Bar dataKey="b30" stackId="ar" fill="#f59e0b" name="31–60" />
                <Bar dataKey="b60" stackId="ar" fill="#ef4444" name="61–90" />
                <Bar dataKey="b90" stackId="ar" fill="#7c3aed" name=">90" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-lg card-bg shadow-elev-1 p-4 min-h-[240px]">
          <div className="font-medium mb-2">Payroll % (30–90d)</div>
          {loading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : payrollPctChartData.length === 0 ? (
            <div className="text-sm text-zinc-500">No data.</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={payrollPctChartData}
                margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="pct" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke="#0891b2"
                  fillOpacity={1}
                  fill="url(#pct)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
