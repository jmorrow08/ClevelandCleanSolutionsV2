import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getApps, initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  addDoc,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { getStorage, ref, listAll, getDownloadURL } from 'firebase/storage';
import { firebaseConfig } from '@/services/firebase';
import { useAuth } from '@/context/AuthContext';
import { HideFor, RoleGuard } from '@/context/RoleGuard';
import EmployeeEditModal from '@/features/hr/EmployeeEditModal';
import EmployeeRateModal from '@/features/hr/EmployeeRateModal';

type Employee = {
  id: string;
  fullName?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  employeeIdString?: string | null;
  jobTitle?: string | null;
  status?: boolean | null;
  userId?: string | null;
};

type RateDoc = {
  id?: string;
  employeeId?: string;
  employeeProfileId?: string;
  rateType?: 'per_visit' | 'hourly' | 'monthly';
  amount?: number;
  hourlyRate?: number;
  rate?: number;
  effectiveDate?: any;
  locationId?: string | null;
  locationName?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

type Location = {
  id: string;
  locationName: string;
};

export default function EmployeeDetail({ employeeId }: { employeeId?: string }) {
  const params = useParams<{ id: string }>();
  const id = (employeeId || (params as any)?.id) as string | undefined;
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tab, setTab] = useState<'profile' | 'rates' | 'docs'>('profile');
  const [editOpen, setEditOpen] = useState(false);
  const [rates, setRates] = useState<any[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docs, setDocs] = useState<{ name: string; url: string }[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const { claims } = useAuth();

  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<RateDoc | null>(null);

  function handleOpenAddRate() {
    setEditingRate(null);
    setRateModalOpen(true);
  }

  function handleOpenEditRate(r: any) {
    const n = normalizeRate(r);
    setEditingRate({ ...n, id: r?.id });
    setRateModalOpen(true);
  }

  function handleRateModalClose() {
    setRateModalOpen(false);
    setEditingRate(null);
  }

  async function handleDeleteRate(r: any) {
    if (!r?.id) return;
    const confirmed = window.confirm('Are you sure you want to delete this rate?');
    if (!confirmed) return;

    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'employeeRates', r.id));
      setRates((prev) => prev.filter((rate) => rate.id !== r.id));
    } catch (error) {
      console.error('Error deleting rate:', error);
      alert('Failed to delete rate');
    }
  }

  async function handleRateSaved() {
    // Refresh rates list
    if (!id) return;
    setRatesLoading(true);
    try {
      const db = getFirestore();
      // Primary: V2 schema using employeeId + effectiveDate ordering
      const q1 = getDocs(
        query(
          collection(db, 'employeeRates'),
          where('employeeId', '==', id),
          orderBy('effectiveDate', 'desc'),
        ),
      );
      // Fallback: V1 schema using employeeProfileId (may lack effectiveDate)
      const q2 = getDocs(
        query(collection(db, 'employeeRates'), where('employeeProfileId', '==', id)),
      );
      const [s1, s2] = await Promise.allSettled([q1, q2]);
      const collected: Record<string, any> = {};
      if (s1.status === 'fulfilled')
        s1.value.forEach((d) => (collected[d.id] = { id: d.id, ...(d.data() as any) }));
      if (s2.status === 'fulfilled')
        s2.value.forEach((d) => (collected[d.id] = { id: d.id, ...(d.data() as any) }));
      const list = Object.values(collected) as any[];
      list.sort(
        (a, b) =>
          (normalizeEffectiveDate(b)?.getTime?.() || 0) -
          (normalizeEffectiveDate(a)?.getTime?.() || 0),
      );
      setRates(list);
    } finally {
      setRatesLoading(false);
    }
  }

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Load employee data and locations in parallel
        const [employeeSnap, locationsSnap] = await Promise.all([
          getDoc(doc(db, 'employeeMasterList', id)),
          getDocs(
            query(
              collection(db, 'locations'),
              where('status', '==', true),
              orderBy('locationName', 'asc'),
            ),
          ),
        ]);

        if (employeeSnap.exists())
          setEmployee({ id: employeeSnap.id, ...(employeeSnap.data() as any) });
        else {
          // Fallback: try users/{uid} read-only mapping
          const userSnap = await getDoc(doc(db, 'users', id));
          if (userSnap.exists()) {
            const u = userSnap.data() as any;
            setEmployee({
              id,
              fullName: u.fullName || u.displayName || u.name || u.email || id,
              firstName: u.firstName || null,
              lastName: u.lastName || null,
              email: u.email || null,
              phone: u.phone || u.phoneNumber || null,
              role: u.role || null,
              employeeIdString: u.employeeIdString || null,
              jobTitle: u.jobTitle || null,
              status: typeof u.status === 'boolean' ? u.status : null,
              userId: id,
            });
          }
        }

        // Process locations
        const locationsList: Location[] = [];
        locationsSnap.forEach((d) => {
          const data = d.data() as any;
          locationsList.push({
            id: d.id,
            locationName: data.locationName || 'Unnamed Location',
          });
        });
        setLocations(locationsList);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    async function loadRates() {
      if (!id) return;
      setRatesLoading(true);
      try {
        const db = getFirestore();
        // Primary: V2 schema using employeeId + effectiveDate ordering
        const q1 = getDocs(
          query(
            collection(db, 'employeeRates'),
            where('employeeId', '==', id),
            orderBy('effectiveDate', 'desc'),
          ),
        );
        // Fallback: V1 schema using employeeProfileId (may lack effectiveDate)
        const q2 = getDocs(
          query(collection(db, 'employeeRates'), where('employeeProfileId', '==', id)),
        );
        const [s1, s2] = await Promise.allSettled([q1, q2]);
        const collected: Record<string, any> = {};
        if (s1.status === 'fulfilled') {
          s1.value.forEach((d) => (collected[d.id] = { id: d.id, ...(d.data() as any) }));
        }
        if (s2.status === 'fulfilled') {
          s2.value.forEach((d) => (collected[d.id] = { id: d.id, ...(d.data() as any) }));
        }
        const list = Object.values(collected) as any[];
        list.sort((a: any, b: any) => {
          const ad = normalizeEffectiveDate(a);
          const bd = normalizeEffectiveDate(b);
          return (bd?.getTime?.() || 0) - (ad?.getTime?.() || 0);
        });
        setRates(list);
      } catch (_) {
        setRates([]);
      } finally {
        setRatesLoading(false);
      }
    }
    loadRates();
  }, [id]);

  useEffect(() => {
    async function listDocs() {
      if (!id) return;
      setDocsLoading(true);
      try {
        const storage = getStorage();
        const root = ref(storage, `media/employees/${id}`);
        const collected: { name: string; url: string }[] = [];
        async function walk(prefixRef: ReturnType<typeof ref>) {
          const res = await listAll(prefixRef);
          for (const it of res.items) {
            try {
              const url = await getDownloadURL(it);
              const parts = it.fullPath.split('/');
              collected.push({ name: parts[parts.length - 1], url });
            } catch {}
          }
          for (const p of res.prefixes) {
            await walk(p);
          }
        }
        await walk(root);
        setDocs(collected);
      } catch (_) {
        setDocs([]);
      } finally {
        setDocsLoading(false);
      }
    }
    listDocs();
  }, [id]);

  if (!id) return <div>Invalid employee id</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Employee</h1>
        <div className="flex items-center gap-2">
          <RoleGuard allow={['owner', 'super_admin']}>
            {employee && (
              <button
                className="px-3 py-1.5 rounded-md border card-bg"
                onClick={() => setEditOpen(true)}
              >
                Edit
              </button>
            )}
          </RoleGuard>
          <HideFor roles={['super_admin']}>
            <button
              className="px-3 py-1.5 rounded-md bg-zinc-200 dark:bg-zinc-700 cursor-not-allowed text-sm"
              title="Delete is super_admin-only"
              disabled
            >
              Delete
            </button>
          </HideFor>
          <RoleGuard allow={['super_admin']}>
            <button
              className="px-3 py-1.5 rounded-md bg-red-600/10 text-red-700 dark:text-red-400 cursor-not-allowed text-sm"
              title="Delete not implemented"
              disabled
            >
              Delete
            </button>
          </RoleGuard>
        </div>
      </div>

      <div className="flex gap-2 text-sm">
        {(
          [
            ['profile', 'Profile'],
            ['rates', 'Rates'],
            ['docs', 'Training/Docs'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`px-3 py-1.5 rounded-md border ${
              tab === key ? 'bg-blue-50 border-blue-200 text-blue-700' : 'card-bg'
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : !employee ? (
        <div className="text-sm text-zinc-500">Employee not found.</div>
      ) : (
        <div className="space-y-3">
          {tab === 'profile' && (
            <div className="rounded-lg p-4 card-bg shadow-elev-1 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Name"
                  value={
                    employee.fullName ||
                    [employee.firstName, employee.lastName].filter(Boolean).join(' ') ||
                    employee.id
                  }
                />
                <Field label="Email" value={employee.email || '—'} />
                <Field label="Phone" value={employee.phone || '—'} />
                <Field label="Employee ID" value={employee.employeeIdString || '—'} />
                <div>
                  <div className="text-xs text-zinc-500">Role</div>
                  <div className="mt-0.5">
                    <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                      {employee.role || 'employee'}
                    </span>
                  </div>
                </div>
                <Field label="Job Title" value={employee.jobTitle || '—'} />
                <div>
                  <div className="text-xs text-zinc-500">Status</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs ${
                        employee.status === false
                          ? 'bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-300'
                          : 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300'
                      }`}
                    >
                      {employee.status === false ? 'inactive' : 'active'}
                    </span>
                    <RoleGuard allow={['owner', 'super_admin', 'admin']}>
                      <span className="text-xs text-zinc-500">Use Edit to change status</span>
                    </RoleGuard>
                  </div>
                </div>
              </div>
              <RoleGuard allow={['super_admin']}>
                <div className="rounded-lg p-3 card-bg border border-zinc-200 dark:border-zinc-700">
                  <div className="text-sm font-medium">Auth/Claims</div>
                  <div className="text-sm text-zinc-500">Read-only (current session)</div>
                  <div className="text-xs mt-1">{JSON.stringify(claims || {}, null, 0)}</div>
                </div>
              </RoleGuard>
            </div>
          )}

          {tab === 'rates' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-500">Rates</div>
                <RoleGuard allow={['owner', 'super_admin']}>
                  <button
                    className="px-3 py-1.5 rounded-md border card-bg"
                    onClick={() => handleOpenAddRate()}
                  >
                    Add Rate
                  </button>
                </RoleGuard>
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-xs">
                Per job/visit rate (piece-rate) — not hourly
              </div>

              <div className="hidden md:block overflow-x-auto rounded-lg card-bg shadow-elev-1">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Effective Date</th>
                      <th className="px-3 py-2">Rate Type</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Scope</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratesLoading ? (
                      <tr>
                        <td className="px-3 py-4" colSpan={5}>
                          Loading…
                        </td>
                      </tr>
                    ) : rates.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-zinc-500" colSpan={5}>
                          No rates.
                        </td>
                      </tr>
                    ) : (
                      rates.map((r) => {
                        const n = normalizeRate(r);
                        return (
                          <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-700">
                            <td className="px-3 py-2">{formatDate(n.effectiveDate)}</td>
                            <td className="px-3 py-2">{n.rateType}</td>
                            <td className="px-3 py-2">{formatMoney(n.amount || 0)}</td>
                            <td className="px-3 py-2">
                              {n.locationName || n.locationId || 'All locations'}
                            </td>
                            <td className="px-3 py-2 text-right space-x-2">
                              <RoleGuard allow={['owner', 'super_admin']}>
                                <button
                                  className="text-blue-600 dark:text-blue-400 underline"
                                  onClick={() => handleOpenEditRate(r)}
                                >
                                  Edit
                                </button>
                              </RoleGuard>
                              <RoleGuard allow={['super_admin']}>
                                <button
                                  className="text-red-600 dark:text-red-400 underline"
                                  onClick={() => handleDeleteRate(r)}
                                >
                                  Delete
                                </button>
                              </RoleGuard>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2">
                {ratesLoading ? (
                  <div className="rounded-lg p-3 card-bg shadow-elev-1 text-sm text-zinc-500">
                    Loading…
                  </div>
                ) : rates.length === 0 ? (
                  <div className="rounded-lg p-3 card-bg shadow-elev-1 text-sm text-zinc-500">
                    No rates.
                  </div>
                ) : (
                  rates.map((r) => {
                    const n = normalizeRate(r);
                    return (
                      <div key={r.id} className="rounded-lg p-3 card-bg shadow-elev-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{formatDate(n.effectiveDate)}</div>
                          <div>{formatMoney(n.amount || 0)}</div>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          {n.rateType} · {n.locationName || n.locationId || 'All locations'}
                        </div>
                        <div className="mt-2 text-right space-x-2">
                          <RoleGuard allow={['owner', 'super_admin']}>
                            <button
                              className="text-blue-600 dark:text-blue-400 underline text-sm"
                              onClick={() => handleOpenEditRate(r)}
                            >
                              Edit
                            </button>
                          </RoleGuard>
                          <RoleGuard allow={['super_admin']}>
                            <button
                              className="text-red-600 dark:text-red-400 underline text-sm"
                              onClick={() => handleDeleteRate(r)}
                            >
                              Delete
                            </button>
                          </RoleGuard>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === 'docs' && (
            <div className="space-y-2">
              {docsLoading ? (
                <div className="rounded-lg p-3 card-bg shadow-elev-1 text-sm text-zinc-500">
                  Loading…
                </div>
              ) : docs.length === 0 ? (
                <div className="rounded-lg p-3 card-bg shadow-elev-1 text-sm text-zinc-500">
                  No documents found.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {docs.map((d) => (
                    <a
                      key={d.url}
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg p-3 card-bg shadow-elev-1 text-sm underline"
                    >
                      {d.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {editOpen && employee && (
        <EmployeeEditModal
          employee={employee}
          onClose={() => setEditOpen(false)}
          onUpdated={(partial) => setEmployee((prev) => (prev ? { ...prev, ...partial } : prev))}
        />
      )}

      <EmployeeRateModal
        isOpen={rateModalOpen}
        onClose={handleRateModalClose}
        employeeId={id}
        editingRate={editingRate}
        onSave={handleRateSaved}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function formatDate(ts: any): string {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    return d ? d.toLocaleDateString() : '—';
  } catch {
    return '—';
  }
}

function normalizeEffectiveDate(r: any): Date | null {
  try {
    const ts = r?.effectiveDate || r?.createdAt;
    if (!ts) return null;
    return ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts);
  } catch {
    return null;
  }
}

function normalizeRate(raw: any): RateDoc {
  const rateType =
    (raw?.rateType as any) || (raw?.hourlyRate != null ? 'hourly' : undefined) || 'per_visit';
  const amount =
    (typeof raw?.amount === 'number' ? raw.amount : null) ??
    (typeof raw?.hourlyRate === 'number' ? raw.hourlyRate : null) ??
    (typeof raw?.rate === 'number' ? raw.rate : null) ??
    0;
  return {
    id: raw?.id,
    employeeId: raw?.employeeId,
    employeeProfileId: raw?.employeeProfileId,
    rateType,
    amount,
    effectiveDate: raw?.effectiveDate || raw?.createdAt,
    locationId: raw?.locationId || null,
    locationName: raw?.locationName || null,
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  } as RateDoc;
}

function formatMoney(v: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
    }).format(v);
  } catch {
    return `$${Number(v || 0).toFixed(2)}`;
  }
}
