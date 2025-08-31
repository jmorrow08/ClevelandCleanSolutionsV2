import { useState } from "react";
import JobsList from "./JobsList";
import { useToast } from "../../context/ToastContext";

export default function ServiceHistoryPage() {
  const [showAll, setShowAll] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const { show } = useToast();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Service History</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            <span>All</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            <span>Include Archived</span>
          </label>
        </div>
      </div>
      <div className="rounded-lg card-bg shadow-elev-1 p-4 min-h-[200px]">
        <JobsList showAll={showAll} includeArchived={includeArchived} />
      </div>
    </div>
  );
}
