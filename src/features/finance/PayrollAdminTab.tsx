import { useState } from "react";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";
import { processClockEventsForTimesheets } from "../../services/automation/timesheetAutomation";
import {
  cleanupProcessedJobsWithoutRuns,
  analyzePayrollState,
} from "../../services/payrollCleanup";

export default function PayrollAdminTab() {
  const { show } = useToast();
  const [processingClockEvents, setProcessingClockEvents] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const handleProcessClockEvents = async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); // Last 7 days
    const endDate = new Date();

    setProcessingClockEvents(true);
    try {
      const result = await processClockEventsForTimesheets(startDate, endDate);
      show({
        type: "success",
        message: `Processed ${result.processed} timesheets from clock events (${result.skipped} skipped)`,
      });
    } catch (error: any) {
      console.error("Error processing clock events:", error);
      show({
        type: "error",
        message: `Failed to process clock events: ${error.message}`,
      });
    } finally {
      setProcessingClockEvents(false);
    }
  };

  const handleCleanup = async () => {
    setCleaningUp(true);
    try {
      const result = await cleanupProcessedJobsWithoutRuns();
      show({
        type: result.cleaned > 0 ? "success" : "info",
        message: result.message,
      });
    } catch (error: any) {
      console.error("Error cleaning up payroll:", error);
      show({
        type: "error",
        message: `Failed to cleanup payroll: ${error.message}`,
      });
    } finally {
      setCleaningUp(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const result = await analyzePayrollState();
      setAnalysis(result);
      show({ type: "success", message: "Payroll analysis complete" });
    } catch (error: any) {
      console.error("Error analyzing payroll:", error);
      show({
        type: "error",
        message: `Failed to analyze payroll: ${error.message}`,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <RoleGuard allow={["admin", "owner", "super_admin"]}>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Payroll Administration</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Advanced tools for managing payroll automation and data cleanup
          </p>
        </div>

        {/* Analysis Section */}
        <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
          <h3 className="font-medium mb-3">Payroll Analysis</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {analyzing ? "Analyzing..." : "Analyze Payroll State"}
            </button>
            {analysis && (
              <button
                onClick={() => setAnalysis(null)}
                className="px-3 py-2 border rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Clear
              </button>
            )}
          </div>

          {analysis && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-sm">
                  <div className="font-medium">Jobs</div>
                  <div>Total: {analysis.jobs.total}</div>
                  <div>Processed: {analysis.jobs.processed}</div>
                  <div>Unprocessed: {analysis.jobs.unprocessed}</div>
                </div>
                <div className="text-sm">
                  <div className="font-medium">Payroll Runs</div>
                  <div>Total: {analysis.payrollRuns.total}</div>
                  {Object.entries(analysis.payrollRuns).map(
                    ([status, count]) =>
                      status !== "total" && (
                        <div key={status}>
                          {status}: {String(count)}
                        </div>
                      )
                  )}
                </div>
                <div className="text-sm">
                  <div className="font-medium">Timesheets</div>
                  <div>Total: {analysis.timesheets.total}</div>
                  <div>Approved: {analysis.timesheets.approved}</div>
                  <div>Pending: {analysis.timesheets.pending}</div>
                  <div>In Runs: {analysis.timesheets.withRuns}</div>
                  <div>Not in Runs: {analysis.timesheets.withoutRuns}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Automation Section */}
        <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
          <h3 className="font-medium mb-3">Automation Tools</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Process Clock Events</div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Create timesheets from recent clock-in/out events (last 7
                  days)
                </div>
              </div>
              <button
                onClick={handleProcessClockEvents}
                disabled={processingClockEvents}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {processingClockEvents
                  ? "Processing..."
                  : "Process Clock Events"}
              </button>
            </div>
          </div>
        </div>

        {/* Cleanup Section */}
        <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
          <h3 className="font-medium mb-3">Data Cleanup</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">
                  Fix Incorrectly Processed Jobs
                </div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Unmark jobs as "payroll processed" if they don't have
                  corresponding payroll runs
                </div>
              </div>
              <button
                onClick={handleCleanup}
                disabled={cleaningUp}
                className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
              >
                {cleaningUp ? "Cleaning..." : "Cleanup Jobs"}
              </button>
            </div>
          </div>
        </div>

        {/* Information Section */}
        <div className="card-bg border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
          <h3 className="font-medium mb-3">New Payroll Process</h3>
          <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              <strong>Automated Process:</strong> Clock events now automatically
              create timesheets when employees clock in at job locations.
            </p>
            <p>
              <strong>Real-time Updates:</strong> Timesheet earnings update
              automatically when jobs are marked as completed by admins.
            </p>
            <p>
              <strong>Weekly Review:</strong> Use the Weekly Payroll Review tab
              to see all timesheets for the current week and approve them in
              bulk.
            </p>
            <p>
              <strong>Flexible Rates:</strong> Employees can have different rate
              types (hourly/per-visit/monthly) per location or client.
            </p>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
