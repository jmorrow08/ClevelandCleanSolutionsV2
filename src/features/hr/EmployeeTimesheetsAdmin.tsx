import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";
import { getLocationNames } from "../../services/queries/resolvers";
import { Link } from "react-router-dom";

type Employee = { id: string; fullName?: string; email?: string };
type Entry = {
  id: string;
  employeeProfileId: string;
  locationId: string;
  clockInTime?: any;
  clockOutTime?: any;
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

export default function EmployeeTimesheetsAdmin() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<string>(""); // employeeProfileId
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rows, setRows] = useState<Entry[]>([]);
  const [locationNames, setLocationNames] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const snap = await getDocs(collection(db, "employeeMasterList"));
        const list: Employee[] = [];
        snap.forEach((d) => {
          const v = d.data() as any;
          list.push({
            id: d.id,
            fullName: v?.fullName || v?.name || d.id,
            email: v?.email,
          });
        });
        list.sort((a, b) =>
          (a.fullName || a.id).localeCompare(b.fullName || b.id)
        );
        setEmployees(list);
      } catch {
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!selected) return;
      try {
        setLoadingRows(true);
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        const qy = query(
          collection(db, "employeeTimeTracking"),
          where("employeeProfileId", "==", selected),
          where("clockInTime", ">=", Timestamp.fromDate(start)),
          orderBy("clockInTime", "desc"),
          limit(500)
        );
        const snap = await getDocs(qy);
        const list: Entry[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setRows(list);
        const locIds = Array.from(
          new Set(list.map((r) => r.locationId).filter(Boolean))
        );
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
      } finally {
        setLoadingRows(false);
      }
    })();
  }, [selected]);

  const selectedLabel = useMemo(() => {
    if (!selected) return "";
    const e = employees.find((x) => x.id === selected);
    return e?.fullName || selected;
  }, [selected, employees]);

  return (
    <RoleGuard allow={["owner", "admin", "super_admin"]}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-500">
            Employee timesheets (30 days)
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <select
            className="border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={loadingList}
          >
            <option value="">Select employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {(e.fullName || e.id) + (e.email ? ` – ${e.email}` : "")}
              </option>
            ))}
          </select>
          {selected && (
            <div className="text-sm text-zinc-500 md:text-right">
              {selectedLabel}
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1">
          <div className="p-2">
            <button
              className="px-3 py-1.5 rounded-md border text-sm"
              onClick={() => exportCsv(rows, selectedLabel)}
              disabled={!selected}
            >
              Export CSV
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2">Clock In</th>
                <th className="px-3 py-2">Clock Out</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Location</th>
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                <tr>
                  <td className="px-3 py-3" colSpan={4}>
                    Loading…
                  </td>
                </tr>
              ) : !selected ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={4}>
                    Select an employee to view entries.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={4}>
                    No entries.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-top border-zinc-100 dark:border-zinc-700"
                  >
                    <td className="px-3 py-2">{fmt(r.clockInTime)}</td>
                    <td className="px-3 py-2">{fmt(r.clockOutTime)}</td>
                    <td className="px-3 py-2">
                      {hoursBetween(r.clockInTime, r.clockOutTime)}
                    </td>
                    <td className="px-3 py-2" title={r.locationId}>
                      <Link
                        to={`/crm/locations/${r.locationId}`}
                        className="underline text-blue-600 dark:text-blue-400"
                      >
                        {locationNames[r.locationId] || r.locationId}
                      </Link>
                    </td>
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

function exportCsv(rows: Entry[], employeeLabel: string) {
  const header = [
    "clockIn",
    "clockOut",
    "hours",
    "locationId",
    "locationName",
    "employee",
  ];
  const out = rows.map((r) => [
    fmt(r.clockInTime),
    fmt(r.clockOutTime),
    hoursBetween(r.clockInTime, r.clockOutTime),
    r.locationId || "",
    "", // location names are resolved in UI; left blank or could be stitched in if needed
    employeeLabel,
  ]);
  const csv = [header, ...out]
    .map((row) =>
      row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `employee-timesheets-${employeeLabel.replaceAll(
    " ",
    "-"
  )}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
