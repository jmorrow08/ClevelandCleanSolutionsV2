import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";
import { Link } from "react-router-dom";
import {
  getEmployeeNames,
  getLocationNames,
} from "../../services/queries/resolvers";
import { extractCoordinates } from "../../services/maps";
import { Clock, Users, Activity } from "lucide-react";
import EntryDetailsMap from "../../components/ui/EntryDetailsMap";

type Entry = {
  id: string;
  employeeProfileId: string;
  locationId: string;
  status: string;
  clockInTime?: any;
  clockOutTime?: any;
  clockInCoordinates?: any;
  clockOutCoordinates?: any;
};

function fmt(ts: any): string {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

function hoursBetween(start: any, end: any): string {
  try {
    const s = start?.toDate
      ? start.toDate()
      : start instanceof Date
      ? start
      : null;
    const e = end?.toDate ? end.toDate() : end instanceof Date ? end : null;
    if (!s || !e) return "—";
    const hrs = (e.getTime() - s.getTime()) / 3600000;
    return Math.max(0, Math.round(hrs * 100) / 100).toFixed(2);
  } catch {
    return "—";
  }
}

export default function EmployeeActivityTab() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>(
    {}
  );
  const [locationNames, setLocationNames] = useState<Record<string, string>>(
    {}
  );
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "today">(
    "all"
  );
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Base query for recent entries (last 7 days)
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 7);

        let q = query(
          collection(db, "employeeTimeTracking"),
          where("clockInTime", ">=", Timestamp.fromDate(start)),
          orderBy("clockInTime", "desc"),
          limit(200)
        );

        // Set up real-time listener
        const unsub = onSnapshot(q, async (snap) => {
          const list: Entry[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setEntries(list);

          // Resolve names in parallel
          const empIds = Array.from(
            new Set(list.map((r) => r.employeeProfileId).filter(Boolean))
          );
          const locIds = Array.from(
            new Set(list.map((r) => r.locationId).filter(Boolean))
          );

          if (empIds.length) {
            try {
              const names = await getEmployeeNames(empIds);
              setEmployeeNames((prev) => {
                const next = { ...prev } as Record<string, string>;
                empIds.forEach((id, i) => (next[id] = names[i] || id));
                return next;
              });
            } catch {}
          }

          if (locIds.length) {
            try {
              const names = await getLocationNames(locIds);
              setLocationNames((prev) => {
                const next = { ...prev } as Record<string, string>;
                locIds.forEach((id, i) => (next[id] = names[i] || id));
                return next;
              });
            } catch {}
          }

          setLoading(false);
        });

        return unsub;
      } catch (error) {
        console.error("Error setting up employee activity query:", error);
        setLoading(false);
      }
    })();
  }, []);

  const filteredEntries = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return entries.filter((entry) => {
      switch (activeFilter) {
        case "active":
          return entry.status === "Clocked In";
        case "today":
          const entryDate = entry.clockInTime?.toDate
            ? entry.clockInTime.toDate()
            : null;
          return entryDate && entryDate >= today;
        default:
          return true;
      }
    });
  }, [entries, activeFilter]);

  const activeEmployees = useMemo(() => {
    return entries.filter((entry) => entry.status === "Clocked In").length;
  }, [entries]);

  const todaysEntries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return entries.filter((entry) => {
      const entryDate = entry.clockInTime?.toDate
        ? entry.clockInTime.toDate()
        : null;
      return entryDate && entryDate >= today;
    }).length;
  }, [entries]);

  return (
    <RoleGuard allow={["owner", "admin", "super_admin"]}>
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Active Employees
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-2">
              {activeEmployees}
            </div>
            <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Currently clocked in
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-green-600" />
              <div className="text-sm font-medium text-green-900 dark:text-green-100">
                Today's Activity
              </div>
            </div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-100 mt-2">
              {todaysEntries}
            </div>
            <div className="text-xs text-green-700 dark:text-green-300 mt-1">
              Clock events today
            </div>
          </div>

          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-600" />
              <div className="text-sm font-medium text-purple-900 dark:text-purple-100">
                Total Entries
              </div>
            </div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100 mt-2">
              {entries.length}
            </div>
            <div className="text-xs text-purple-700 dark:text-purple-300 mt-1">
              Last 7 days
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1.5 rounded-md text-sm ${
              activeFilter === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            All Entries
          </button>
          <button
            onClick={() => setActiveFilter("active")}
            className={`px-3 py-1.5 rounded-md text-sm ${
              activeFilter === "active"
                ? "bg-green-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Active Only ({activeEmployees})
          </button>
          <button
            onClick={() => setActiveFilter("today")}
            className={`px-3 py-1.5 rounded-md text-sm ${
              activeFilter === "today"
                ? "bg-orange-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Today ({todaysEntries})
          </button>
        </div>

        {/* Activity Table */}
        <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
            <h3 className="text-lg font-medium">Employee Activity</h3>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="text-sm text-zinc-500">
                Loading employee activity…
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="text-sm text-zinc-500">No activity found.</div>
            ) : (
              <div className="overflow-x-auto rounded-lg card-bg shadow-elev-1">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2">Clock In</th>
                      <th className="px-3 py-2">Clock Out</th>
                      <th className="px-3 py-2">Hours</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => {
                      const isActive = entry.status === "Clocked In";
                      const employeeName =
                        employeeNames[entry.employeeProfileId] ||
                        entry.employeeProfileId;
                      const locationName =
                        locationNames[entry.locationId] || entry.locationId;

                      return (
                        <tr
                          key={entry.id}
                          className={`border-t border-zinc-100 dark:border-zinc-700 ${
                            selectedEntry?.id === entry.id
                              ? "bg-blue-50 dark:bg-blue-900/20"
                              : ""
                          }`}
                        >
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                isActive
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                  : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                              }`}
                            >
                              <div
                                className={`h-2 w-2 rounded-full mr-1 ${
                                  isActive ? "bg-green-500" : "bg-gray-500"
                                }`}
                              ></div>
                              {entry.status}
                            </span>
                          </td>
                          <td
                            className="px-3 py-2"
                            title={entry.employeeProfileId}
                          >
                            <Link
                              to={`/hr/${entry.employeeProfileId}`}
                              className="underline text-blue-600 dark:text-blue-400"
                            >
                              {employeeName}
                            </Link>
                          </td>
                          <td className="px-3 py-2" title={entry.locationId}>
                            <Link
                              to={`/crm/locations/${entry.locationId}`}
                              className="underline text-blue-600 dark:text-blue-400"
                            >
                              {locationName}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            {fmt(entry.clockInTime)}
                          </td>
                          <td className="px-3 py-2">
                            {fmt(entry.clockOutTime)}
                          </td>
                          <td className="px-3 py-2">
                            {hoursBetween(
                              entry.clockInTime,
                              entry.clockOutTime
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => setSelectedEntry(entry)}
                              className="text-blue-600 dark:text-blue-400 underline text-sm"
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Entry Details Modal */}
        {selectedEntry && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="card-bg rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-medium">Activity Details</h3>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="text-zinc-500 hover:text-zinc-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Map Section */}
                <div className="bg-gray-50 dark:bg-zinc-700 rounded-lg p-4">
                  <h4 className="text-md font-medium mb-3 flex items-center gap-2">
                    <span className="text-sm">📍</span>
                    Location Map
                  </h4>
                  <EntryDetailsMap
                    clockInCoordinates={selectedEntry.clockInCoordinates}
                    clockOutCoordinates={selectedEntry.clockOutCoordinates}
                    clockInTime={selectedEntry.clockInTime}
                    clockOutTime={selectedEntry.clockOutTime}
                    height="350px"
                  />
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <h4 className="text-md font-medium">
                      Employee Information
                    </h4>
                    <div>
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Employee
                      </label>
                      <div className="text-sm mt-1">
                        {employeeNames[selectedEntry.employeeProfileId] ||
                          selectedEntry.employeeProfileId}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Location
                      </label>
                      <div className="text-sm mt-1">
                        {locationNames[selectedEntry.locationId] ||
                          selectedEntry.locationId}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Status
                      </label>
                      <div className="text-sm mt-1">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            selectedEntry.status === "Clocked In"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                          }`}
                        >
                          <div
                            className={`h-2 w-2 rounded-full mr-1 ${
                              selectedEntry.status === "Clocked In"
                                ? "bg-green-500"
                                : "bg-gray-500"
                            }`}
                          ></div>
                          {selectedEntry.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Time Information */}
                  <div className="space-y-4">
                    <h4 className="text-md font-medium">Time Information</h4>
                    <div>
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Clock In
                      </label>
                      <div className="text-sm mt-1">
                        {fmt(selectedEntry.clockInTime)}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Clock Out
                      </label>
                      <div className="text-sm mt-1">
                        {fmt(selectedEntry.clockOutTime)}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Total Hours
                      </label>
                      <div className="text-sm mt-1">
                        {hoursBetween(
                          selectedEntry.clockInTime,
                          selectedEntry.clockOutTime
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coordinate Information (if available) */}
                {(selectedEntry.clockInCoordinates ||
                  selectedEntry.clockOutCoordinates) && (
                  <div className="bg-gray-50 dark:bg-zinc-700 rounded-lg p-4">
                    <h4 className="text-md font-medium mb-3">
                      Coordinate Details
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(() => {
                        const clockInCoords = extractCoordinates(
                          selectedEntry.clockInCoordinates
                        );
                        return (
                          clockInCoords && (
                            <div>
                              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                Clock In Location
                              </label>
                              <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 font-mono">
                                {clockInCoords.lat.toFixed(6)},{" "}
                                {clockInCoords.lng.toFixed(6)}
                              </div>
                            </div>
                          )
                        );
                      })()}

                      {(() => {
                        const clockOutCoords = extractCoordinates(
                          selectedEntry.clockOutCoordinates
                        );
                        return (
                          clockOutCoords && (
                            <div>
                              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                Clock Out Location
                              </label>
                              <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 font-mono">
                                {clockOutCoords.lat.toFixed(6)},{" "}
                                {clockOutCoords.lng.toFixed(6)}
                              </div>
                            </div>
                          )
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
