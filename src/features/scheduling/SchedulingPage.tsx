import { useMemo, useState, useEffect } from "react";
import TodayTomorrow from "./TodayTomorrow";
import WeekView from "./WeekView";
import MonthView from "./MonthView";
import { RoleGuard } from "../../context/RoleGuard";
import { useSearchParams, useNavigate } from "react-router-dom";
import { QuickAddProvider } from "../dashboard/QuickAddPanel";
import { SchedulingQuickActions } from "../dashboard/actions/QuickActions";

const tabs = [
  { key: "today", label: "Today/Tomorrow" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

export default function SchedulingPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = useMemo(() => params.get("tab") || tabs[0].key, [params]);
  const [active, setActive] = useState<string>(initialTab);

  // Redirect assignments tab to HR assignments
  useEffect(() => {
    if (initialTab === "assignments") {
      const hrParams = new URLSearchParams();
      // Copy relevant parameters to HR
      const start = params.get("start");
      const end = params.get("end");
      const employeeId = params.get("employeeId");
      const locationId = params.get("locationId");
      const status = params.get("status");
      const compare = params.get("compare");

      if (start) hrParams.set("start", start);
      if (end) hrParams.set("end", end);
      if (employeeId) hrParams.set("employeeId", employeeId);
      if (locationId) hrParams.set("locationId", locationId);
      if (status) hrParams.set("status", status);
      if (compare) hrParams.set("compare", compare);

      // Clear the tab parameter to avoid conflicts
      params.delete("tab");
      setParams(params);

      // Navigate to HR with assignments tab
      navigate(`/hr?tab=Schedules&${hrParams.toString()}`, { replace: true });
    }
  }, [initialTab, params, navigate, setParams]);

  return (
    <QuickAddProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Scheduling</h1>
          <RoleGuard allow={["admin", "owner", "super_admin"]}>
            <SchedulingQuickActions />
          </RoleGuard>
        </div>
        <div className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="flex gap-2 items-center">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                  active === t.key
                    ? "border-zinc-900 dark:border-zinc-100"
                    : "border-transparent text-zinc-500"
                }`}
                onClick={() => setActive(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4 min-h-[200px]">
          {active === "today" && <TodayTomorrow />}
          {active === "week" && <WeekView />}
          {active === "month" && <MonthView />}
        </div>
      </div>
    </QuickAddProvider>
  );
}
