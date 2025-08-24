import { useState } from "react";
import JobsList from "./JobsList";

export default function ServiceHistoryPage() {
  const [showAll, setShowAll] = useState(false);
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
    </div>
  );
}
