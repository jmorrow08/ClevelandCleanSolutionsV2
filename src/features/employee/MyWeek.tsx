import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { startOfWeek, endOfWeek, format } from "date-fns";

export default function MyWeek() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return setLoading(false);
        const db = getFirestore();
        const start = startOfWeek(new Date(), { weekStartsOn: 0 });
        const end = endOfWeek(new Date(), { weekStartsOn: 0 });
        // Prefer assignedEmployees array-contains
        let list: any[] = [];
        try {
          const q = query(
            collection(db, "serviceHistory"),
            where("assignedEmployees", "array-contains", user.uid),
            where("serviceDate", ">=", Timestamp.fromDate(start)),
            where("serviceDate", "<", Timestamp.fromDate(end)),
            orderBy("serviceDate", "asc")
          );
          const snap = await getDocs(q);
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        } catch (e) {
          // Fallback: load by date range only and filter by legacy employeeAssignments in UI
          const q = query(
            collection(db, "serviceHistory"),
            where("serviceDate", ">=", Timestamp.fromDate(start)),
            where("serviceDate", "<", Timestamp.fromDate(end)),
            orderBy("serviceDate", "asc")
          );
          const snap = await getDocs(q);
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          list = list.filter(
            (j) =>
              Array.isArray(j.employeeAssignments) &&
              j.employeeAssignments.some((a: any) => a?.uid === user.uid)
          );
        }
        setJobs(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    jobs.forEach((j) => {
      const dt = j?.serviceDate?.toDate ? j.serviceDate.toDate() : undefined;
      const key = dt ? dt.toISOString().slice(0, 10) : "";
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    });
    return map;
  }, [jobs]);

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : grouped.size === 0 ? (
        <div className="text-sm text-zinc-500">No assigned jobs this week.</div>
      ) : (
        [...grouped.entries()].map(([day, list]) => (
          <div
            key={day}
            className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1"
          >
            <div className="text-sm font-medium">
              {format(new Date(day), "EEE, MMM d")}
            </div>
            <ul className="mt-1 text-sm list-disc pl-5">
              {list.map((j) => (
                <li key={j.id}>{j.locationId || j.clientProfileId || j.id}</li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
