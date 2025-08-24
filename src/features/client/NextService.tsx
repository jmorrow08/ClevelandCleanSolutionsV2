import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";

type Job = {
  id: string;
  serviceDate?: any;
  employeeDisplayNames?: string[];
  employeeAssignments?: Array<{ name?: string; uid?: string }>;
  assignedEmployees?: string[];
};

function extractNames(job: Job): string[] {
  if (
    Array.isArray(job.employeeDisplayNames) &&
    job.employeeDisplayNames.length
  )
    return job.employeeDisplayNames;
  if (Array.isArray(job.employeeAssignments) && job.employeeAssignments.length)
    return job.employeeAssignments
      .map((a) => a?.name || a?.uid || "")
      .filter(Boolean);
  if (Array.isArray(job.assignedEmployees)) return job.assignedEmployees;
  return [];
}

export default function NextService() {
  const [loading, setLoading] = useState(true);
  const [nextJob, setNextJob] = useState<Job | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return setLoading(false);
        const db = getFirestore();
        // Resolve client profileId from users/{uid}
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const profileId = (userSnap.data() as any)?.profileId;
        if (!profileId) return setLoading(false);
        // Option B: serviceHistory next future job for this client
        try {
          const q = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            where("serviceDate", ">=", Timestamp.fromDate(new Date())),
            orderBy("serviceDate", "asc"),
            limit(1)
          );
          const snap = await getDocs(q);
          const job = snap.docs[0]?.data();
          if (job) setNextJob({ id: snap.docs[0].id, ...(job as any) });
        } catch (e: any) {
          console.warn("NextService may require composite index", e?.message);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <div className="font-medium mb-1">Upcoming Service</div>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : !nextJob ? (
        <div className="text-sm text-zinc-500">
          No upcoming service scheduled.
        </div>
      ) : (
        <div className="text-sm">
          <div>
            Date:{" "}
            {nextJob.serviceDate?.toDate
              ? nextJob.serviceDate.toDate().toLocaleString()
              : "—"}
          </div>
          <div className="mt-1">
            Team: {extractNames(nextJob).join(", ") || "TBD"}
          </div>
        </div>
      )}
    </div>
  );
}
