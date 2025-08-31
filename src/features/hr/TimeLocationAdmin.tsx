import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";
import { Link } from "react-router-dom";
import {
  getEmployeeNames,
  getLocationNames,
} from "../../services/queries/resolvers";

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
    const s = start?.toDate ? start.toDate() : null;
    const e = end?.toDate ? end.toDate() : null;
    if (!s || !e) return "—";
    const hrs = (e.getTime() - s.getTime()) / 3600000;
    return Math.max(0, Math.round(hrs * 100) / 100).toFixed(2);
  } catch {
    return "—";
  }
}

export default function TimeLocationAdmin() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Entry[]>([]);
  const [empFilter, setEmpFilter] = useState(""); // profileId or name contains
  const [locFilter, setLocFilter] = useState(""); // locationId or name contains
  const [dateFilter, setDateFilter] = useState(""); // YYYY-MM-DD
  const [employeeNamesById, setEmployeeNamesById] = useState<
    Record<string, string>
  >({});
  const [locationNamesById, setLocationNamesById] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        // default: last 7 days
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 7);
        const qy = query(
          collection(db, "employeeTimeTracking"),
          where("clockInTime", ">=", Timestamp.fromDate(start)),
          orderBy("clockInTime", "desc"),
          limit(500)
        );
        const snap = await getDocs(qy);
        const list: Entry[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        // Resolve display names in parallel (best-effort; fall back to raw ids)
        setRows(list);
        const empIds = Array.from(
          new Set(list.map((r) => r.employeeProfileId).filter(Boolean))
        );
        const locIds = Array.from(
          new Set(list.map((r) => r.locationId).filter(Boolean))
        );
        if (empIds.length) {
          try {
            const names = await getEmployeeNames(empIds);
            setEmployeeNamesById((prev) => {
              const next = { ...prev } as Record<string, string>;
              empIds.forEach((id, i) => (next[id] = names[i] || id));
              return next;
            });
          } catch {}
        }
        if (locIds.length) {
          try {
            const names = await getLocationNames(locIds);
            setLocationNamesById((prev) => {
              const next = { ...prev } as Record<string, string>;
              locIds.forEach((id, i) => (next[id] = names[i] || id));
              return next;
            });
          } catch {}
        }
      } catch (_) {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const emp = empFilter.trim().toLowerCase();
    const loc = locFilter.trim().toLowerCase();
    const day = dateFilter.trim();
    return rows.filter((r) => {
      if (
        emp &&
        !(
          (r.employeeProfileId || "").toLowerCase().includes(emp) ||
          (
            employeeNamesById[r.employeeProfileId]?.toLowerCase() || ""
          ).includes(emp)
        )
      ) {
        return false;
      }
      if (
        loc &&
        !(
          (r.locationId || "").toLowerCase().includes(loc) ||
          (locationNamesById[r.locationId]?.toLowerCase() || "").includes(loc)
        )
      ) {
        return false;
      }
      if (day) {
        const d = r.clockInTime?.toDate ? r.clockInTime.toDate() : undefined;
        const key = d ? d.toISOString().slice(0, 10) : "";
        if (key !== day) return false;
      }
      return true;
    });
  }, [
    rows,
    empFilter,
    locFilter,
    dateFilter,
    employeeNamesById,
    locationNamesById,
  ]);

  // Name resolver helpers: use local maps populated from batched lookups.
  function employeeDisplay(id?: string) {
    if (!id) return "—";
    const name = employeeNamesById[id];
    return name && name !== id ? name : id;
  }
  function locationDisplay(id?: string) {
    if (!id) return "—";
    const name = locationNamesById[id];
    return name && name !== id ? name : id;
  }

  function exportCsv(list: Entry[]) {
    const header = [
      "clockIn",
      "clockOut",
      "hours",
      "employeeProfileId",
      "employeeName",
      "locationId",
      "locationName",
      "status",
    ];
    const rowsOut = list.map((r) => [
      fmt(r.clockInTime),
      fmt(r.clockOutTime),
      hoursBetween(r.clockInTime, r.clockOutTime),
      r.employeeProfileId || "",
      employeeNamesById[r.employeeProfileId] || "",
      r.locationId || "",
      locationNamesById[r.locationId] || "",
      r.status || "",
    ]);
    const csv = [header, ...rowsOut]
      .map((arr) =>
        arr.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-location-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <RoleGuard allow={["owner", "admin", "super_admin"]}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-500">
            Clock-ins/outs (last 7 days)
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            placeholder="Filter by employee (name or id)"
            className="border rounded-md px-3 py-2 card-bg"
            value={empFilter}
            onChange={(e) => setEmpFilter(e.target.value)}
          />
          <input
            placeholder="Filter by location (name or id)"
            className="border rounded-md px-3 py-2 card-bg"
            value={locFilter}
            onChange={(e) => setLocFilter(e.target.value)}
          />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border rounded-md px-3 py-2 card-bg"
          />
          <button
            className="px-3 py-2 rounded-md border text-sm"
            onClick={() => exportCsv(filtered)}
            disabled={loading}
          >
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg card-bg shadow-elev-1">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2">Clock In</th>
                <th className="px-3 py-2">Clock Out</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-3" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={6}>
                    No results.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t border-zinc-100 dark:border-zinc-700"
                  >
                    <td className="px-3 py-2">{fmt(e.clockInTime)}</td>
                    <td className="px-3 py-2">{fmt(e.clockOutTime)}</td>
                    <td className="px-3 py-2">
                      {hoursBetween(e.clockInTime, e.clockOutTime)}
                    </td>
                    <td className="px-3 py-2" title={e.employeeProfileId}>
                      <Link
                        to={`/hr/${e.employeeProfileId}`}
                        className="underline text-blue-600 dark:text-blue-400"
                      >
                        {employeeDisplay(e.employeeProfileId)}
                      </Link>
                    </td>
                    <td className="px-3 py-2" title={e.locationId}>
                      <Link
                        to={`/crm/locations/${e.locationId}`}
                        className="underline text-blue-600 dark:text-blue-400"
                      >
                        {locationDisplay(e.locationId)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{e.status || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </RoleGuard>
  );
}
