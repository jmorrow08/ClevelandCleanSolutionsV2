import { useMemo, useState } from "react";
import TodayTomorrow from "./TodayTomorrow";
import { RoleGuard } from "../../context/RoleGuard";
import { Link } from "react-router-dom";

export default function DispatchPage() {
  const [copied, setCopied] = useState(false);
  const link = useMemo(() => {
    try {
      return window.location.href;
    } catch {
      return "/scheduling/dispatch";
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dispatch</h1>
        <RoleGuard allow={["admin", "owner", "super_admin"]}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Copy link"
              className={`px-3 py-1.5 rounded-md text-sm ${
                copied
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-200 dark:bg-zinc-700"
              }`}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {}
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <Link
              to="/scheduling"
              className="px-3 py-1.5 rounded-md bg-zinc-200 dark:bg-zinc-700 text-sm"
            >
              Back to Scheduling
            </Link>
          </div>
        </RoleGuard>
      </div>
      <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4 min-h-[200px]">
        <TodayTomorrow />
      </div>
    </div>
  );
}
