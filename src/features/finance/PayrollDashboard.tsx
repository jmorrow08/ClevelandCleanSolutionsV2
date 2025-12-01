import { useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { formatCurrency } from '@/utils/rateUtils';
import { getEmployeeNames } from '@/services/queries/resolvers';
import {
  addPayrollEntry,
  ensurePayrollPeriodExists,
  getPayrollPeriodById,
  listPayrollPeriods,
  listenToPayrollEntries,
  listenToPayrollPeriod,
  overridePayrollEntryAmount,
  recalcPayrollPeriodTotals,
  syncMonthlyMissedWorkDeductions,
  finalizePayrollPeriod,
  syncPayrollEntriesForPeriod,
  findMissingRateEmployeeIdsForPeriod,
  refreshPayrollEntryRates,
} from '@/services/payroll/payrollService';
import {
  getCurrentSemiMonthlyPeriod,
  getSemiMonthlyPeriodForPayDate,
  type SemiMonthlyPeriod,
} from '@/services/payroll/semiMonthlyPeriods';
import type { PayrollEntry, PayrollPeriod } from '@/types/payroll';

type EmployeeSummary = {
  employeeId: string;
  name: string;
  gross: number;
  deductions: number;
  net: number;
  entries: PayrollEntry[];
};

type DeductionModalState = null | {
  employeeId: string;
  employeeName: string;
};

type OverrideModalState = null | {
  employeeId: string;
  employeeName: string;
  entry: PayrollEntry;
};

type EarningModalState = null | {
  employeeId: string;
  employeeName: string;
};

const DEDUCTION_CATEGORIES = [
  { value: 'missed_day', label: 'Missed Day (auto)' },
  { value: 'uniform', label: 'Uniform' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'advance', label: 'Advance' },
  { value: 'manual_adjustment', label: 'Manual Adjustment' },
  { value: 'other', label: 'Other' },
] as const;

const EARNING_CATEGORIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'per_visit', label: 'Per-Visit' },
  { value: 'hourly', label: 'Hourly' },
] as const;

function toDate(value: Timestamp | Date | string | undefined | null): Date {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

function formatDateRange(startTs: any, endTs: any): string {
  const start = toDate(startTs);
  const end = toDate(endTs);
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
}

function formatPayDate(payDate: any): string {
  const date = toDate(payDate);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isStoredPayrollPeriod(period: PayrollPeriod | SemiMonthlyPeriod): period is PayrollPeriod {
  return 'periodStart' in period;
}

function buildPeriodLabel(period: PayrollPeriod | SemiMonthlyPeriod): string {
  if (isStoredPayrollPeriod(period)) {
    const payDate = toDate(period.payDate);
    const periodStart = toDate(period.periodStart);
    const periodEnd = toDate(period.periodEnd);
    return `${formatPayDate(payDate)} • ${formatDateRange(periodStart, periodEnd)}`;
  }

  const payDate = toDate(period.payDate);
  const periodStart = toDate(period.workPeriodStart);
  const periodEnd = toDate(period.workPeriodEnd);
  return `${formatPayDate(payDate)} • ${formatDateRange(periodStart, periodEnd)}`;
}

export default function PayrollDashboard() {
  const { user, claims } = useAuth();
  const { show } = useToast();

  const [periodOptions, setPeriodOptions] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<PayrollPeriod | null>(null);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [deductionModal, setDeductionModal] = useState<DeductionModalState>(null);
  const [overrideModal, setOverrideModal] = useState<OverrideModalState>(null);
  const [deductionForm, setDeductionForm] = useState({
    amount: '',
    category: 'manual_adjustment',
    note: '',
    saving: false,
  });
  const [overrideForm, setOverrideForm] = useState({
    amount: '',
    reason: '',
    saving: false,
  });
  const [earningModal, setEarningModal] = useState<EarningModalState>(null);
  const [earningForm, setEarningForm] = useState({
    amount: '',
    category: 'monthly',
    note: '',
    saving: false,
  });
  const [finalizing, setFinalizing] = useState(false);
  const [missingRateEmployeeIds, setMissingRateEmployeeIds] = useState<string[]>([]);
  const [syncingPeriod, setSyncingPeriod] = useState(false);
  const [refreshingRates, setRefreshingRates] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const hasAdminAccess = !!(claims?.admin || claims?.owner || claims?.super_admin);
  const canEdit = hasAdminAccess && !loading;
  const canFinalize = !!(claims?.owner || claims?.super_admin);

  useEffect(() => {
    let mounted = true;
    async function initialize() {
      // Non-admins should not attempt any payroll writes or reads here.
      if (!hasAdminAccess) {
        if (mounted) setLoading(false);
        return;
      }
      const currentPeriod = getCurrentSemiMonthlyPeriod();

      // Try to ensure the current period exists, but continue even if it fails
      try {
        // Only admins/owners can create periods
        await ensurePayrollPeriodExists(currentPeriod);
      } catch (ensureError) {
        console.warn('Could not ensure payroll period exists:', ensureError);
        // Don't block initialization - the period might already exist
        // or the user might only have read access to existing periods
      }

      if (!mounted) return;

      // Set the selected period and load available periods
      setSelectedPeriodId(currentPeriod.periodId);

      try {
        await refreshPeriodOptions(currentPeriod.periodId);
        if (mounted) {
          setPermissionError(null); // Clear any previous permission errors
        }
      } catch (refreshError: unknown) {
        console.error('Failed to load payroll periods:', refreshError);
        if (mounted) {
          const isPermissionError =
            refreshError instanceof Error &&
            (refreshError.message.includes('permission') ||
              refreshError.message.includes('PERMISSION_DENIED') ||
              (refreshError as any).code === 'permission-denied');

          if (isPermissionError) {
            setPermissionError(
              'You do not have permission to access payroll data. Please contact your administrator to verify your account has the correct role.',
            );
          } else {
            show({
              type: 'error',
              message: 'Failed to load payroll periods. Please try again.',
            });
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    initialize();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAdminAccess]);

  useEffect(() => {
    if (!selectedPeriodId) return;
    let cancelled = false;
    (async () => {
      try {
        setMissingRateEmployeeIds([]);
        const periodDoc = await getPayrollPeriodById(selectedPeriodId);
        if (!periodDoc || cancelled) return;
        const semiPeriod: SemiMonthlyPeriod = {
          periodId: periodDoc.id,
          workPeriodStart: toDate(periodDoc.periodStart),
          workPeriodEnd: toDate(periodDoc.periodEnd),
          payDate: toDate(periodDoc.payDate),
        };
        const result = await syncMonthlyMissedWorkDeductions(semiPeriod);
        if (cancelled) return;
        if (result.created > 0 || result.removed > 0) {
          await recalcPayrollPeriodTotals(periodDoc.id);
        }
        const missingIds = await findMissingRateEmployeeIdsForPeriod(semiPeriod);
        if (cancelled) return;
        setMissingRateEmployeeIds(missingIds);
      } catch (error) {
        console.error('Failed to sync missed-day deductions:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriodId) return;

    setLoading(true);
    let periodLoaded = false;
    let entriesLoaded = false;
    const maybeFinishLoading = () => {
      if (periodLoaded && entriesLoaded) {
        setLoading(false);
      }
    };
    const unsubscribePeriod = listenToPayrollPeriod(selectedPeriodId, (period) => {
      setActivePeriod(period);
      periodLoaded = true;
      maybeFinishLoading();
    });
    const unsubscribeEntries = listenToPayrollEntries(selectedPeriodId, (nextEntries) => {
      setEntries(nextEntries);
      entriesLoaded = true;
      maybeFinishLoading();
    });

    return () => {
      unsubscribePeriod();
      unsubscribeEntries();
    };
  }, [selectedPeriodId]);

  useEffect(() => {
    const employeeIds = Array.from(
      new Set([...entries.map((entry) => entry.employeeId), ...missingRateEmployeeIds]),
    );
    if (!employeeIds.length) {
      setEmployeeNames({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const names = await getEmployeeNames(employeeIds);
        if (cancelled) return;
        const map: Record<string, string> = {};
        employeeIds.forEach((id, index) => {
          map[id] = names[index] || id;
        });
        setEmployeeNames(map);
      } catch (error) {
        console.error('Failed to resolve employee names:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, missingRateEmployeeIds]);

  const computedTotals = useMemo(() => {
    let gross = 0;
    let deductions = 0;
    entries.forEach((entry) => {
      if (entry.type === 'earning') {
        gross += entry.amount;
      } else {
        deductions += Math.abs(entry.amount);
      }
    });
    return {
      gross: Number(gross.toFixed(2)),
      deductions: Number(deductions.toFixed(2)),
      net: Number((gross - deductions).toFixed(2)),
    };
  }, [entries]);

  const displayTotals = activePeriod?.totals ?? computedTotals;

  const employeeSummaries = useMemo<EmployeeSummary[]>(() => {
    const byEmployee = new Map<string, EmployeeSummary>();
    entries.forEach((entry) => {
      const summary =
        byEmployee.get(entry.employeeId) ??
        ({
          employeeId: entry.employeeId,
          name: employeeNames[entry.employeeId] || entry.employeeId,
          gross: 0,
          deductions: 0,
          net: 0,
          entries: [],
        } as EmployeeSummary);

      summary.entries = [...summary.entries, entry];

      if (entry.type === 'earning') {
        summary.gross += entry.amount;
        summary.net += entry.amount;
      } else {
        const deduction = Math.abs(entry.amount);
        summary.deductions += deduction;
        summary.net -= deduction;
      }

      byEmployee.set(entry.employeeId, summary);
    });

    return Array.from(byEmployee.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, employeeNames]);

  const missingRateNames = useMemo(
    () => missingRateEmployeeIds.map((id) => employeeNames[id] || id),
    [missingRateEmployeeIds, employeeNames],
  );

  async function refreshPeriodOptions(focusId?: string) {
    try {
      const results = await listPayrollPeriods(24);
      if (focusId && !results.find((p) => p.id === focusId)) {
        // Try to create the missing period, but don't fail if we can't
        try {
          // Parse YYYY-MM-DD as a LOCAL date to avoid TZ shifting to previous day.
          const [y, m, d] = String(focusId)
            .split('-')
            .map((x) => Number(x));
          const payDate =
            Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
              ? new Date(y, m - 1, d, 12, 0, 0, 0) // midday local to be safe
              : toDate(focusId);
          const fallback = getSemiMonthlyPeriodForPayDate(payDate);
          await ensurePayrollPeriodExists(fallback);
          const updated = await listPayrollPeriods(24);
          setPeriodOptions(updated);
        } catch (ensureError) {
          // If we can't create the period, just use what we have
          console.warn('Could not create period, using existing:', ensureError);
          setPeriodOptions(results);
        }
      } else {
        setPeriodOptions(results);
      }
    } catch (error) {
      console.error('Failed to load payroll periods:', error);
      // Re-throw all errors so callers can handle them appropriately
      // (e.g., initialize() needs to know if loading failed to avoid clearing error state)
      throw error;
    }
  }

  function handleToggle(employeeId: string) {
    setExpanded((prev) => ({
      ...prev,
      [employeeId]: !prev[employeeId],
    }));
  }

  async function refreshMissingRatesForPeriodId(periodId: string) {
    const periodDoc = await getPayrollPeriodById(periodId);
    if (!periodDoc) return;
    const semiPeriod: SemiMonthlyPeriod = {
      periodId: periodDoc.id,
      workPeriodStart: toDate(periodDoc.periodStart),
      workPeriodEnd: toDate(periodDoc.periodEnd),
      payDate: toDate(periodDoc.payDate),
    };
    const missing = await findMissingRateEmployeeIdsForPeriod(semiPeriod);
    setMissingRateEmployeeIds(missing);
  }

  async function handleSyncCompletedJobs() {
    if (!selectedPeriodId || syncingPeriod) return;
    try {
      setSyncingPeriod(true);
      const result = await syncPayrollEntriesForPeriod(selectedPeriodId);

      // Always inform the user about the sync result, regardless of refresh outcome
      const summaryParts = [
        `${result.createdEntries} entries created`,
        `${result.skippedJobs} jobs skipped`,
      ];
      if (result.missingRateEmployeeIds.length) {
        summaryParts.push(`${result.missingRateEmployeeIds.length} employees missing rates`);
      }
      if (result.errors.length) {
        summaryParts.push(`${result.errors.length} jobs failed`);
      }
      show({
        type: result.errors.length ? 'error' : 'success',
        message: `Payroll sync processed ${result.processedJobs} jobs (${summaryParts.join(
          ', ',
        )}).`,
      });

      // Refresh period options and dependent data, but treat failures as non-fatal
      try {
        await refreshPeriodOptions(selectedPeriodId);
        await refreshMissingRatesForPeriodId(selectedPeriodId);
      } catch (error) {
        console.error('Post-sync refresh failed:', error);
        const isPermissionError =
          error instanceof Error &&
          (error.message.includes('permission') ||
            error.message.includes('PERMISSION_DENIED') ||
            (error as any).code === 'permission-denied');
        if (isPermissionError) {
          setPermissionError(
            'You do not have permission to access payroll data. Please contact your administrator to verify your account has the correct role.',
          );
        } else {
          show({
            type: 'info',
            message: 'Entries synced, but failed to refresh period data.',
          });
        }
      }
    } catch (error) {
      console.error('Failed to sync payroll entries:', error);
      show({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to sync payroll entries for this period.',
      });
    } finally {
      setSyncingPeriod(false);
    }
  }

  async function handleRefreshLowRates() {
    if (!selectedPeriodId || refreshingRates) return;

    const confirmed = confirm(
      'This will:\n' +
        '1. Delete payroll entries where the rate type has changed (e.g., per_visit → monthly)\n' +
        '2. Refresh entries below $5 using current employee rates\n\n' +
        'This fixes stale entries from outdated pay structures. Continue?',
    );
    if (!confirmed) return;

    try {
      setRefreshingRates(true);
      // Refresh entries below $5 (likely incorrect)
      const result = await refreshPayrollEntryRates(selectedPeriodId, 5);

      const messageParts = [`${result.updated} entries updated`];
      if (result.skipped > 0) {
        messageParts.push(`${result.skipped} skipped`);
      }
      if (result.errors.length > 0) {
        messageParts.push(`${result.errors.length} errors`);
        console.warn('Rate refresh errors:', result.errors);
      }

      show({
        type: result.errors.length > 0 ? 'error' : 'success',
        message: `Rate refresh complete: ${messageParts.join(', ')}.`,
      });
    } catch (error) {
      console.error('Failed to refresh rates:', error);
      show({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to refresh rates.',
      });
    } finally {
      setRefreshingRates(false);
    }
  }

  async function handleAddDeductionSubmit() {
    if (!deductionModal || !selectedPeriodId) return;
    const amountValue = Number(deductionForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      show({ type: 'error', message: 'Enter a valid deduction amount.' });
      return;
    }

    setDeductionForm((prev) => ({ ...prev, saving: true }));
    try {
      await addPayrollEntry({
        periodId: selectedPeriodId,
        employeeId: deductionModal.employeeId,
        type: 'deduction',
        category: deductionForm.category as PayrollEntry['category'],
        amount: amountValue,
        description: deductionForm.note || undefined,
      });
      setDeductionModal(null);
      setDeductionForm({
        amount: '',
        category: 'manual_adjustment',
        note: '',
        saving: false,
      });
      show({ type: 'success', message: 'Deduction added.' });
    } catch (error) {
      console.error('Failed to add deduction:', error);
      show({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to add deduction.',
      });
      setDeductionForm((prev) => ({ ...prev, saving: false }));
    }
  }

  async function handleAddEarningSubmit() {
    if (!earningModal || !selectedPeriodId) return;
    const amountValue = Number(earningForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      show({ type: 'error', message: 'Enter a valid earning amount.' });
      return;
    }

    setEarningForm((prev) => ({ ...prev, saving: true }));
    try {
      await addPayrollEntry({
        periodId: selectedPeriodId,
        employeeId: earningModal.employeeId,
        type: 'earning',
        category: earningForm.category as PayrollEntry['category'],
        amount: amountValue,
        description: earningForm.note || undefined,
      });
      setEarningModal(null);
      setEarningForm({
        amount: '',
        category: 'monthly',
        note: '',
        saving: false,
      });
      show({ type: 'success', message: 'Earning added.' });
    } catch (error) {
      console.error('Failed to add earning:', error);
      show({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to add earning.',
      });
      setEarningForm((prev) => ({ ...prev, saving: false }));
    }
  }

  async function handleOverrideSubmit() {
    if (!overrideModal || !selectedPeriodId) return;
    const amountValue = Number(overrideForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      show({ type: 'error', message: 'Enter a valid amount.' });
      return;
    }

    setOverrideForm((prev) => ({ ...prev, saving: true }));
    try {
      await overridePayrollEntryAmount(
        overrideModal.entry.id,
        amountValue,
        user?.uid || 'system',
        overrideForm.reason || undefined,
      );
      setOverrideModal(null);
      setOverrideForm({ amount: '', reason: '', saving: false });
      show({ type: 'success', message: 'Entry updated.' });
    } catch (error) {
      console.error('Failed to override payroll entry:', error);
      show({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update entry.',
      });
      setOverrideForm((prev) => ({ ...prev, saving: false }));
    }
  }

  async function handleFinalizePeriod() {
    if (!selectedPeriodId || !canFinalize || finalizing) return;
    if (missingRateEmployeeIds.length > 0) {
      show({
        type: 'error',
        message: 'Add missing pay rates before finalizing this payroll period.',
      });
      return;
    }
    const periodLabel = activePeriod
      ? `${formatDateRange(activePeriod.periodStart, activePeriod.periodEnd)}`
      : 'this pay period';
    if (
      !confirm(
        `Finalize payroll for ${periodLabel}? This will lock the period and record an expense entry.`,
      )
    ) {
      return;
    }
    try {
      setFinalizing(true);
      const result = await finalizePayrollPeriod(selectedPeriodId, user?.uid || 'system');
      const message = result.alreadyFinalized
        ? 'Payroll period was already finalized.'
        : result.expenseCreated
        ? 'Payroll finalized and expense recorded.'
        : 'Payroll finalized.';
      show({ type: 'success', message });

      // Refresh period options, but treat failures as non-fatal
      try {
        await refreshPeriodOptions(selectedPeriodId);
      } catch (error) {
        console.error('Post-finalize refresh failed:', error);
        const isPermissionError =
          error instanceof Error &&
          (error.message.includes('permission') ||
            error.message.includes('PERMISSION_DENIED') ||
            (error as any).code === 'permission-denied');
        if (isPermissionError) {
          setPermissionError(
            'You do not have permission to access payroll data. Please contact your administrator to verify your account has the correct role.',
          );
        } else {
          show({
            type: 'info',
            message: 'Finalized, but failed to refresh period data.',
          });
        }
      }
    } catch (error) {
      console.error('Failed to finalize payroll period:', error);
      show({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to finalize payroll period.',
      });
    } finally {
      setFinalizing(false);
    }
  }

  function openDeductionModal(employeeId: string, employeeName: string) {
    setDeductionForm({
      amount: '',
      category: 'manual_adjustment',
      note: '',
      saving: false,
    });
    setDeductionModal({ employeeId, employeeName });
  }

  function openEarningModal(employeeId: string, employeeName: string) {
    setEarningForm({
      amount: '',
      category: 'monthly',
      note: '',
      saving: false,
    });
    setEarningModal({ employeeId, employeeName });
  }

  function openOverrideModal(employeeId: string, employeeName: string, entry: PayrollEntry) {
    setOverrideForm({
      amount: Math.abs(entry.amount).toString(),
      reason: entry.override?.reason || '',
      saving: false,
    });
    setOverrideModal({ employeeId, employeeName, entry });
  }

  const isFinalized = activePeriod?.status === 'finalized';

  // Show access denied if user doesn't have admin access
  if (!hasAdminAccess && !loading) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold">Payroll Review</h1>
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="font-medium text-red-700 dark:text-red-300">Access Denied</p>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            You do not have permission to access payroll data. This feature is restricted to
            administrators and owners.
          </p>
        </div>
      </div>
    );
  }

  // Show permission error if Firebase rules are blocking access
  if (permissionError) {
    const handleRefreshToken = async () => {
      try {
        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (currentUser) {
          // Force token refresh to get latest claims
          await currentUser.getIdToken(true);
          show({ type: 'info', message: 'Token refreshed. Reloading...' });
          setTimeout(() => window.location.reload(), 500);
        } else {
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    };

    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold">Payroll Review</h1>
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-6 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="font-medium text-amber-700 dark:text-amber-300">Permission Issue</p>
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">{permissionError}</p>
          <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">
            Your role: {claims?.role || 'unknown'} • User ID: {user?.uid?.slice(0, 8)}...
          </p>
          <div className="mt-4 flex gap-2">
            <button
              className="rounded-md border border-amber-400 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40"
              onClick={handleRefreshToken}
            >
              Refresh Token & Retry
            </button>
            <button
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              onClick={() => {
                setPermissionError(null);
                setLoading(true);
                window.location.reload();
              }}
            >
              Simple Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payroll Review</h1>
          {activePeriod ? (
            <p className="text-sm text-zinc-500">
              Pay Date: {formatPayDate(activePeriod.payDate)} • Period:{' '}
              {formatDateRange(activePeriod.periodStart, activePeriod.periodEnd)}
            </p>
          ) : (
            <p className="text-sm text-zinc-500">Loading period details…</p>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
          <label className="text-xs uppercase tracking-wide text-zinc-500">
            Pay Period
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:bg-zinc-900 dark:text-zinc-100"
              value={selectedPeriodId ?? ''}
              onChange={(event) => {
                const nextId = event.target.value || null;
                setSelectedPeriodId(nextId);
                if (nextId) {
                  refreshPeriodOptions(nextId).catch((err) => {
                    console.error('Failed to refresh periods on selection:', err);
                    const isPermissionError =
                      err instanceof Error &&
                      (err.message.includes('permission') ||
                        err.message.includes('PERMISSION_DENIED') ||
                        (err as any).code === 'permission-denied');
                    if (isPermissionError) {
                      setPermissionError(
                        'You do not have permission to access payroll data. Please contact your administrator to verify your account has the correct role.',
                      );
                    } else {
                      show({ type: 'error', message: 'Unable to refresh payroll periods.' });
                    }
                  });
                }
              }}
            >
              {periodOptions.map((period) => (
                <option key={period.id} value={period.id}>
                  {buildPeriodLabel(period)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => {
              refreshPeriodOptions(selectedPeriodId ?? undefined).catch((err) => {
                console.error('Failed to refresh periods:', err);
                const isPermissionError =
                  err instanceof Error &&
                  (err.message.includes('permission') ||
                    err.message.includes('PERMISSION_DENIED') ||
                    (err as any).code === 'permission-denied');
                if (isPermissionError) {
                  setPermissionError(
                    'You do not have permission to access payroll data. Please contact your administrator to verify your account has the correct role.',
                  );
                } else {
                  show({ type: 'error', message: 'Unable to refresh payroll periods.' });
                }
              });
            }}
          >
            Refresh Periods
          </button>
          <button
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSyncCompletedJobs}
            disabled={syncingPeriod || !selectedPeriodId}
          >
            {syncingPeriod ? 'Syncing…' : 'Sync Completed Jobs'}
          </button>
          {claims?.super_admin && (
            <button
              className="rounded-md border border-amber-400 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-900/30 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleRefreshLowRates}
              disabled={refreshingRates || !selectedPeriodId || isFinalized}
              title="Fix entries with incorrect rates (e.g., $1.00 amounts)"
            >
              {refreshingRates ? 'Refreshing…' : 'Fix Low Rates'}
            </button>
          )}
          {canFinalize && (
            <button
              className={`rounded-md px-3 py-2 text-sm font-medium text-white ${
                isFinalized
                  ? 'bg-emerald-600 cursor-default'
                  : finalizing
                  ? 'bg-zinc-400'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
              onClick={handleFinalizePeriod}
              disabled={finalizing || isFinalized || missingRateEmployeeIds.length > 0}
              title={
                missingRateEmployeeIds.length > 0
                  ? 'Add missing pay rates before finalizing this payroll period.'
                  : undefined
              }
            >
              {isFinalized ? 'Finalized' : finalizing ? 'Finalizing…' : 'Finalize Period'}
            </button>
          )}
        </div>
      </div>

      {missingRateEmployeeIds.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <span className="font-medium">Action required:</span>{' '}
          {`Add pay rates for ${missingRateNames.join(', ')} before payroll can be finalized.`}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card-bg rounded-lg border border-zinc-200 p-4 shadow-sm dark:border-zinc-700">
          <div className="text-xs uppercase text-zinc-500">Gross Earnings</div>
          <div className="mt-2 text-2xl font-semibold text-green-600">
            {formatCurrency(displayTotals.gross || 0)}
          </div>
        </div>
        <div className="card-bg rounded-lg border border-zinc-200 p-4 shadow-sm dark:border-zinc-700">
          <div className="text-xs uppercase text-zinc-500">Deductions</div>
          <div className="mt-2 text-2xl font-semibold text-amber-600">
            {formatCurrency(displayTotals.deductions || 0)}
          </div>
        </div>
        <div className="card-bg rounded-lg border border-zinc-200 p-4 shadow-sm dark:border-zinc-700">
          <div className="text-xs uppercase text-zinc-500">Net Pay</div>
          <div className="mt-2 text-2xl font-semibold text-blue-600">
            {formatCurrency(displayTotals.net || 0)}
          </div>
          {isFinalized ? (
            <div className="mt-2 text-xs font-medium text-emerald-600">Finalized</div>
          ) : missingRateEmployeeIds.length > 0 ? (
            <div className="mt-2 text-xs text-amber-600">
              Fix missing pay rates to enable finalization.
            </div>
          ) : (
            <div className="mt-2 text-xs text-zinc-500">
              Period open. Adjustments are still allowed.
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Loading payroll data…
        </div>
      ) : employeeSummaries.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No payroll entries found for this period yet.
        </div>
      ) : (
        <div className="space-y-4">
          {employeeSummaries.map((summary) => {
            const expandedState = expanded[summary.employeeId];
            return (
              <div
                key={summary.employeeId}
                className="card-bg rounded-lg border border-zinc-200 p-4 shadow-sm dark:border-zinc-700"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-lg font-semibold">{summary.name}</div>
                    <div className="text-xs text-zinc-500">
                      {summary.entries.length} entries • Gross {formatCurrency(summary.gross)} •
                      Deductions {formatCurrency(summary.deductions)} • Net{' '}
                      {formatCurrency(summary.net)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canEdit && !isFinalized && (
                      <>
                        <button
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          onClick={() => openEarningModal(summary.employeeId, summary.name)}
                        >
                          Add Earning
                        </button>
                        <button
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          onClick={() => openDeductionModal(summary.employeeId, summary.name)}
                        >
                          Add Deduction
                        </button>
                      </>
                    )}
                    <button
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      onClick={() => handleToggle(summary.employeeId)}
                    >
                      {expandedState ? 'Hide Details' : 'View Details'}
                    </button>
                  </div>
                </div>
                {expandedState && (
                  <div className="mt-4 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
                    <table className="min-w-full text-sm">
                      <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                        <tr>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Job / Description</th>
                          <th className="px-3 py-2">Amount</th>
                          <th className="px-3 py-2">Source</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.entries.map((entry) => (
                          <tr
                            key={entry.id}
                            className="border-t border-zinc-200 dark:border-zinc-800"
                          >
                            <td className="px-3 py-2 capitalize">{entry.type}</td>
                            <td className="px-3 py-2 capitalize">
                              {entry.category.replace(/_/g, ' ')}
                            </td>
                            <td className="px-3 py-2">
                              {entry.jobId ? (
                                <span className="font-mono text-xs">Job {entry.jobId}</span>
                              ) : (
                                <span className="text-xs text-zinc-500">
                                  {entry.description || '—'}
                                </span>
                              )}
                              {entry.description && entry.jobId && (
                                <div className="text-xs text-zinc-500">{entry.description}</div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={
                                  entry.type === 'earning' ? 'text-green-600' : 'text-amber-600'
                                }
                              >
                                {formatCurrency(entry.amount)}
                              </span>
                              {entry.override && (
                                <div className="text-xs text-zinc-500">
                                  adjusted from {formatCurrency(entry.override.originalAmount)}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {entry.source ? (
                                <span className="rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">
                                  {entry.source}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {canEdit && !isFinalized && entry.type === 'earning' && (
                                <button
                                  className="text-sm font-medium text-blue-600 hover:underline"
                                  onClick={() =>
                                    openOverrideModal(summary.employeeId, summary.name, entry)
                                  }
                                >
                                  Adjust
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Deduction Modal */}
      {deductionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">Add Deduction • {deductionModal.employeeName}</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Amount
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  value={deductionForm.amount}
                  onChange={(event) =>
                    setDeductionForm((prev) => ({
                      ...prev,
                      amount: event.target.value,
                    }))
                  }
                  disabled={deductionForm.saving}
                />
              </label>
              <label className="block text-sm font-medium">
                Category
                <select
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  value={deductionForm.category}
                  onChange={(event) =>
                    setDeductionForm((prev) => ({
                      ...prev,
                      category: event.target.value,
                    }))
                  }
                  disabled={deductionForm.saving}
                >
                  {DEDUCTION_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Reason / Notes
                <textarea
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  rows={3}
                  value={deductionForm.note}
                  onChange={(event) =>
                    setDeductionForm((prev) => ({
                      ...prev,
                      note: event.target.value,
                    }))
                  }
                  disabled={deductionForm.saving}
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                onClick={() => setDeductionModal(null)}
                disabled={deductionForm.saving}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={handleAddDeductionSubmit}
                disabled={deductionForm.saving}
              >
                {deductionForm.saving ? 'Saving…' : 'Add Deduction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Earning Modal */}
      {earningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">Add Earning • {earningModal.employeeName}</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Amount
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  value={earningForm.amount}
                  onChange={(event) =>
                    setEarningForm((prev) => ({
                      ...prev,
                      amount: event.target.value,
                    }))
                  }
                  disabled={earningForm.saving}
                />
              </label>
              <label className="block text-sm font-medium">
                Category
                <select
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  value={earningForm.category}
                  onChange={(event) =>
                    setEarningForm((prev) => ({
                      ...prev,
                      category: event.target.value,
                    }))
                  }
                  disabled={earningForm.saving}
                >
                  {EARNING_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Description / Notes
                <textarea
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  rows={3}
                  value={earningForm.note}
                  onChange={(event) =>
                    setEarningForm((prev) => ({
                      ...prev,
                      note: event.target.value,
                    }))
                  }
                  disabled={earningForm.saving}
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                onClick={() => setEarningModal(null)}
                disabled={earningForm.saving}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                onClick={handleAddEarningSubmit}
                disabled={earningForm.saving}
              >
                {earningForm.saving ? 'Saving…' : 'Add Earning'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">Adjust Entry • {overrideModal.employeeName}</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Category: {overrideModal.entry.category.replace(/_/g, ' ')} •{' '}
              {overrideModal.entry.jobId
                ? `Job ${overrideModal.entry.jobId}`
                : overrideModal.entry.description || 'manual entry'}
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                New Amount
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  value={overrideForm.amount}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({
                      ...prev,
                      amount: event.target.value,
                    }))
                  }
                  disabled={overrideForm.saving}
                />
              </label>
              <label className="block text-sm font-medium">
                Reason
                <textarea
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  rows={3}
                  value={overrideForm.reason}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({
                      ...prev,
                      reason: event.target.value,
                    }))
                  }
                  disabled={overrideForm.saving}
                  placeholder="Optional notes explaining the adjustment"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                onClick={() => setOverrideModal(null)}
                disabled={overrideForm.saving}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={handleOverrideSubmit}
                disabled={overrideForm.saving}
              >
                {overrideForm.saving ? 'Saving…' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
