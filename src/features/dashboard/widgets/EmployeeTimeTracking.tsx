import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../../services/firebase";
import {
  getEmployeeNames,
  getLocationNames,
} from "../../../services/queries/resolvers";

type TimeTrackingEntry = {
  id: string;
  employeeProfileId: string;
  locationId: string;
  clockInTime: Timestamp | null;
  clockOutTime: Timestamp | null;
};

type ProcessedEntry = {
  id: string;
  employeeName: string;
  locationName: string;
  clockInTime: Date | null;
  clockOutTime: Date | null;
  durationMins: number | null;
  isActive: boolean;
};

export default function EmployeeTimeTracking() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProcessedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTimeTracking() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Get currently clocked-in sessions (no clockOutTime)
        const activeQuery = query(
          collection(db, "employeeTimeTracking"),
          where("clockOutTime", "==", null),
          orderBy("clockInTime", "desc")
          // limit(25) - removed limit to show all active sessions
        );

        // Get recent clock events in last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentQuery = query(
          collection(db, "employeeTimeTracking"),
          where("clockInTime", ">=", Timestamp.fromDate(oneDayAgo)),
          orderBy("clockInTime", "desc")
          // limit(25) - removed limit to show all recent activity
        );

        const [activeSnap, recentSnap] = await Promise.all([
          getDocs(activeQuery),
          getDocs(recentQuery),
        ]);

        // Process active sessions
        const activeEntries: TimeTrackingEntry[] = [];
        activeSnap.forEach((doc) => {
          activeEntries.push({
            id: doc.id,
            ...doc.data(),
          } as TimeTrackingEntry);
        });

        // Process recent sessions (including completed ones from last 24h)
        const recentEntries: TimeTrackingEntry[] = [];
        recentSnap.forEach((doc) => {
          recentEntries.push({
            id: doc.id,
            ...doc.data(),
          } as TimeTrackingEntry);
        });

        // Combine and deduplicate (active sessions will also appear in recent)
        const allEntries = [...activeEntries, ...recentEntries];
        const uniqueEntries = allEntries.filter(
          (entry, index, self) =>
            index === self.findIndex((e) => e.id === entry.id)
        );

        if (uniqueEntries.length === 0) {
          setData([]);
          setLoading(false);
          return;
        }

        // Get unique employee and location IDs
        const employeeIds = Array.from(
          new Set(uniqueEntries.map((e) => e.employeeProfileId).filter(Boolean))
        );
        const locationIds = Array.from(
          new Set(uniqueEntries.map((e) => e.locationId).filter(Boolean))
        );

        // Fetch names in parallel
        const [employeeNames, locationNames] = await Promise.all([
          getEmployeeNames(employeeIds),
          getLocationNames(locationIds),
        ]);

        // Create lookup maps
        const employeeNameMap = new Map(
          employeeIds.map((id, i) => [
            id,
            employeeNames[i] || "Unknown Employee",
          ])
        );
        const locationNameMap = new Map(
          locationIds.map((id, i) => [
            id,
            locationNames[i] || "Unknown Location",
          ])
        );

        // Process entries
        const processed: ProcessedEntry[] = uniqueEntries.map((entry) => {
          const clockInTime = entry.clockInTime?.toDate() || null;
          const clockOutTime = entry.clockOutTime?.toDate() || null;
          const isActive = !clockOutTime;

          let durationMins: number | null = null;
          if (clockInTime) {
            if (clockOutTime) {
              durationMins = Math.max(
                1,
                Math.round(
                  (clockOutTime.getTime() - clockInTime.getTime()) / 60000
                )
              );
            } else {
              durationMins = Math.max(
                1,
                Math.round((Date.now() - clockInTime.getTime()) / 60000)
              );
            }
          }

          return {
            id: entry.id,
            employeeName:
              employeeNameMap.get(entry.employeeProfileId) ||
              "Unknown Employee",
            locationName:
              locationNameMap.get(entry.locationId) || "Unknown Location",
            clockInTime,
            clockOutTime,
            durationMins,
            isActive,
          };
        });

        // Sort: active sessions first, then by most recent clock-in time
        processed.sort((a, b) => {
          if (a.isActive && !b.isActive) return -1;
          if (!a.isActive && b.isActive) return 1;
          return (
            (b.clockInTime?.getTime() || 0) - (a.clockInTime?.getTime() || 0)
          );
        });

        setData(processed);
      } catch (e: any) {
        console.error("Error loading employee time tracking:", e);
        setError(e?.message || "Failed to load employee time tracking");
      } finally {
        setLoading(false);
      }
    }

    loadTimeTracking();

    // Auto-refresh every 30 seconds for live updates
    const interval = setInterval(loadTimeTracking, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date | null): string => {
    if (!date) return "—";
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (mins: number | null, isActive: boolean): string => {
    if (!mins) return "—";
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    let str = "";
    if (hours > 0) {
      str += `${hours}h `;
    }
    str += `${remainingMins}m`;
    if (isActive) {
      str += " (active)";
    }
    return str;
  };

  return (
    <div className="rounded-lg p-4 card-bg shadow-elev-1">
      <div className="font-medium mb-3">Employee Time Tracking (24h)</div>

      {loading ? (
        <div className="text-sm text-zinc-500">
          Loading employee activity...
        </div>
      ) : error ? (
        <div className="text-sm text-red-500">Error: {error}</div>
      ) : data.length === 0 ? (
        <div className="text-center py-4">
          <div className="text-sm text-zinc-500">
            No recent employee clock activity
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            Clock-in/out sessions will appear here
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {data.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between py-2 text-sm border-b border-zinc-100 dark:border-zinc-700 last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="font-medium truncate"
                    title={entry.employeeName}
                  >
                    {entry.employeeName}
                  </span>
                  <span className="text-xs text-zinc-500">@</span>
                  <span
                    className="text-xs text-zinc-500 truncate"
                    title={entry.locationName}
                  >
                    {entry.locationName}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end text-xs">
                <div
                  className={`font-medium ${
                    entry.isActive ? "text-blue-600" : "text-green-600"
                  }`}
                >
                  {entry.isActive ? "Clocked In" : "Clocked Out"}
                </div>
                <div className="text-zinc-500">
                  In: {formatTime(entry.clockInTime)}
                  {!entry.isActive && (
                    <> • Out: {formatTime(entry.clockOutTime)}</>
                  )}
                </div>
                <div className="text-zinc-500">
                  {formatDuration(entry.durationMins, entry.isActive)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs text-zinc-400 text-center">
        Auto-refreshes every 30 seconds
      </div>
    </div>
  );
}





