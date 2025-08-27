import { useState } from "react";
import EmployeesList from "./EmployeesList";
import TimesheetView from "../employee/TimesheetView";
import TimeLocationAdmin from "./TimeLocationAdmin";
import HROverview from "./HROverview";
import AssignmentsReadOnly from "../scheduling/AssignmentsReadOnly";
import AllTimesheetsAdmin from "./AllTimesheetsAdmin";
import EmployeeTimesheetsAdmin from "./EmployeeTimesheetsAdmin";
import EmployeeRatesOverview from "./EmployeeRatesOverview";
import HRActivity from "./HRActivity";

type TabKey =
  | "Overview"
  | "Employees"
  | "TimeLocation"
  | "Schedules"
  | "Rates"
  | "PayrollPrep"
  | "Activity";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "Overview", label: "Overview" },
  { key: "Employees", label: "Employees" },
  { key: "TimeLocation", label: "TimeLocation" },
  { key: "Schedules", label: "Assignments (Read-only)" },
  { key: "Rates", label: "Rates" },
  { key: "PayrollPrep", label: "PayrollPrep" },
  { key: "Activity", label: "Activity" },
];

export default function HRPage() {
  const [active, setActive] = useState<TabKey>(tabs[0].key);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">HR</h1>

      {/* Tabs (shadcn/ui-like) */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="flex gap-2">
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

      {/* TableCard-style content */}
      <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4 min-h-[200px]">
        {active === "Overview" && <HROverview />}

        {active === "Employees" && <EmployeesList />}

        {active === "TimeLocation" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4">
              <div className="text-sm text-zinc-500 mb-2">
                My Timesheets (current user)
              </div>
              <TimesheetView />
            </div>
            <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4">
              <div className="text-sm text-zinc-500 mb-2">Admin view</div>
              <TimeLocationAdmin />
            </div>
            <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4">
              <div className="text-sm text-zinc-500 mb-2">
                Employee-specific timesheets
              </div>
              <EmployeeTimesheetsAdmin />
            </div>
          </div>
        )}

        {active === "Schedules" && <AssignmentsReadOnly />}

        {active === "Rates" && <EmployeeRatesOverview />}

        {active === "PayrollPrep" && <AllTimesheetsAdmin />}

        {active === "Activity" && (
          <div className="space-y-2">
            <h2 className="text-lg font-medium">Activity</h2>
            <HRActivity />
          </div>
        )}
      </div>
    </div>
  );
}
