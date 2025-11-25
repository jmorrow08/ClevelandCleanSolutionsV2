import { useEffect, useMemo, useState } from 'react';
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
  deleteDoc,
  Timestamp,
  writeBatch,
  limit,
  deleteField,
  FieldValue,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firebaseConfig } from '../../services/firebase';
import { makeDayBounds as makeDayBoundsUtil, formatJobWindow } from '../../utils/time';
import { getClientName, getLocationName, getEmployeeNames } from '../../services/queries/resolvers';
import { mapLegacyStatus, type CanonicalStatus } from '../../services/statusMap';
import { RoleGuard } from '../../context/RoleGuard';
import EmployeeAssignmentForm from '../../features/serviceHistory/EmployeeAssignmentForm';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { makeDayBounds, mergePhotoResults } from '../../services/firebase';
import { ChevronLeft, ChevronRight, X, ArrowRight } from 'lucide-react';

// Helper to safely convert Timestamp | Date | null to Date
function toDate(value: Timestamp | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate();
  }
  // Fallback for plain objects with seconds (e.g., from JSON)
  if ((value as any)?.seconds) {
    return new Date((value as any).seconds * 1000);
  }
  return null;
}

type JobRecord = {
  id: string;
  serviceDate?: Timestamp | Date | null;
  clientProfileId?: string | null;
  locationId?: string | null;
  assignedEmployees?: string[];
  status?: string | null;
  statusV2?: CanonicalStatus | null;
  approvedAt?: Timestamp | Date | null;
  approvedBy?: string | null;
  [key: string]: unknown;
};

type Note = {
  id: string;
  message: string;
  createdAt?: any;
  authorRole?: string;
};

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

interface JobModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: Array<{
    id: string;
    clientName: string;
    locationName: string;
    assignedEmployeeNames: string[];
    assignedEmployeesCount: number;
    serviceDate: Date | null;
    status: string;
    daysInProgress: number;
    hoursInProgress: number;
  }>;
  currentIndex: number;
  onIndexChange?: (index: number) => void;
}

export default function JobModal({
  isOpen,
  onClose,
  jobs,
  currentIndex,
  onIndexChange,
}: JobModalProps) {
  const { claims } = useAuth();
  const { show } = useToast();

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
  const [deleting, setDeleting] = useState(false);

  // UI tabs: Overview vs Approval
  const [activeTab, setActiveTab] = useState<'overview' | 'approval'>('overview');

  // Approval state
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photoState, setPhotoState] = useState<
    Record<string, { isClientVisible: boolean; notes?: string }>
  >({});
  const [notesFieldExists, setNotesFieldExists] = useState<Record<string, boolean>>({});
  const [statusLegacy, setStatusLegacy] = useState<string>('');
  const [savingApproval, setSavingApproval] = useState(false);
  const [timeWindow, setTimeWindow] = useState<string>('');

  // Check if user has admin permissions
  const isAdmin = claims?.admin || claims?.owner || claims?.super_admin;

  // Get current job data
  const currentJobData = jobs[currentIndex];
  const hasMultipleJobs = jobs.length > 1;

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          navigateToJob(currentIndex - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          navigateToJob(currentIndex + 1);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, currentIndex, jobs.length]);

  const navigateToJob = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < jobs.length) {
      onIndexChange?.(newIndex);
    }
  };

  useEffect(() => {
    if (isOpen && currentJobData) {
      loadJobData(currentJobData.id);
    }
  }, [isOpen, currentJobData?.id]);

  async function loadJobData(jobId: string) {
    try {
      setLoading(true);
      if (!getApps().length) initializeApp(firebaseConfig);
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
          console.log('🔍 DEBUG JobModal: Loading employee notes for job:', {
            jobId,
            locationId: j.locationId,
            serviceDate: j.serviceDate,
            serviceDateType: typeof j.serviceDate,
          });

          const dt: Date = toDate(j.serviceDate) || new Date();

          console.log('🔍 DEBUG JobModal: Parsed service date:', dt);

          const { start, end } = makeDayBoundsUtil(dt, 'America/New_York');
          console.log('🔍 DEBUG JobModal: Date range for employee notes:', {
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
          console.log('🔍 DEBUG JobModal: Missing required data for employee notes:', {
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
        const dt: Date = toDate(job.serviceDate) || new Date();
        const { start, end } = makeDayBoundsUtil(dt, 'America/New_York');
        const qref = query(
          collection(db, 'employeeTimeTracking'),
          where('locationId', '==', job.locationId),
          where('clockInTime', '>=', Timestamp.fromDate(start)),
          where('clockOutTime', '<=', Timestamp.fromDate(end)),
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
    if (!job || !job.id) return;
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    const payload: Partial<JobRecord> & Record<string, unknown> = {};
    if (Array.isArray(updated.assignedEmployees)) {
      payload.assignedEmployees = [...updated.assignedEmployees];
    }
    if (updated.serviceDate instanceof Date) {
      payload.serviceDate = Timestamp.fromDate(updated.serviceDate);
    }
    if ('statusV2' in updated) {
      payload.statusV2 = updated.statusV2 ?? null;
    }
    await updateDoc(doc(db, 'serviceHistory', job.id), payload);
    setJob((prev) => (prev ? ({ ...prev, ...payload } as JobRecord) : prev));
  }

  async function saveAdminNotes() {
    const notes = adminNotes.trim();
    if (!job?.id) return;
    try {
      setSavingAdminNotes(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      await updateDoc(doc(db, 'serviceHistory', job.id), {
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
    if (!text || !job?.id || !job) return;
    try {
      setPostingNote(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const auth = getAuth();
      const claims = (await auth.currentUser?.getIdTokenResult(true))?.claims as any;
      let authorRole: string = 'employee';
      if (claims?.admin || claims?.owner || claims?.super_admin) authorRole = 'admin';
      const payload: any = {
        jobId: job.id,
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

  async function saveApproval() {
    if (!job?.id || !job) return;
    const prevState = photoState;
    const prevPhotos = photos.map((p) => ({ ...p }));
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
      const photoRollbackPayloads: Array<{ id: string; payload: Record<string, any> }> = [];
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

          const rollbackPayload: Record<string, any> = {};
          if (visChanged) rollbackPayload.isClientVisible = originalVisible;
          if (notesChanged) {
            rollbackPayload.notes = notesFieldExists[p.id] ? p.notes ?? null : deleteField();
          }
          photoRollbackPayloads.push({ id: p.id, payload: rollbackPayload });
        }
        if (!originalVisible && nextVisible) anyBecameVisible = true;
      }

      // Prepare job status update
      const statusChanged = (statusLegacy || '') !== prevStatus;
      const isTransitionToCompleted = statusChanged && statusLegacy === 'Completed';
      const shouldSetApprovalTimestamp =
        isTransitionToCompleted && (!hadApprovedAt || prevApprovedAt === null);
      const shouldSetApprovalActor =
        isTransitionToCompleted && (!hadApprovedBy || prevApprovedBy === null);
      if (statusChanged || anyBecameVisible) {
        if (isTransitionToCompleted) {
          try {
            const { validateJobPayrollReadiness } = await import(
              '../../services/payroll/payrollService'
            );
            const missingRateEmployeeIds = await validateJobPayrollReadiness(job.id!);
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
        const payload: Record<string, unknown> = {};
        if (statusChanged) payload.status = statusLegacy || null;
        if (shouldSetApprovalTimestamp) {
          payload.approvedAt = serverTimestamp();
        }
        if (shouldSetApprovalActor) {
          payload.approvedBy = auth.currentUser?.uid || null;
        }
        if (Object.keys(payload).length > 0) {
          batch.update(
            doc(db, 'serviceHistory', job.id),
            payload as { [x: string]: FieldValue | Partial<unknown> | undefined },
          );
        }
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
        setJob((prev) => {
          if (!prev) return prev;
          const next: JobRecord & Record<string, unknown> = {
            ...prev,
            status: statusLegacy || prev.status,
          } as JobRecord & Record<string, unknown>;
          // Note: We don't set approvedAt locally because the server uses serverTimestamp()
          // which may differ from Timestamp.now() due to clock skew. The correct value
          // will be available on next fetch. We preserve existing values if not changing.
          if (prevApprovedAt !== undefined) {
            next.approvedAt = prevApprovedAt;
          } else if (!shouldSetApprovalTimestamp) {
            delete next.approvedAt;
          }
          // approvedBy can be set locally since it's a simple UID, not a timestamp
          if (shouldSetApprovalActor) {
            next.approvedBy = auth.currentUser?.uid || null;
          } else if (prevApprovedBy !== undefined) {
            next.approvedBy = prevApprovedBy;
          } else {
            delete next.approvedBy;
          }
          return next;
        });

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
            const timesheetResult = await updateTimesheetEarningsOnJobCompletion(job.id!);
            try {
              await createPayrollEntriesForJob(job.id!);
            } catch (payrollError) {
              if (photoRollbackPayloads.length) {
                try {
                  const photoRollbackBatch = writeBatch(db);
                  for (const rollback of photoRollbackPayloads) {
                    photoRollbackBatch.update(
                      doc(db, 'servicePhotos', rollback.id),
                      rollback.payload,
                    );
                  }
                  await photoRollbackBatch.commit();
                } catch (photoRollbackError) {
                  console.error(
                    'Failed to rollback photo approvals after payroll entry failure:',
                    photoRollbackError,
                  );
                }
              }
              setPhotoState(prevState);
              setPhotos(prevPhotos);
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
            const rollbackPayload: Record<string, unknown> = {
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
              await updateDoc(
                doc(db, 'serviceHistory', job.id),
                rollbackPayload as { [x: string]: FieldValue | Partial<unknown> | undefined },
              );
            } catch (rollbackError) {
              console.error('Failed to rollback job completion state:', rollbackError);
            }
            if (photoRollbackPayloads.length) {
              try {
                const photoRollbackBatch = writeBatch(db);
                for (const rollback of photoRollbackPayloads) {
                  photoRollbackBatch.update(
                    doc(db, 'servicePhotos', rollback.id),
                    rollback.payload,
                  );
                }
                await photoRollbackBatch.commit();
              } catch (photoRollbackError) {
                console.error(
                  'Failed to rollback photo approvals after job state rollback:',
                  photoRollbackError,
                );
              }
            }
            setStatusLegacy(prevStatus);
            setJob((prevJob) => {
              if (!prevJob) return prevJob;
              const next: JobRecord & Record<string, unknown> = {
                ...prevJob,
                status: prevStatus || prevJob.status,
              } as JobRecord & Record<string, unknown>;
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
            setPhotos(prevPhotos);
            setPhotoState(prevState);
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
      setPhotos(prevPhotos);
      setStatusLegacy(prevStatus);
      show({ type: 'error', message: e?.message || 'Failed to save changes.' });
    } finally {
      setSavingApproval(false);
    }
  }

  async function attachToJob(photoId: string) {
    if (!job?.id) return;
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      await updateDoc(doc(db, 'servicePhotos', photoId), {
        serviceHistoryId: job.id,
      });
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, serviceHistoryId: job.id } : p)),
      );
      show({ type: 'success', message: 'Photo attached to this job.' });
    } catch (e: any) {
      show({ type: 'error', message: e?.message || 'Failed to attach photo.' });
    }
  }

  // Load photos for Approval tab (on-demand when tab becomes active and job is available)
  useEffect(() => {
    async function loadPhotosForApproval(j: JobRecord) {
      if (!j.id) return;
      try {
        setApprovalLoading(true);
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Primary: photos linked by serviceHistoryId
        const qPrimary = query(
          collection(db, 'servicePhotos'),
          where('serviceHistoryId', '==', j.id),
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
  }, [activeTab, job]);

  const handleDelete = async () => {
    if (!job?.id) return;

    // Show confirmation dialog
    const confirmed = window.confirm(
      'Are you sure you want to delete this job? This action cannot be undone.',
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();

      await deleteDoc(doc(db, 'serviceHistory', job.id));
      show({ message: 'Job deleted successfully', type: 'success' });
      onClose();
    } catch (error: any) {
      console.error('Error deleting job:', error);
      show({
        message: `Failed to delete job: ${error.message}`,
        type: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

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

  if (!isOpen || !currentJobData) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card-bg rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] min-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[var(--text)] truncate">
              {locationName || clientName || job?.id}
            </div>
            <div className="text-xs text-[var(--text)] opacity-70 mt-0.5 truncate">
              {toDate(job?.serviceDate)?.toLocaleDateString() ?? '—'}{' '}
              <span className="text-xs text-[var(--text)] opacity-70">
                {timeWindow || (job?.serviceDate ? formatJobWindow(job.serviceDate) : '')}
              </span>
              {statusCanonical ? (
                <span className="ml-2 px-2 py-0.5 rounded-md text-xs bg-[var(--muted)] text-[var(--text)]">
                  {statusCanonical}
                </span>
              ) : null}
            </div>
            {assignedDisplay.length ? (
              <div className="text-xs text-[var(--text)] opacity-70 mt-0.5 truncate">
                Assigned: {assignedDisplay.join(', ')}
              </div>
            ) : null}
          </div>

          {/* Navigation and close buttons */}
          <div className="flex items-center gap-2 ml-4">
            {/* Job counter */}
            {hasMultipleJobs && (
              <div className="text-xs text-zinc-500">
                {currentIndex + 1} of {jobs.length}
              </div>
            )}

            {/* Next Job button */}
            {hasMultipleJobs && (
              <button
                onClick={() => navigateToJob(currentIndex + 1)}
                disabled={currentIndex === jobs.length - 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next Job
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="p-4 text-sm text-[var(--text)] opacity-70">Loading job details…</div>
          ) : !job ? (
            <div className="p-4 text-sm text-[var(--text)] opacity-70">Job not found.</div>
          ) : (
            <div className="p-4">
              {/* Tabs */}
              <div className="border-b border-[var(--border)] mb-4">
                <nav className="flex gap-2 text-sm text-[var(--text)]">
                  <button
                    className={`px-3 py-1.5 rounded-t-md text-[var(--text)] ${
                      activeTab === 'overview' ? 'bg-[var(--muted)]' : 'hover:bg-[var(--muted)]'
                    }`}
                    onClick={() => setActiveTab('overview')}
                  >
                    Overview
                  </button>
                  <RoleGuard allow={['admin', 'owner', 'super_admin']}>
                    <button
                      className={`px-3 py-1.5 rounded-t-md text-[var(--text)] ${
                        activeTab === 'approval' ? 'bg-[var(--muted)]' : 'hover:bg-[var(--muted)]'
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
                        <div className="text-sm font-medium text-[var(--text)] mb-2">
                          Job Details
                        </div>
                        <div className="space-y-2 text-sm text-[var(--text)]">
                          <div>
                            <span className="text-[var(--text)] opacity-70">Client:</span>{' '}
                            {clientName || job.clientProfileId || '—'}
                          </div>
                          <div>
                            <span className="text-[var(--text)] opacity-70">Location:</span>{' '}
                            {locationName || job.locationId || '—'}
                          </div>
                          <div>
                            <span className="text-[var(--text)] opacity-70">Service Date:</span>{' '}
                            {toDate(job.serviceDate)?.toLocaleString() ?? '—'}
                          </div>
                          <div>
                            <span className="text-[var(--text)] opacity-70">Status:</span>{' '}
                            <span className="px-2 py-0.5 rounded-md text-xs bg-[var(--muted)] text-[var(--text)]">
                              {statusCanonical || '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[var(--text)] mb-2">
                          Assigned Employees
                        </div>
                        {assignedDisplay.length > 0 ? (
                          <div className="space-y-1">
                            {assignedDisplay.map((name, i) => (
                              <div key={i} className="text-sm text-[var(--text)]">
                                {name}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-[var(--text)] opacity-70">
                            No employees assigned
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Employee Assignment Editing - Always available for admins */}
                    <RoleGuard allow={['admin', 'owner', 'super_admin']}>
                      <div className="border-t border-[var(--border)] pt-4">
                        <div className="text-sm font-medium text-[var(--text)] mb-3">
                          Edit Employee Assignments
                        </div>
                        <EmployeeAssignmentForm job={job} onSave={handleSave} />
                      </div>
                    </RoleGuard>
                  </div>

                  <div className="border-t border-[var(--border)] pt-3 space-y-6">
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
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            Add Note
                          </div>
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
                        <label className="block text-sm text-[var(--text)] mb-1">Job Status</label>
                        <select
                          className="w-full border border-[var(--border)] rounded-md p-2 card-bg text-sm text-[var(--text)]"
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
                      <div className="text-xs text-[var(--warning)]">
                        Needs data: service date and location are required to find older uploads.
                      </div>
                    ) : null}

                    {/* Photos grid */}
                    {approvalLoading ? (
                      <div className="text-sm text-[var(--text)] opacity-70">Loading photos…</div>
                    ) : photos.length === 0 ? (
                      <div className="text-sm text-[var(--text)] opacity-70">
                        No photos found for this service.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {photos.map((p) => {
                          const st = photoState[p.id] || {
                            isClientVisible: !!p.isClientVisible,
                          };
                          const showNotes = !!notesFieldExists[p.id];
                          const notesVal = st.notes ?? p.notes ?? '';
                          const isAttached = p.serviceHistoryId === job.id;
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
                                <div className="w-full h-40 bg-[var(--muted)] rounded" />
                              )}
                              <div className="mt-2 text-xs text-[var(--text)] opacity-70">
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
                                    className="w-full border border-[var(--border)] rounded-md p-2 card-bg text-sm text-[var(--text)]"
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

        {/* Delete button for admins */}
        {isAdmin && job && (
          <div className="flex justify-end p-4 border-t border-[var(--border)] flex-shrink-0">
            <button
              onClick={handleDelete}
              disabled={deleting || loading}
              className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white disabled:bg-zinc-400 disabled:cursor-not-allowed text-sm"
              title="Delete this job"
            >
              {deleting ? 'Deleting…' : 'Delete Job'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
