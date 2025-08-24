import { useEffect, useState } from "react";
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
import { subDays } from "date-fns";
import { Link } from "react-router-dom";
import {
  getClientName,
  getLocationName,
} from "../../services/queries/resolvers";

type Job = {
  id: string;
  status?: string;
  serviceDate?: any;
  clientProfileId?: string;
  locationId?: string;
};

function mapUiStatus(legacy?: string): string {
  if (!legacy) return "unknown";
  // Prompt requirement: legacy 'Completed' → render 'completed_pending_approval'
  if (legacy === "Completed") return "completed_pending_approval";
  if (legacy === "Pending Approval") return "completed_pending_approval";
  if (legacy === "Scheduled") return "scheduled";
  if (legacy === "In Progress") return "in_progress";
  if (legacy === "Cancelled") return "canceled";
  return legacy;
}

export default function JobsList({ showAll }: { showAll: boolean }) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [, setError] = useState<string | null>(null);
  const [locNames, setLocNames] = useState<Record<string, string>>({});
  const [clientNames, setClientNames] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        let qref;
        if (showAll) {
          qref = query(
            collection(db, "serviceHistory"),
            orderBy("serviceDate", "desc"),
            limit(100)
          );
        } else {
          const end = new Date();
          const start = subDays(end, 90);
          qref = query(
            collection(db, "serviceHistory"),
            where("serviceDate", ">=", Timestamp.fromDate(start)),
            where("serviceDate", "<", Timestamp.fromDate(end)),
            orderBy("serviceDate", "desc"),
            limit(100)
          );
        }
        const snap = await getDocs(qref);
        const list: Job[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setJobs(list);
      } catch (e: any) {
        console.warn("Service history index may be required", e?.message);
        setError(e?.message || "Failed to load jobs");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showAll]);

  useEffect(() => {
    if (!jobs.length) return;
    (async () => {
      const locIds = Array.from(
        new Set(
          jobs
            .map((j) => j.locationId)
            .filter((v): v is string => typeof v === "string" && !!v)
        )
      );
      if (locIds.length) {
        const results = await Promise.all(
          locIds.map(async (id) => [id, await getLocationName(id)] as const)
        );
        setLocNames((prev) => {
          const next = { ...prev };
          results.forEach(([id, name]) => (next[id] = name));
          return next;
        });
      }

      const clientIds = Array.from(
        new Set(
          jobs
            .map((j) => j.clientProfileId)
            .filter((v): v is string => typeof v === "string" && !!v)
        )
      );
      if (clientIds.length) {
        const results = await Promise.all(
          clientIds.map(async (id) => [id, await getClientName(id)] as const)
        );
        setClientNames((prev) => {
          const next = { ...prev };
          results.forEach(([id, name]) => (next[id] = name));
          return next;
        });
      }
    })();
  }, [jobs]);

  return (
    <div className="space-y-2">
      <div className="hidden md:block overflow-x-auto rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1">
        <table className="min-w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Location/Client</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4" colSpan={4}>
                  Loading…
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500" colSpan={4}>
                  No jobs found.
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr
                  key={j.id}
                  className="border-t border-zinc-100 dark:border-zinc-700"
                >
                  <td className="px-3 py-2">
                    {j.serviceDate?.toDate
                      ? j.serviceDate.toDate().toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 max-w-[320px]">
                    <div className="truncate">
                      {j.locationId ? (
                        <Link
                          to={`/crm/locations/${j.locationId}`}
                          className="text-blue-600 dark:text-blue-400 underline"
                          title={locNames[j.locationId] || j.locationId}
                        >
                          {locNames[j.locationId] || j.locationId}
                        </Link>
                      ) : j.clientProfileId ? (
                        <Link
                          to={`/crm/clients/${j.clientProfileId}`}
                          className="text-blue-600 dark:text-blue-400 underline"
                          title={
                            clientNames[j.clientProfileId] || j.clientProfileId
                          }
                        >
                          {clientNames[j.clientProfileId] || j.clientProfileId}
                        </Link>
                      ) : (
                        j.id
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                      {mapUiStatus(j.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to={`/service-history/${j.id}`}
                      className="text-blue-600 dark:text-blue-400 underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
            Loading…
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
            No jobs found.
          </div>
        ) : (
          jobs.map((j) => (
            <div
              key={j.id}
              className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium min-w-0 flex-1 truncate">
                  {j.locationId ? (
                    <Link
                      to={`/crm/locations/${j.locationId}`}
                      className="text-blue-600 dark:text-blue-400 underline"
                      title={locNames[j.locationId] || j.locationId}
                    >
                      {locNames[j.locationId] || j.locationId}
                    </Link>
                  ) : j.clientProfileId ? (
                    <Link
                      to={`/crm/clients/${j.clientProfileId}`}
                      className="text-blue-600 dark:text-blue-400 underline"
                      title={
                        clientNames[j.clientProfileId] || j.clientProfileId
                      }
                    >
                      {clientNames[j.clientProfileId] || j.clientProfileId}
                    </Link>
                  ) : (
                    j.id
                  )}
                </div>
                <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                  {mapUiStatus(j.status)}
                </span>
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {j.serviceDate?.toDate
                  ? j.serviceDate.toDate().toLocaleDateString()
                  : "—"}
              </div>
              <div className="mt-2 text-right">
                <Link
                  to={`/service-history/${j.id}`}
                  className="text-blue-600 dark:text-blue-400 underline text-sm"
                >
                  View
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
