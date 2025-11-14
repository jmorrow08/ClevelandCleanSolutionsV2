import { useEffect, useRef, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  startAfter,
  DocumentSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';
import { firebaseConfig } from '../../services/firebase';
import { subDays } from 'date-fns';
import { Link } from 'react-router-dom';
import { getClientNames, getLocationNames } from '../../services/queries/resolvers';
import { makeDayBounds as makeDayBoundsUtil, formatJobWindow } from '../../utils/time';
import { deriveAdminStatus } from '../../services/statusMap';

type Job = {
  id: string;
  status?: string;
  serviceDate?: any;
  clientProfileId?: string;
  locationId?: string;
  archived?: boolean;
  archivedAt?: any;
  archivedBy?: string;
};

function StatusChips({ job }: { job: Job }) {
  const { primary, qa, payroll } = deriveAdminStatus(
    {
      status: job.status,
      serviceDate: job.serviceDate,
      payrollProcessed: (job as any)?.payrollProcessed,
    },
    new Date(),
  );
  const pill =
    primary === 'completed'
      ? 'bg-green-100 text-green-800'
      : primary === 'in_progress'
      ? 'bg-blue-100 text-blue-800'
      : primary === 'canceled'
      ? 'bg-red-100 text-red-800'
      : 'bg-zinc-100 text-zinc-800';
  return (
    <div className="flex items-center gap-1">
      <span className={`px-2 py-0.5 rounded-md text-xs ${pill}`}>{primary.replace('_', ' ')}</span>
      {primary === 'completed' && (
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] ${
            payroll === 'processed'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
          }`}
        >
          {payroll === 'processed' ? 'Payroll Processed' : 'Awaiting Payroll'}
        </span>
      )}
      {qa === 'needs_approval' && primary !== 'completed' && (
        <span className="px-2 py-0.5 rounded-md text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200">
          Pending QA
        </span>
      )}
      {job.archived && (
        <span className="px-2 py-0.5 rounded-md text-[10px] bg-gray-50 text-gray-700 border border-gray-200">
          Archived
        </span>
      )}
    </div>
  );
}

const PAGE_SIZE = 50; // Show 50 jobs per page instead of 100

type HistoryFilters = {
  startDate?: string;
  endDate?: string;
  clientId?: string;
  locationId?: string;
  jobId?: string;
};

export default function JobsList({
  showAll,
  includeArchived = false,
  filters,
}: {
  showAll: boolean;
  includeArchived?: boolean;
  filters?: HistoryFilters;
}) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [, setError] = useState<string | null>(null);
  const [locNames, setLocNames] = useState<Record<string, string>>({});
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [timeWindows, setTimeWindows] = useState<Record<string, string>>({});

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const pageDocsRef = useRef<Map<number, DocumentSnapshot | null>>(new Map());

  useEffect(() => {
    // Reset pagination when filters change
    setCurrentPage(1);
    setLastDoc(null);
    pageDocsRef.current = new Map();
    setTotalPages(1);
  }, [
    showAll,
    includeArchived,
    filters?.startDate,
    filters?.endDate,
    filters?.clientId,
    filters?.locationId,
    filters?.jobId,
  ]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        let qref;

        // If jobId is provided, fetch that single doc directly and short-circuit pagination
        if (filters?.jobId && filters.jobId.trim().length > 0) {
          const ref = doc(collection(db, 'serviceHistory'), filters.jobId.trim());
          const d = await getDoc(ref);
          const row = d.exists() ? ({ id: d.id, ...(d.data() as any) } as Job) : null;
          const list = row ? [row] : [];
          const filteredList = includeArchived ? list : list.filter((job) => job.archived !== true);
          setJobs(filteredList);
          setTotalPages(1);
          pageDocsRef.current = new Map();
          setLastDoc(null);
          return;
        }

        // Parse date filters if present
        const hasStart = !!filters?.startDate;
        const hasEnd = !!filters?.endDate;
        const parsedStart = hasStart ? new Date(filters!.startDate as string) : null;
        const parsedEnd = hasEnd ? new Date(filters!.endDate as string) : null;
        // Ensure end is end-of-day if provided
        if (parsedEnd) parsedEnd.setHours(23, 59, 59, 999);

        if (showAll) {
          // For showAll, we don't filter by date, just paginate through all records
          let baseQuery = query(collection(db, 'serviceHistory'), orderBy('serviceDate', 'desc'));

          // If user specified a date window, apply it server-side
          if (parsedStart && parsedEnd) {
            baseQuery = query(
              collection(db, 'serviceHistory'),
              where('serviceDate', '>=', Timestamp.fromDate(parsedStart)),
              where('serviceDate', '<=', Timestamp.fromDate(parsedEnd)),
              orderBy('serviceDate', 'desc'),
            );
          } else if (parsedStart && !parsedEnd) {
            baseQuery = query(
              collection(db, 'serviceHistory'),
              where('serviceDate', '>=', Timestamp.fromDate(parsedStart)),
              orderBy('serviceDate', 'desc'),
            );
          } else if (!parsedStart && parsedEnd) {
            baseQuery = query(
              collection(db, 'serviceHistory'),
              where('serviceDate', '<=', Timestamp.fromDate(parsedEnd)),
              orderBy('serviceDate', 'desc'),
            );
          }

          if (currentPage > 1) {
            const startDoc = pageDocsRef.current.get(currentPage - 1);
            if (startDoc) {
              qref = query(baseQuery, startAfter(startDoc), limit(PAGE_SIZE + 1));
            } else {
              qref = query(baseQuery, limit(PAGE_SIZE + 1));
            }
          } else {
            qref = query(baseQuery, limit(PAGE_SIZE + 1));
          }
        } else {
          const end = parsedEnd ?? new Date();
          const start = parsedStart ?? subDays(end, 90);
          const baseQuery = query(
            collection(db, 'serviceHistory'),
            where('serviceDate', '>=', Timestamp.fromDate(start)),
            where('serviceDate', '<=', Timestamp.fromDate(end)),
            orderBy('serviceDate', 'desc'),
          );

          if (currentPage > 1) {
            const startDoc = pageDocsRef.current.get(currentPage - 1);
            if (startDoc) {
              qref = query(baseQuery, startAfter(startDoc), limit(PAGE_SIZE + 1));
            } else {
              qref = query(baseQuery, limit(PAGE_SIZE + 1));
            }
          } else {
            qref = query(baseQuery, limit(PAGE_SIZE + 1));
          }
        }

        const snap = await getDocs(qref);
        const docs = snap.docs;
        const hasNextPage = docs.length > PAGE_SIZE;

        // Store the last document of this page for pagination
        const pageLastDoc = hasNextPage ? docs[PAGE_SIZE - 1] : docs[docs.length - 1];

        // Update page docs map (ref)
        pageDocsRef.current.set(currentPage, pageLastDoc);

        // Set lastDoc for UI state
        setLastDoc(pageLastDoc);

        // Take only PAGE_SIZE items for display
        const displayDocs = hasNextPage ? docs.slice(0, PAGE_SIZE) : docs;

        const list: Job[] = [];
        displayDocs.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));

        // Apply client/location filters in code to avoid composite index issues for now
        const filteredByEntity = list.filter((job) => {
          if (filters?.clientId && job.clientProfileId !== filters.clientId.trim()) return false;
          if (filters?.locationId && job.locationId !== filters.locationId.trim()) return false;
          return true;
        });

        // Filter archived records based on includeArchived flag
        const filteredList = includeArchived
          ? filteredByEntity
          : filteredByEntity.filter((job) => job.archived !== true);

        setJobs(filteredList);

        // Estimate total pages (this is approximate since we don't know total count)
        // We'll update this as user navigates
        setTotalPages((prev) => Math.max(prev, currentPage + (hasNextPage ? 1 : 0)));
      } catch (e: any) {
        console.warn('Service history index may be required', e?.message);
        setError(e?.message || 'Failed to load jobs');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [
    showAll,
    includeArchived,
    currentPage,
    filters?.startDate,
    filters?.endDate,
    filters?.clientId,
    filters?.locationId,
    filters?.jobId,
  ]);

  useEffect(() => {
    if (!jobs.length) return;
    (async () => {
      const locIds = Array.from(
        new Set(
          jobs.map((j) => j.locationId).filter((v): v is string => typeof v === 'string' && !!v),
        ),
      );
      if (locIds.length) {
        const names = await getLocationNames(locIds);
        setLocNames((prev) => {
          const next = { ...prev };
          locIds.forEach((id, i) => (next[id] = names[i] || id));
          return next;
        });
      }

      const clientIds = Array.from(
        new Set(
          jobs
            .map((j) => j.clientProfileId)
            .filter((v): v is string => typeof v === 'string' && !!v),
        ),
      );
      if (clientIds.length) {
        const names = await getClientNames(clientIds);
        setClientNames((prev) => {
          const next = { ...prev };
          clientIds.forEach((id, i) => (next[id] = names[i] || id));
          return next;
        });
      }
    })();
  }, [jobs]);

  // Compute time windows for jobs
  useEffect(() => {
    (async () => {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const map: Record<string, string> = {};
        for (const j of jobs) {
          const dt: Date | null = j.serviceDate?.toDate
            ? j.serviceDate.toDate()
            : j.serviceDate?.seconds
            ? new Date(j.serviceDate.seconds * 1000)
            : null;
          if (!dt || !j.locationId) {
            map[j.id] = formatJobWindow(j.serviceDate);
            continue;
          }
          const { start, end } = makeDayBoundsUtil(dt, 'America/New_York');
          try {
            const qref = query(
              collection(db, 'employeeTimeTracking'),
              where('locationId', '==', j.locationId),
              where('clockInTime', '>=', Timestamp.fromDate(start)),
              where('clockInTime', '<=', Timestamp.fromDate(end)),
              orderBy('clockInTime', 'asc'),
              limit(10),
            );
            const snap = await getDocs(qref);
            const rows: any[] = [];
            snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
            const assigned = Array.isArray((j as any).assignedEmployees)
              ? ((j as any).assignedEmployees as string[])
              : [];
            let rec = rows.find((r) => assigned.includes((r as any).employeeProfileId || ''));
            if (!rec) rec = rows[0];
            if (rec?.clockInTime?.toDate && rec?.clockOutTime?.toDate) {
              map[j.id] = formatJobWindow(j.serviceDate, {
                start: rec.clockInTime,
                end: rec.clockOutTime,
              });
            } else if (rec?.clockInTime?.toDate && !rec?.clockOutTime) {
              map[j.id] = formatJobWindow(j.serviceDate);
            } else {
              map[j.id] = formatJobWindow(j.serviceDate);
            }
          } catch {
            map[j.id] = formatJobWindow(j.serviceDate);
          }
        }
        setTimeWindows(map);
      } catch {}
    })();
  }, [jobs]);

  // Pagination helpers
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const hasNextPage = jobs.length === PAGE_SIZE && currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  return (
    <div className="space-y-2">
      <div className="hidden md:block overflow-x-auto rounded-lg card-bg shadow-elev-1">
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
                <tr key={j.id} className="border-t border-zinc-100 dark:border-zinc-700">
                  <td className="px-3 py-2">
                    {j.serviceDate?.toDate ? j.serviceDate.toDate().toLocaleDateString() : '—'}{' '}
                    <span className="text-[11px] text-zinc-500">
                      {timeWindows[j.id] || formatJobWindow(j.serviceDate)}
                    </span>
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
                          title={clientNames[j.clientProfileId] || j.clientProfileId}
                        >
                          {clientNames[j.clientProfileId] || j.clientProfileId}
                        </Link>
                      ) : (
                        j.id
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusChips job={j} />
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

      {/* Pagination Controls */}
      {!loading && jobs.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 card-bg rounded-lg shadow-elev-1">
          <div className="text-sm text-zinc-500">
            Page {currentPage} of {totalPages === 1 && hasNextPage ? `${currentPage}+` : totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={!hasPrevPage}
              className="px-3 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={!hasNextPage}
              className="px-3 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="rounded-lg p-3 card-bg shadow-elev-1 text-sm text-zinc-500">Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="rounded-lg p-3 card-bg shadow-elev-1 text-sm text-zinc-500">
            No jobs found.
          </div>
        ) : (
          jobs.map((j) => (
            <div key={j.id} className="rounded-lg p-3 card-bg shadow-elev-1">
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
                      title={clientNames[j.clientProfileId] || j.clientProfileId}
                    >
                      {clientNames[j.clientProfileId] || j.clientProfileId}
                    </Link>
                  ) : (
                    j.id
                  )}
                </div>
                <StatusChips job={j} />
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {j.serviceDate?.toDate ? j.serviceDate.toDate().toLocaleDateString() : '—'}{' '}
                <span className="text-[11px] text-zinc-500">
                  {timeWindows[j.id] || formatJobWindow(j.serviceDate)}
                </span>
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

      {/* Mobile Pagination Controls */}
      {!loading && jobs.length > 0 && (
        <div className="md:hidden flex items-center justify-between px-4 py-3 card-bg rounded-lg shadow-elev-1">
          <div className="text-sm text-zinc-500">
            Page {currentPage} of {totalPages === 1 && hasNextPage ? `${currentPage}+` : totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={!hasPrevPage}
              className="px-3 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={!hasNextPage}
              className="px-3 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
