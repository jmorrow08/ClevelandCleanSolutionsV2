import { useState } from "react";
import TodayTomorrow from "./TodayTomorrow";
import WeekView from "./WeekView";
import MonthView from "./MonthView";
import { RoleGuard } from "../../context/RoleGuard";
import { useNewClientModal } from "../crm/NewClientModal";
import { useNewLocationModal } from "../crm/NewLocationModal";

const tabs = [
  { key: "today", label: "Today/Tomorrow" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

export default function SchedulingPage() {
  const [active, setActive] = useState<string>(tabs[0].key);
  const { open: openNewClient } = useNewClientModal();
  const { open: openNewLocation } = useNewLocationModal();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scheduling</h1>
        <RoleGuard allow={["admin", "owner", "super_admin"]}>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
              onClick={openNewClient}
            >
              New Client
            </button>
            <button
              className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
              onClick={openNewLocation}
            >
              New Location
            </button>
          </div>
        </RoleGuard>
      </div>
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
      <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4 min-h-[200px]">
        {active === "today" && <TodayTomorrow />}
        {active === "week" && <WeekView />}
        {active === "month" && <MonthView />}
      </div>
    </div>
  );
}
