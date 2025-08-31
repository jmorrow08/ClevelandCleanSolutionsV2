import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getCountFromServer,
  where,
  query,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";

export default function HROverview() {
  const [loading, setLoading] = useState(true);
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);
  const [activeThisWeek, setActiveThisWeek] = useState<number | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        // employees: count employeeMasterList if exists, else fallback to users with role in [employee, admin, owner, super_admin]
        try {
          const c = await getCountFromServer(
            collection(db, "employeeMasterList")
          );
          setEmployeeCount(c.data().count);
        } catch (_) {
          try {
            const roles = ["employee", "admin", "owner", "super_admin"];
            const qy = query(
              collection(db, "users"),
              where("role", "in", roles)
            );
            const c2 = await getCountFromServer(qy);
            setEmployeeCount(c2.data().count);
          } catch {
            setEmployeeCount(null);
          }
        }

        // activeThisWeek: timesheets with start in last 7 days
        try {
          const end = new Date();
          const start = new Date();
          start.setDate(end.getDate() - 7);
          const qy = query(
            collection(db, "timesheets"),
            where("start", ">=", start)
          );
          const c3 = await getCountFromServer(qy);
          setActiveThisWeek(c3.data().count);
        } catch {
          setActiveThisWeek(null);
        }

        // pendingApprovals: timesheets without approvedInRunId
        try {
          const qy = query(
            collection(db, "timesheets"),
            where("approvedInRunId", "==", null)
          );
          const c4 = await getCountFromServer(qy);
          setPendingApprovals(c4.data().count);
        } catch {
          setPendingApprovals(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cards = [
    { label: "Employees", value: employeeCount },
    { label: "Timesheets (7d)", value: activeThisWeek },
    { label: "Pending Approvals", value: pendingApprovals },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg p-4 card-bg shadow-elev-1">
          <div className="text-sm text-zinc-500">{c.label}</div>
          <div className="text-2xl font-semibold mt-1">
            {loading ? "…" : c.value ?? "—"}
          </div>
        </div>
      ))}
    </div>
  );
}
