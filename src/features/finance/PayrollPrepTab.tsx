import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import { useSettings } from "../../context/SettingsContext";
import { computeLastCompletedPeriod } from "../../services/payrollPeriods";
import {
  scanJobsForPeriod,
  generateTimesheets,
  createPayrollRun,
} from "../../services/queries/payroll";
import {
  getEmployeeNames,
  getLocationNames,
  getClientNames,
} from "../../services/queries/resolvers";

type JobAssignment = {
  jobId: string;
  employeeId: string;
  serviceDate: Date;
  locationId?: string;
  clientProfileId?: string;
  duration?: number; // in minutes
  existingTimesheet?: boolean;
};

type TimesheetDraft = {
  employeeId: string;
  jobId: string;
  serviceDate: Date;
  locationId?: string;
  clientProfileId?: string;
  rateSnapshot: {
    type: "per_visit" | "hourly" | "monthly";
    amount: number;
    monthlyPayDay?: number;
  };
  units: number;
  hours?: number;
};

type ScanResult = {
  jobs: JobAssignment[];
  drafts: {
    employeeId: string;
    jobId: string;
    serviceDate: Date;
    locationId?: string;
    clientProfileId?: string;
    rateSnapshot: {
      type: "per_visit" | "hourly" | "monthly";
      amount: number;
      monthlyPayDay?: number;
    };
    units: number;
    hours?: number;
  }[];
  totalJobs: number;
  totalAssignments: number;
  missingRates: Array<{
    employeeId: string;
    jobId: string;
    locationId?: string;
    clientProfileId?: string;
    serviceDate?: Date;
  }>;
};

export default function PayrollPrepTab() {
  const { settings } = useSettings();
  const { show } = useToast();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creatingRun, setCreatingRun] = useState(false);
  const [periodStartInput, setPeriodStartInput] = useState<string>("");
  const [periodEndInput, setPeriodEndInput] = useState<string>("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const [resolvingMissing, setResolvingMissing] = useState(false);
  const [resolvedMissing, setResolvedMissing] = useState<
    Array<{
      employeeId: string;
      employeeName: string;
      locationId?: string;
      locationName?: string;
      clientProfileId?: string;
      clientName?: string;
      jobId: string;
      serviceDate?: Date;
    }>
  >([]);
  const [employeeNameMap, setEmployeeNameMap] = useState<
    Record<string, string>
  >({});

  // Initialize with default period
  useEffect(() => {
    const cycle = settings?.payrollCycle || {};
    const period = computeLastCompletedPeriod(new Date(), cycle);
    const end = period ? period.end : new Date();
    const start = period
      ? period.start
      : new Date(end.getTime() - 14 * 86400000);

    const toLocalDate = (d: Date) =>
      new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);

    setPeriodStartInput(toLocalDate(start));
    setPeriodEndInput(toLocalDate(end));
  }, [settings]);

  function toDateFromInput(s: string): Date | null {
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    return Number.isFinite(d.getTime()) ? d : null;
  }

  async function handleScanJobs() {
    const start = toDateFromInput(periodStartInput);
    const end = toDateFromInput(periodEndInput);

    if (!start || !end) {
      show({
        type: "error",
        message: "Please select valid start and end dates.",
      });
      return;
    }

    if (start >= end) {
      show({ type: "error", message: "End date must be after start date." });
      return;
    }

    try {
      setScanning(true);
      const result = await scanJobsForPeriod(start, end);
      setScanResult(result);
      // Resolve names for UI display in parallel (employee + modal lists)
      await Promise.all([
        resolveMissingRates(result.missingRates),
        resolveEmployeeNames(result),
      ]);

      if (result.missingRates.length > 0) {
        show({
          type: "info",
          message: `${result.missingRates.length} assignments are missing rates. Generation will skip those.`,
        });
      } else {
        show({
          type: "success",
          message: `Found ${result.totalJobs} jobs with ${result.totalAssignments} assignments.`,
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to scan jobs.";
      show({ type: "error", message: errorMessage });
    } finally {
      setScanning(false);
    }
  }

  async function handleGenerateTimesheets() {
    if (!scanResult) {
      show({ type: "error", message: "Please scan jobs first." });
      return;
    }

    try {
      setGenerating(true);
      const start = toDateFromInput(periodStartInput);
      const end = toDateFromInput(periodEndInput);

      if (!start || !end) {
        show({
          type: "error",
          message: "Please select valid start and end dates.",
        });
        return;
      }

      // Filter out monthly rates as they can't be converted to timesheets
      const eligibleDrafts = scanResult.drafts.filter(
        (draft) => draft.rateSnapshot.type !== "monthly"
      ) as Array<{
        employeeId: string;
        jobId: string;
        serviceDate: Date;
        locationId?: string;
        clientProfileId?: string;
        rateSnapshot: { type: "per_visit" | "hourly"; amount: number };
        units: number;
        hours?: number;
      }>;
      const result = await generateTimesheets(eligibleDrafts);
      show({
        type: "success",
        message: `Generated ${result.created} timesheet drafts.`,
      });

      // Refresh scan result to show updated status
      const refreshedScan = await scanJobsForPeriod(start, end);
      setScanResult(refreshedScan);
      await Promise.all([
        resolveMissingRates(refreshedScan.missingRates),
        resolveEmployeeNames(refreshedScan),
      ]);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to generate timesheets.";
      show({ type: "error", message: errorMessage });
    } finally {
      setGenerating(false);
    }
  }

  async function resolveMissingRates(
    missing: ScanResult["missingRates"]
  ): Promise<void> {
    try {
      setResolvingMissing(true);
      if (!missing || missing.length === 0) {
        setResolvedMissing([]);
        return;
      }
      const employeeIds = Array.from(
        new Set(missing.map((m) => m.employeeId).filter(Boolean))
      );
      const locationIds = Array.from(
        new Set(missing.map((m) => m.locationId).filter(Boolean))
      );
      const clientIds = Array.from(
        new Set(missing.map((m) => m.clientProfileId).filter(Boolean))
      );

      const [employeeNames, locationNames, clientNames] = await Promise.all([
        getEmployeeNames(employeeIds),
        getLocationNames(locationIds),
        getClientNames(clientIds),
      ]);

      const employeeMap = new Map<string, string>();
      employeeIds.forEach((id, i) =>
        employeeMap.set(id, employeeNames[i] || id)
      );
      const locationMap = new Map<string, string>();
      locationIds.forEach((id, i) => {
        if (id) locationMap.set(id, (locationNames[i] as string) || id);
      });
      const clientMap = new Map<string, string>();
      clientIds.forEach((id, i) => {
        if (id) clientMap.set(id, (clientNames[i] as string) || id);
      });

      const list = missing.map((m) => ({
        employeeId: m.employeeId,
        employeeName: employeeMap.get(m.employeeId) || m.employeeId,
        locationId: m.locationId,
        locationName: m.locationId
          ? locationMap.get(m.locationId) || m.locationId
          : undefined,
        clientProfileId: m.clientProfileId,
        clientName: m.clientProfileId
          ? clientMap.get(m.clientProfileId) || m.clientProfileId
          : undefined,
        jobId: m.jobId,
        serviceDate: m.serviceDate,
      }));
      setResolvedMissing(list);
    } finally {
      setResolvingMissing(false);
    }
  }

  async function resolveEmployeeNames(result: ScanResult | null) {
    if (!result) {
      setEmployeeNameMap({});
      return;
    }
    const ids = Array.from(
      new Set([
        ...result.drafts.map((d) => d.employeeId),
        ...result.missingRates.map((m) => m.employeeId),
      ])
    ).filter(Boolean);
    if (ids.length === 0) {
      setEmployeeNameMap({});
      return;
    }
    const names = await getEmployeeNames(ids);
    const map: Record<string, string> = {};
    ids.forEach((id, i) => (map[id] = names[i] || id));
    setEmployeeNameMap(map);
  }

  async function handleCreateDraftRun() {
    const start = toDateFromInput(periodStartInput);
    const end = toDateFromInput(periodEndInput);

    if (!start || !end) {
      show({
        type: "error",
        message: "Please select valid start and end dates.",
      });
      return;
    }

    if (start >= end) {
      show({ type: "error", message: "End date must be after start date." });
      return;
    }

    try {
      setCreatingRun(true);
      const result = await createPayrollRun(start, end);

      show({
        type: "success",
        message: `Payroll run created successfully with ID: ${result.id}`,
      });

      // Navigate to the run detail page
      navigate(`/finance/payroll/${result.id}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to create payroll run.";
      show({ type: "error", message: errorMessage });
    } finally {
      setCreatingRun(false);
    }
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString();
  }

  function formatMoney(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg p-4 card-bg shadow-elev-1">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Payroll Preparation</h2>
          <span className="text-xs text-zinc-500">Admin/Owner only</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end mb-4">
          <label className="block md:col-span-2">
            <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
              Period Start
            </div>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-md border card-bg border-zinc-300 dark:border-zinc-600"
              value={periodStartInput}
              onChange={(e) => setPeriodStartInput(e.target.value)}
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
              Period End
            </div>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-md border card-bg border-zinc-300 dark:border-zinc-600"
              value={periodEndInput}
              onChange={(e) => setPeriodEndInput(e.target.value)}
            />
          </label>

          <div className="md:col-span-2 flex gap-2">
            <button
              className={`px-4 py-2 rounded-md text-white font-medium ${
                scanning ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
              }`}
              onClick={handleScanJobs}
              disabled={scanning}
            >
              {scanning ? "Scanning..." : "Scan Jobs"}
            </button>

            <button
              className={`px-4 py-2 rounded-md text-white font-medium ${
                generating ? "bg-zinc-400" : "bg-green-600 hover:bg-green-700"
              }`}
              onClick={handleGenerateTimesheets}
              disabled={generating || !scanResult}
            >
              {generating ? "Generating..." : "Generate Timesheets"}
            </button>

            <button
              className={`px-4 py-2 rounded-md text-white font-medium ${
                creatingRun
                  ? "bg-zinc-400"
                  : "bg-purple-600 hover:bg-purple-700"
              }`}
              onClick={handleCreateDraftRun}
              disabled={creatingRun}
            >
              {creatingRun ? "Creating..." : "Create Draft Run"}
            </button>
          </div>
        </div>

        {scanResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
              <div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Total Jobs
                </div>
                <div className="text-2xl font-semibold">
                  {scanResult.totalJobs}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Total Assignments
                </div>
                <div className="text-2xl font-semibold">
                  {scanResult.totalAssignments}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Draft Timesheets
                </div>
                <div className="text-2xl font-semibold">
                  {scanResult.drafts.length}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Missing Rates
                </div>
                <div className="text-2xl font-semibold text-amber-600">
                  {scanResult.missingRates.length}
                </div>
                {scanResult.missingRates.length > 0 && (
                  <div className="mt-1">
                    <button
                      className="text-xs underline text-amber-700 dark:text-amber-300"
                      onClick={() => setMissingOpen(true)}
                    >
                      View details
                    </button>
                  </div>
                )}
              </div>
            </div>

            {scanResult.missingRates.length > 0 && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                  Missing Rate Information
                </div>
                <div className="text-sm text-amber-700 dark:text-amber-300">
                  {scanResult.missingRates.length} assignments are missing rate
                  information and will be skipped during generation.
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Job ID</th>
                    <th className="px-4 py-3">Service Date</th>
                    <th className="px-4 py-3">Rate Type</th>
                    <th className="px-4 py-3">Rate Amount</th>
                    <th className="px-4 py-3">Units/Hours</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scanResult.drafts.map((draft, index) => (
                    <tr
                      key={index}
                      className="border-b border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-4 py-3">
                        {employeeNameMap[draft.employeeId] || draft.employeeId}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {draft.jobId}
                      </td>
                      <td className="px-4 py-3">
                        {formatDate(draft.serviceDate)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            draft.rateSnapshot.type === "per_visit"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          }`}
                        >
                          {draft.rateSnapshot.type === "per_visit"
                            ? "Per Visit"
                            : "Hourly"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {formatMoney(draft.rateSnapshot.amount)}
                      </td>
                      <td className="px-4 py-3">
                        {draft.rateSnapshot.type === "per_visit"
                          ? `${draft.units} units`
                          : `${draft.hours || 0} hours`}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                          Draft
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Missing Rates Modal */}
        {missingOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMissingOpen(false)}
            />
            <div className="relative w-[900px] max-w-[96vw] max-h-[86vh] overflow-auto rounded-lg card-bg shadow-elev-2 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-lg font-medium">
                  Assignments Missing Rates
                </div>
                <button
                  className="px-2 py-1 text-sm rounded-md border card-bg"
                  onClick={() => setMissingOpen(false)}
                >
                  Close
                </button>
              </div>
              {resolvingMissing ? (
                <div className="text-sm text-zinc-500">Resolving names…</div>
              ) : resolvedMissing.length === 0 ? (
                <div className="text-sm text-zinc-500">No missing rates.</div>
              ) : (
                <div className="overflow-x-auto rounded-lg card-bg">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-zinc-500">
                      <tr>
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2">Location</th>
                        <th className="px-3 py-2">Client</th>
                        <th className="px-3 py-2">Job ID</th>
                        <th className="px-3 py-2">Service Date</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolvedMissing.map((m, idx) => (
                        <tr
                          key={`${m.jobId}|${m.employeeId}|${idx}`}
                          className="border-t border-zinc-100 dark:border-zinc-700"
                        >
                          <td className="px-3 py-2">
                            {employeeNameMap[m.employeeId] ||
                              m.employeeName ||
                              m.employeeId}
                          </td>
                          <td className="px-3 py-2">
                            {m.locationName || "All"}
                          </td>
                          <td className="px-3 py-2">{m.clientName || "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {m.jobId}
                          </td>
                          <td className="px-3 py-2">
                            {m.serviceDate
                              ? m.serviceDate.toLocaleDateString()
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              className="text-blue-600 dark:text-blue-400 underline"
                              onClick={() => {
                                setMissingOpen(false);
                                navigate(`/hr/${m.employeeId}`);
                              }}
                            >
                              Open HR
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
