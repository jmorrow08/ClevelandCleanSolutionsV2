import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import { firebaseConfig } from "../../services/firebase";
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
  // Start a short-lived scheduling session for day-of dispatch changes
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
        // Continue without session - user can still view dispatch
      }
    })();
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
