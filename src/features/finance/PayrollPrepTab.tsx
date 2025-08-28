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
    type: "per_visit" | "hourly";
    amount: number;
  };
  units: number;
  hours?: number;
};

type ScanResult = {
  jobs: JobAssignment[];
  drafts: TimesheetDraft[];
  totalJobs: number;
  totalAssignments: number;
  missingRates: Array<{
    employeeId: string;
    jobId: string;
    locationId?: string;
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

      if (result.missingRates.length > 0) {
        show({
          type: "warning",
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

      const result = await generateTimesheets(scanResult.drafts);
      show({
        type: "success",
        message: `Generated ${result.created} timesheet drafts.`,
      });

      // Refresh scan result to show updated status
      const refreshedScan = await scanJobsForPeriod(start, end);
      setScanResult(refreshedScan);
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
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <h2 className="text-lg font-semibold mb-4">Payroll Preparation</h2>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end mb-4">
          <label className="block md:col-span-2">
            <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
              Period Start
            </div>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-md border bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600"
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
              className="w-full px-3 py-2 rounded-md border bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600"
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
                      <td className="px-4 py-3">{draft.employeeId}</td>
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
      </div>
    </div>
  );
}
