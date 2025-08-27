import { useMemo, useState } from "react";
import JobsList from "./JobsList";
import EmployeeJobsByWindow from "./EmployeeJobsByWindow";

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ServiceHistoryPage() {
  const [showAll, setShowAll] = useState(false);
  const [startDate, setStartDate] = useState<string>(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 14);
    return ymd(start);
  });
  const [endDate, setEndDate] = useState<string>(() => ymd(new Date()));

  const selectedWindow = useMemo(() => {
    const s = startDate ? new Date(startDate + "T00:00:00") : undefined;
    const e = endDate ? new Date(endDate + "T00:00:00") : undefined;
    return { start: s, end: e } as const;
  }, [startDate, endDate]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Service History</h1>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          <span>All</span>
        </label>
      </div>
      <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4 min-h-[200px]">
        <JobsList showAll={showAll} />
      </div>
      <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm">
              <div className="text-zinc-500 mb-1">Start</div>
              <input
                type="date"
                className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1 text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <div className="text-zinc-500 mb-1">End</div>
              <input
                type="date"
                className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1 text-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
          <div className="text-sm text-zinc-500">Grouped by Employee</div>
        </div>
        <div className="mt-3">
          <EmployeeJobsByWindow window={selectedWindow} />
        </div>
      </div>
    </div>
  );
}
