import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import { firebaseConfig } from "../../services/firebase";
import TodayTomorrow from "./TodayTomorrow";
import WeekView from "./WeekView";
import MonthView from "./MonthView";
import { RoleGuard } from "../../context/RoleGuard";
import { useNewClientModal } from "../crm/NewClientModal";
import { useNewLocationModal } from "../crm/NewLocationModal";
import AssignmentsReadOnly from "./AssignmentsReadOnly";
import { useSearchParams } from "react-router-dom";

const tabs = [
  { key: "today", label: "Today/Tomorrow" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "assignments", label: "Assignments (Read-only)" },
];

export default function SchedulingPage() {
  const [params] = useSearchParams();
  const initialTab = useMemo(() => params.get("tab") || tabs[0].key, [params]);
  const [active, setActive] = useState<string>(initialTab);
  const { open: openNewClient } = useNewClientModal();
  const { open: openNewLocation } = useNewLocationModal();

  // Start a short-lived scheduling session for write affordances (server-enforced)
  useEffect(() => {
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const fns = getFunctions();
        try {
          if (
            import.meta.env.DEV &&
            (import.meta.env as any).VITE_USE_FIREBASE_EMULATOR === "true"
          )
            connectFunctionsEmulator(fns, "127.0.0.1", 5001);
        } catch {}
        const start = httpsCallable(fns, "startScheduleSession");
        await start({ ttlMinutes: 20 });
      } catch (error) {
        console.warn("Failed to start scheduling session:", error);
        // Continue without session - user can still view scheduling
      }
    })();
  }, []);
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
          <div className="ml-auto" />
          <a
            href="/scheduling/dispatch"
            className="px-3 py-1.5 rounded-md text-sm bg-zinc-200 dark:bg-zinc-700"
          >
            Open Dispatch
          </a>
        </nav>
      </div>
      <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4 min-h-[200px]">
        {active === "today" && <TodayTomorrow />}
        {active === "week" && <WeekView />}
        {active === "month" && <MonthView />}
        {active === "assignments" && (
          <AssignmentsReadOnly
            initialStart={params.get("start")}
            initialEnd={params.get("end")}
            initialEmployeeId={params.get("employeeId")}
            initialLocationId={params.get("locationId")}
            initialStatus={params.get("status")}
            initialCompare={params.get("compare")}
          />
        )}
      </div>
    </div>
  );
}
