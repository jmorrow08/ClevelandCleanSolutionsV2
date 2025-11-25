import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
  updateDoc,
  Timestamp,
  writeBatch,
  limit,
  deleteField,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firebaseConfig } from '../../services/firebase';
import { makeDayBounds as makeDayBoundsUtil, formatJobWindow } from '../../utils/time';
import { getClientName, getLocationName, getEmployeeNames } from '../../services/queries/resolvers';
import { mapLegacyStatus, type CanonicalStatus } from '../../services/statusMap';
import { RoleGuard } from '../../context/RoleGuard';
import EmployeeAssignmentForm from './EmployeeAssignmentForm';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { makeDayBounds, mergePhotoResults } from '../../services/firebase';

type JobRecord = {
  id: string;
  serviceDate?: any;
  clientProfileId?: string;
  locationId?: string;
  assignedEmployees?: string[];
  status?: string;
  statusV2?: CanonicalStatus;
};

type Note = {
  id: string;
  message: string;
  createdAt?: any;
  authorRole?: string;
};

export default function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { claims } = useAuth();

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [clientName, setClientName] = useState<string>('');
  const [locationName, setLocationName] = useState<string>('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState<string>('');
  const [postingNote, setPostingNote] = useState(false);
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [savingAdminNotes, setSavingAdminNotes] = useState(false);
  const [assignedDisplay, setAssignedDisplay] = useState<string[]>([]);
  const [deleting] = useState(false);
  const { show } = useToast();

  // Check if user has admin permissions
  const isAdmin = claims?.admin || claims?.owner || claims?.super_admin;

  // UI tabs: Overview vs Approval
  const [activeTab, setActiveTab] = useState<'overview' | 'approval'>('overview');

  // Approval state
  type PhotoItem = {
    id: string;
    photoUrl?: string;
    uploadedAt?: any;
    employeeName?: string;
    employeeProfileId?: string;
    locationId?: string;
    serviceHistoryId?: string | null;
    isClientVisible?: boolean;
    notes?: string | null;
  };
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photoState, setPhotoState] = useState<
    Record<string, { isClientVisible: boolean; notes?: string }>
  >({});
  const [notesFieldExists, setNotesFieldExists] = useState<Record<string, boolean>>({});
  const [statusLegacy, setStatusLegacy] = useState<string>('');
  const [savingApproval, setSavingApproval] = useState(false);
  const [timeWindow, setTimeWindow] = useState<string>('');

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        if (!jobId) return;
        const db = getFirestore();
        const snap = await getDoc(doc(db, 'serviceHistory', jobId));
        if (!snap.exists()) {
          setJob(null);
          return;
        }
        const j = { id: snap.id, ...(snap.data() as any) } as JobRecord;
        setJob(j);
        setStatusLegacy(((snap.data() as any)?.status as string) || '');
        if (j.clientProfileId) setClientName(await getClientName(j.clientProfileId));
        if (j.locationId) setLocationName(await getLocationName(j.locationId));

        // Load admin notes from job data
        setAdminNotes((j as any).adminNotes || '');

        // Load notes for this job (client/admin notes from jobNotes + employee day notes)
        try {
          const list: Note[] = [];
          // 1) jobNotes linked to this job (no orderBy to avoid composite index)
          const ns = await getDocs(query(collection(db, 'jobNotes'), where('jobId', '==', jobId)));
          ns.forEach((d) => {
            const data = d.data() as any;
            // Filter out admin notes since we display them separately
            if (data.authorRole !== 'admin') {
              list.push({ id: d.id, ...(d.data() as any) } as Note);
            }
          });
          // 2) employee day notes for same location and service date
          if (j.locationId && j.serviceDate) {
            console.log('🔍 DEBUG: Loading employee notes for job:', {
              jobId,
              locationId: j.locationId,
              serviceDate: j.serviceDate,
              serviceDateType: typeof j.serviceDate,
            });

            const dt: Date = j.serviceDate?.toDate
              ? j.serviceDate.toDate()
              : (j.serviceDate as any)?.seconds
              ? new Date((j.serviceDate as any).seconds * 1000)
              : new Date();

            console.log('🔍 DEBUG: Parsed service date:', dt);

            const { start, end } = makeDayBoundsUtil(dt, 'America/New_York');
            console.log('🔍 DEBUG: Date range for employee notes:', {
              start: start.toISOString(),
              end: end.toISOString(),
              timezone: 'America/New_York',
            });

            try {
              // Query by locationId only, then filter by date client-side to avoid composite index requirement
              const locationNotesQuery = query(
                collection(db, 'generalJobNotes'),
                where('locationId', '==', j.locationId),
              );
              const locationNotesSnapshot = await getDocs(locationNotesQuery);
              console.log(
                `Employee notes for location ${j.locationId}: ${locationNotesSnapshot.size} found`,
              );

              // Filter by date client-side
              const filteredNotes: any[] = [];
              locationNotesSnapshot.forEach((doc) => {
                const data = doc.data();
                const createdAt = data.createdAt;

                if (createdAt && typeof createdAt.toDate === 'function') {
                  const noteDate = createdAt.toDate();
                  if (noteDate >= start && noteDate <= end) {
                    filteredNotes.push({
                      id: doc.id,
                      data: data,
                    });
                  }
                }
              });

              console.log(`Employee notes in date range: ${filteredNotes.length}`);

              filteredNotes.forEach((item) => {
                const data = item.data;
                list.push({
                  id: item.id,
                  message: data.notes,
                  createdAt: data.createdAt,
                  authorRole: 'employee',
                });
              });
            } catch (error) {
              console.error('Error loading employee notes:', error);
            }
          } else {
            console.log('🔍 DEBUG: Missing required data for employee notes:', {
              locationId: j.locationId,
              serviceDate: j.serviceDate,
            });
          }
          // Sort newest first by createdAt, handling Firestore Timestamp-like values
          list.sort((a, b) => {
            const getMs = (t: any) =>
              t?.toDate ? t.toDate().getTime() : t?.seconds ? t.seconds * 1000 : 0;
            return getMs(b.createdAt) - getMs(a.createdAt);
          });
          setNotes(list);
        } catch {
          setNotes([]);
        }

        // Resolve assigned employee display names
        try {
          const names = await getEmployeeNames(j.assignedEmployees);
          setAssignedDisplay(names);
        } catch {
          setAssignedDisplay([]);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobId]);

  // Compute time window for header
  useEffect(() => {
    (async () => {
      try {
        if (!job || !job.locationId || !job.serviceDate) {
          setTimeWindow(job?.serviceDate ? formatJobWindow(job.serviceDate) : '');
          return;
        }
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const dt: Date = job.serviceDate?.toDate
          ? job.serviceDate.toDate()
          : (job.serviceDate as any)?.seconds
          ? new Date((job.serviceDate as any).seconds * 1000)
          : new Date();
        const { start, end } = makeDayBoundsUtil(dt, 'America/New_York');
        const qref = query(
          collection(db, 'employeeTimeTracking'),
          where('locationId', '==', job.locationId),
          where('clockInTime', '>=', Timestamp.fromDate(start)),
          where('clockInTime', '<=', Timestamp.fromDate(end)),
          orderBy('clockInTime', 'asc'),
          limit(10),
        );
        const snap = await getDocs(qref);
        const rows: any[] = [];
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
        const assigned = Array.isArray(job.assignedEmployees)
          ? (job.assignedEmployees as string[])
          : [];
        let rec = rows.find((r) => assigned.includes((r as any).employeeProfileId || ''));
        if (!rec) rec = rows[0];
        if (rec?.clockInTime?.toDate && rec?.clockOutTime?.toDate) {
          setTimeWindow(
            formatJobWindow(job.serviceDate, {
              start: rec.clockInTime,
              end: rec.clockOutTime,
            }),
          );
        } else if (rec?.clockInTime?.toDate && !rec?.clockOutTime) {
          setTimeWindow(formatJobWindow(job.serviceDate));
        } else {
          setTimeWindow(formatJobWindow(job.serviceDate));
        }
      } catch {
        setTimeWindow(job?.serviceDate ? formatJobWindow(job.serviceDate) : '');
      }
    })();
  }, [job?.id, job?.serviceDate, job?.locationId]);

  const statusCanonical = useMemo(() => {
    if (!job) return undefined;
    return job.statusV2 || mapLegacyStatus(job.status) || undefined;
  }, [job]);

  async function handleSave(updated: Partial<JobRecord> & { serviceDate?: Date }) {
    if (!job || !jobId) return;
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    const payload: any = {};
    if (Array.isArray(updated.assignedEmployees))
      payload.assignedEmployees = updated.assignedEmployees;
    if (updated.serviceDate instanceof Date)
      payload.serviceDate = Timestamp.fromDate(updated.serviceDate);
    if ((updated as any).statusV2) payload.statusV2 = (updated as any).statusV2;
    await updateDoc(doc(db, 'serviceHistory', jobId), payload);
    setJob((prev) => (prev ? { ...prev, ...payload } : prev));
  }

  async function saveAdminNotes() {
    const notes = adminNotes.trim();
    if (!jobId) return;
    try {
      setSavingAdminNotes(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      await updateDoc(doc(db, 'serviceHistory', jobId), {
        adminNotes: notes,
        updatedAt: serverTimestamp(),
      });
      show({ type: 'success', message: 'Admin notes saved successfully' });
    } catch (error: any) {
      show({
        type: 'error',
        message: `Failed to save admin notes: ${error.message}`,
      });
    } finally {
      setSavingAdminNotes(false);
    }
  }

  async function postNote() {
    const text = newNote.trim();
    if (!text || !jobId || !job) return;
    try {
      setPostingNote(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const auth = getAuth();
      const claims = (await auth.currentUser?.getIdTokenResult(true))?.claims as any;
      let authorRole: string = 'employee';
      if (claims?.admin || claims?.owner || claims?.super_admin) authorRole = 'admin';
      const payload: any = {
        jobId,
        locationId: job.locationId || null,
        message: text,
        authorRole,
        createdAt: serverTimestamp(),
        date: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'jobNotes'), payload);
      setNotes((prev) => [{ id: ref.id, ...payload }, ...prev]);
      setNewNote('');
    } catch {
      // ignore
    } finally {
      setPostingNote(false);
    }
  }

  function approveAll() {
    setPhotoState((prev) => {
      const next: typeof prev = { ...prev };
      for (const p of photos) {
        next[p.id] = {
          isClientVisible: true,
          notes: prev[p.id]?.notes ?? (notesFieldExists[p.id] ? p.notes ?? '' : undefined),
        };
      }
      return next;
    });
  }

  function unapproveAll() {
    setPhotoState((prev) => {
      const next: typeof prev = { ...prev };
      for (const p of photos) {
        next[p.id] = {
          isClientVisible: false,
          notes: prev[p.id]?.notes ?? (notesFieldExists[p.id] ? p.notes ?? '' : undefined),
        };
      }
      return next;
    });
  }

  async function saveApproval() {
    if (!jobId || !job) return;
    const prevState = photoState;
    const prevStatus = job.status || '';
    const hadApprovedAt = job ? Object.prototype.hasOwnProperty.call(job, 'approvedAt') : false;
    const hadApprovedBy = job ? Object.prototype.hasOwnProperty.call(job, 'approvedBy') : false;
    const prevApprovedAt = hadApprovedAt ? (job as any).approvedAt ?? null : undefined;
    const prevApprovedBy = hadApprovedBy ? (job as any).approvedBy ?? null : undefined;

    try {
      setSavingApproval(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const auth = getAuth();

      const batch = writeBatch(db);

      let anyBecameVisible = false;
      // Prepare photo updates
      for (const p of photos) {
        const originalVisible = !!(p as any).isClientVisible;
        const current = photoState[p.id] || {
          isClientVisible: originalVisible,
          notes: notesFieldExists[p.id] ? p.notes ?? '' : undefined,
        };
        const nextVisible = !!current.isClientVisible;
        const notesChanged = notesFieldExists[p.id]
          ? (current.notes ?? '') !== ((p.notes as any) ?? '')
          : false;
        const visChanged = nextVisible !== originalVisible;
        if (visChanged || notesChanged) {
          const payload: any = {};
          if (visChanged) payload.isClientVisible = nextVisible;
          if (notesChanged) payload.notes = current.notes ?? null;
          batch.update(doc(db, 'servicePhotos', p.id), payload);
        }
        if (!originalVisible && nextVisible) anyBecameVisible = true;
      }

      // Prepare job status update
      const statusChanged = (statusLegacy || '') !== prevStatus;
      const isTransitionToCompleted = statusChanged && statusLegacy === 'Completed';
      if (statusChanged || anyBecameVisible) {
        if (isTransitionToCompleted) {
          try {
            const { validateJobPayrollReadiness } = await import(
              '../../services/payroll/payrollService'
            );
            const missingRateEmployeeIds = await validateJobPayrollReadiness(jobId!);
            if (missingRateEmployeeIds.length) {
              const names = await getEmployeeNames(missingRateEmployeeIds);
              const readableNames = missingRateEmployeeIds.map((id, index) => names[index] || id);
              show({
                type: 'error',
                message: `Cannot complete job. Missing pay rates for: ${readableNames.join(', ')}.`,
              });
              setStatusLegacy(prevStatus);
              setSavingApproval(false);
              return;
            }
          } catch (error) {
            console.error('Failed to validate payroll readiness:', error);
            show({
              type: 'error',
              message:
                error instanceof Error
                  ? error.message
                  : 'Unable to verify pay rates for this job. Try again later.',
            });
            setStatusLegacy(prevStatus);
            setSavingApproval(false);
            return;
          }
        }
        const payload: any = {};
        if (statusChanged) payload.status = statusLegacy || null;
        if (anyBecameVisible || isTransitionToCompleted) {
          payload.approvedAt = serverTimestamp();
          payload.approvedBy = auth.currentUser?.uid || null;
        }
        batch.update(doc(db, 'serviceHistory', jobId), payload);
      }

      await batch.commit();

      // Apply local updates
      setPhotos((prev) =>
        prev.map((p) => {
          const st = photoState[p.id];
          if (!st) return p;
          const out: any = { ...p };
          if (st.isClientVisible !== undefined) out.isClientVisible = st.isClientVisible;
          if (notesFieldExists[p.id] && st.notes !== undefined) out.notes = st.notes;
          return out;
        }),
      );
      if (statusChanged || anyBecameVisible) {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: statusLegacy || prev.status,
              }
            : prev,
        );

        // Auto-update timesheet earnings and payroll entries when job transitions to completed
        if (isTransitionToCompleted) {
          try {
            const [
              { updateTimesheetEarningsOnJobCompletion, rollbackTimesheetEarningsOnJobCompletion },
              { createPayrollEntriesForJob },
            ] = await Promise.all([
              import('../../services/automation/timesheetAutomation'),
              import('../../services/payroll/payrollService'),
            ]);
            const timesheetResult = await updateTimesheetEarningsOnJobCompletion(jobId!);
            try {
              await createPayrollEntriesForJob(jobId!);
            } catch (payrollError) {
              if (timesheetResult.timesheetIds?.length) {
                try {
                  await rollbackTimesheetEarningsOnJobCompletion(timesheetResult.timesheetIds);
                } catch (timesheetRollbackError) {
                  console.error(
                    'Failed to rollback timesheet approvals after payroll entry failure:',
                    timesheetRollbackError,
                  );
                }
              }
              throw payrollError;
            }
          } catch (error) {
            console.error('Failed to run post-completion payroll updates:', error);
            const rollbackPayload: Record<string, any> = {
              status: prevStatus || null,
            };
            if (prevApprovedAt !== undefined) {
              rollbackPayload.approvedAt = prevApprovedAt;
            } else {
              rollbackPayload.approvedAt = deleteField();
            }
            if (prevApprovedBy !== undefined) {
              rollbackPayload.approvedBy = prevApprovedBy;
            } else {
              rollbackPayload.approvedBy = deleteField();
            }
            try {
              await updateDoc(doc(db, 'serviceHistory', jobId), rollbackPayload);
            } catch (rollbackError) {
              console.error('Failed to rollback job completion state:', rollbackError);
            }
            setStatusLegacy(prevStatus);
            setJob((prevJob) => {
              if (!prevJob) return prevJob;
              const next: Record<string, any> = {
                ...prevJob,
                status: prevStatus || prevJob.status,
              };
              if (prevApprovedAt !== undefined) {
                next.approvedAt = prevApprovedAt;
              } else {
                delete next.approvedAt;
              }
              if (prevApprovedBy !== undefined) {
                next.approvedBy = prevApprovedBy;
              } else {
                delete next.approvedBy;
              }
              return next;
            });
            show({
              type: 'error',
              message:
                error instanceof Error
                  ? error.message
                  : 'Job marked completed, but payroll updates failed. Please review payroll.',
            });
            return;
          }
        }
      }
      show({ type: 'success', message: 'Approval changes saved.' });
    } catch (e: any) {
      // Rollback UI
      setPhotoState(prevState);
      setStatusLegacy(prevStatus);
      show({ type: 'error', message: e?.message || 'Failed to save changes.' });
    } finally {
      setSavingApproval(false);
    }
  }

  async function attachToJob(photoId: string) {
    if (!jobId) return;
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      await updateDoc(doc(db, 'servicePhotos', photoId), {
        serviceHistoryId: jobId,
      });
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, serviceHistoryId: jobId } : p)),
      );
      show({ type: 'success', message: 'Photo attached to this job.' });
    } catch (e: any) {
      show({ type: 'error', message: e?.message || 'Failed to attach photo.' });
    }
  }

  // Load photos for Approval tab (on-demand when tab becomes active and job is available)
  useEffect(() => {
    async function loadPhotosForApproval(j: JobRecord) {
      if (!jobId) return;
      try {
        setApprovalLoading(true);
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Primary: photos linked by serviceHistoryId
        const qPrimary = query(
          collection(db, 'servicePhotos'),
          where('serviceHistoryId', '==', jobId),
        );
        const [primarySnap, fallbackSnap] = await Promise.all([
          getDocs(qPrimary),
          (async () => {
            // Fallback requires both serviceDate and locationId
            if (!j.locationId || !j.serviceDate) return null as any;
            const { start, end } = makeDayBounds(j.serviceDate, 'America/New_York');
            const qFallback = query(
              collection(db, 'servicePhotos'),
              where('locationId', '==', j.locationId),
              where('uploadedAt', '>=', Timestamp.fromDate(start)),
              where('uploadedAt', '<=', Timestamp.fromDate(end)),
            );
            return await getDocs(qFallback);
          })(),
        ]);

        const primary: PhotoItem[] = [];
        primarySnap.forEach((d: any) => primary.push({ id: d.id, ...(d.data() as any) }));
        const fallback: PhotoItem[] = [];
        if (fallbackSnap) {
          fallbackSnap.forEach((d: any) => fallback.push({ id: d.id, ...(d.data() as any) }));
        }
        const merged = mergePhotoResults(primary, fallback);
        setPhotos(merged);
        // Initialize per-photo state and notes existence map
        const initState: Record<string, { isClientVisible: boolean; notes?: string }> = {};
        const notesExists: Record<string, boolean> = {};
        for (const p of merged) {
          const isVis = !!(p as any).isClientVisible;
          initState[p.id] = {
            isClientVisible: isVis,
            notes: (Object.prototype.hasOwnProperty.call(p, 'notes')
              ? (p.notes as any) || ''
              : undefined) as any,
          };
          notesExists[p.id] = Object.prototype.hasOwnProperty.call(p, 'notes');
        }
        setPhotoState(initState);
        setNotesFieldExists(notesExists);
      } finally {
        setApprovalLoading(false);
      }
    }
    if (activeTab === 'approval' && job) {
      loadPhotosForApproval(job);
    }
  }, [activeTab, job, jobId]);

  // Delete disabled intentionally per business rule: service history cannot be deleted

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <Link to="/service-history" className="underline">
          Service History
        </Link>
        <span className="mx-2">/</span>
        <span className="opacity-70">Job {jobId}</span>
      </div>
      <div className="rounded-lg p-4 card-bg shadow-elev-1">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : !job ? (
          <div className="text-sm text-zinc-500">Not found.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">{locationName || clientName || job.id}</div>
                <div className="text-xs text-zinc-500 mt-0.5 truncate">
                  {job.serviceDate?.toDate ? job.serviceDate.toDate().toLocaleDateString() : '—'}{' '}
                  <span className="text-xs text-zinc-500">
                    {timeWindow || (job.serviceDate ? formatJobWindow(job.serviceDate) : '')}
                  </span>
                  {statusCanonical ? (
                    <span className="ml-2 px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                      {statusCanonical}
                    </span>
                  ) : null}
                </div>
                {assignedDisplay.length ? (
                  <div className="text-xs text-zinc-500 mt-0.5 truncate">
                    Assigned: {assignedDisplay.join(', ')}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 flex items-center gap-2"></div>
            </div>

            {/* Tabs */}
            <div className="border-b border-zinc-200 dark:border-zinc-700">
              <nav className="flex gap-2 text-sm">
                <button
                  className={`px-3 py-1.5 rounded-t-md ${
                    activeTab === 'overview'
                      ? 'bg-zinc-100 dark:bg-zinc-700'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  }`}
                  onClick={() => setActiveTab('overview')}
                >
                  Overview
                </button>
                <RoleGuard allow={['admin', 'owner', 'super_admin']}>
                  <button
                    className={`px-3 py-1.5 rounded-t-md ${
                      activeTab === 'approval'
                        ? 'bg-zinc-100 dark:bg-zinc-700'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-700'
                    }`}
                    onClick={() => setActiveTab('approval')}
                  >
                    Approval
                  </button>
                </RoleGuard>
              </nav>
            </div>

            {activeTab === 'overview' ? (
              <>
                {/* Job Overview - Always show details */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium mb-2">Job Details</div>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-zinc-500">Client:</span>{' '}
                          {clientName || job.clientProfileId || '—'}
                        </div>
                        <div>
                          <span className="text-zinc-500">Location:</span>{' '}
                          {locationName || job.locationId || '—'}
                        </div>
                        <div>
                          <span className="text-zinc-500">Service Date:</span>{' '}
                          {job.serviceDate?.toDate
                            ? job.serviceDate.toDate().toLocaleString()
                            : '—'}
                        </div>
                        <div>
                          <span className="text-zinc-500">Status:</span>{' '}
                          <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                            {statusCanonical || '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-2">Assigned Employees</div>
                      {assignedDisplay.length > 0 ? (
                        <div className="space-y-1">
                          {assignedDisplay.map((name, i) => (
                            <div key={i} className="text-sm">
                              {name}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-zinc-500">No employees assigned</div>
                      )}
                    </div>
                  </div>

                  {/* Employee Assignment Editing - Always available for admins */}
                  <RoleGuard allow={['admin', 'owner', 'super_admin']}>
                    <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4">
                      <div className="text-sm font-medium mb-3">Edit Employee Assignments</div>
                      <EmployeeAssignmentForm job={job} onSave={handleSave} />
                    </div>
                  </RoleGuard>
                </div>

                <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3 space-y-6">
                  {/* Admin Notes Section - Only visible to admins */}
                  <RoleGuard allow={['admin', 'owner', 'super_admin']}>
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <div className="font-medium text-blue-900 dark:text-blue-100">
                          Admin Notes
                        </div>
                        <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
                          Client Visible
                        </span>
                      </div>
                      <div className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                        These notes will be visible to clients in the client portal
                      </div>
                      <textarea
                        className="w-full border border-blue-300 dark:border-blue-700 rounded-md p-3 card-bg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={4}
                        placeholder="Add admin notes for this job..."
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        disabled={savingAdminNotes}
                      />
                      <div className="mt-3">
                        <button
                          className={`px-4 py-2 rounded-md text-white text-sm font-medium transition-colors ${
                            savingAdminNotes || !adminNotes.trim()
                              ? 'bg-zinc-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500'
                          }`}
                          onClick={saveAdminNotes}
                          disabled={savingAdminNotes || !adminNotes.trim()}
                        >
                          {savingAdminNotes ? (
                            <span className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Saving…
                            </span>
                          ) : (
                            'Save Admin Notes'
                          )}
                        </button>
                      </div>
                    </div>
                  </RoleGuard>

                  {/* General Notes Section */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        Notes & Communication
                      </div>
                    </div>
                    <div className="space-y-3">
                      {notes.length === 0 ? (
                        <div className="text-sm text-zinc-500 italic py-4 text-center">
                          No notes have been added yet.
                        </div>
                      ) : (
                        notes.map((n) => (
                          <div
                            key={n.id}
                            className={`rounded-lg p-4 border ${
                              n.authorRole === 'employee'
                                ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  n.authorRole === 'employee' ? 'bg-orange-500' : 'bg-gray-500'
                                }`}
                              ></div>
                              <span
                                className={`text-xs font-semibold uppercase ${
                                  n.authorRole === 'employee'
                                    ? 'text-orange-700 dark:text-orange-300'
                                    : 'text-gray-600 dark:text-gray-400'
                                }`}
                              >
                                {n.authorRole === 'employee'
                                  ? 'Employee Note'
                                  : n.authorRole || 'Note'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : ''}
                              </span>
                            </div>
                            <div className="text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                              {n.message}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Allow all roles to add notes; permissions enforced server-side */}
                    <div className="mt-4 border-t border-gray-200 dark:border-gray-600 pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">Add Note</div>
                      </div>
                      <textarea
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md p-3 card-bg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        rows={3}
                        placeholder="Add a note for this job…"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        disabled={postingNote}
                      />
                      <div className="mt-3">
                        <button
                          className={`px-4 py-2 rounded-md text-white text-sm font-medium transition-colors ${
                            postingNote || !newNote.trim()
                              ? 'bg-zinc-400 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500'
                          }`}
                          onClick={postNote}
                          disabled={postingNote || !newNote.trim()}
                        >
                          {postingNote ? (
                            <span className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Posting…
                            </span>
                          ) : (
                            'Add Note'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              // Approval tab
              <RoleGuard allow={['admin', 'owner', 'super_admin']}>
                <div className="space-y-3">
                  {/* Status dropdown (legacy labels) */}
                  <div className="flex items-end gap-3">
                    <div>
                      <label className="block text-sm mb-1">Job Status</label>
                      <select
                        className="w-full border rounded-md p-2 card-bg text-sm"
                        value={statusLegacy}
                        onChange={(e) => setStatusLegacy(e.target.value)}
                      >
                        {[
                          'Scheduled',
                          'In Progress',
                          'Started',
                          'Pending Approval',
                          'Completed',
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:bg-zinc-400"
                        onClick={approveAll}
                        disabled={approvalLoading || photos.length === 0}
                      >
                        Approve all
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm disabled:bg-zinc-400"
                        onClick={unapproveAll}
                        disabled={approvalLoading || photos.length === 0}
                      >
                        Unapprove all
                      </button>
                      <button
                        className={`px-3 py-1.5 rounded-md text-white ${
                          savingApproval
                            ? 'bg-zinc-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                        onClick={saveApproval}
                        disabled={savingApproval}
                      >
                        {savingApproval ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {/* Missing data warning for fallback */}
                  {!job.locationId || !job.serviceDate ? (
                    <div className="text-xs text-amber-600">
                      Needs data: service date and location are required to find older uploads.
                    </div>
                  ) : null}

                  {/* Photos grid */}
                  {approvalLoading ? (
                    <div className="text-sm text-zinc-500">Loading photos…</div>
                  ) : photos.length === 0 ? (
                    <div className="text-sm text-zinc-500">No photos found for this service.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {photos.map((p) => {
                        const st = photoState[p.id] || {
                          isClientVisible: !!p.isClientVisible,
                        };
                        const showNotes = !!notesFieldExists[p.id];
                        const notesVal = st.notes ?? p.notes ?? '';
                        const isAttached = p.serviceHistoryId === jobId;
                        return (
                          <div key={p.id} className="rounded-lg p-3 bg-[var(--muted)]">
                            {p.photoUrl ? (
                              <img
                                src={p.photoUrl}
                                alt="service"
                                className="w-full h-40 object-cover rounded cursor-pointer"
                                onClick={() => window.open(p.photoUrl!, '_blank')}
                              />
                            ) : (
                              <div className="w-full h-40 bg-zinc-200 dark:bg-zinc-800 rounded" />
                            )}
                            <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                              <div>
                                {p.uploadedAt?.toDate
                                  ? p.uploadedAt.toDate().toLocaleString()
                                  : p.uploadedAt?.seconds
                                  ? new Date(p.uploadedAt.seconds * 1000).toLocaleString()
                                  : ''}
                              </div>
                              <div>{p.employeeName || p.employeeProfileId || '—'}</div>
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-sm">
                              <input
                                id={`vis-${p.id}`}
                                type="checkbox"
                                checked={!!st.isClientVisible}
                                onChange={(e) =>
                                  setPhotoState((prev) => ({
                                    ...prev,
                                    [p.id]: {
                                      ...prev[p.id],
                                      isClientVisible: e.target.checked,
                                      notes:
                                        prev[p.id]?.notes ??
                                        (notesFieldExists[p.id] ? p.notes ?? '' : undefined),
                                    },
                                  }))
                                }
                              />
                              <label htmlFor={`vis-${p.id}`}>Visible to client</label>
                            </div>
                            {showNotes ? (
                              <div className="mt-2">
                                <textarea
                                  className="w-full border rounded-md p-2 card-bg text-sm"
                                  rows={2}
                                  placeholder="Add a note for this photo…"
                                  value={notesVal}
                                  onChange={(e) =>
                                    setPhotoState((prev) => ({
                                      ...prev,
                                      [p.id]: {
                                        ...prev[p.id],
                                        isClientVisible:
                                          prev[p.id]?.isClientVisible ?? !!p.isClientVisible,
                                        notes: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            ) : null}
                            {!isAttached ? (
                              <div className="mt-2">
                                <button
                                  className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
                                  onClick={() => attachToJob(p.id)}
                                >
                                  Attach to this job
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </RoleGuard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
