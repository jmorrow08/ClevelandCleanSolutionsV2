import { useEffect, useState } from "react";
import { ServiceAgreementProjectionService } from "../../../services/serviceAgreementProjections";
import { format, isToday, isTomorrow } from "date-fns";

export default function ServiceAgreementProjections() {
  const [loading, setLoading] = useState(true);
  const [projections, setProjections] = useState<any>(null);
  const [upcomingPayments, setUpcomingPayments] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        console.log("Loading service agreement projections...");
        const projectionsData =
          await ServiceAgreementProjectionService.getFinancialProjections(30);
        console.log("Projections data received:", projectionsData);
        setProjections(projectionsData);

        // Get upcoming payments (next 7 days)
        const upcoming = projectionsData.upcomingPayments.filter(
          (payment: any) => payment.daysUntil <= 7
        );
        console.log("Upcoming payments:", upcoming);
        setUpcomingPayments(upcoming);
      } catch (error) {
        console.warn("Error loading service agreement projections", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const formatPaymentDate = (date: Date) => {
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "MMM d");
  };

  const getUrgencyColor = (daysUntil: number) => {
    if (daysUntil <= 1) return "text-red-600 dark:text-red-400";
    if (daysUntil <= 3) return "text-orange-600 dark:text-orange-400";
    return "text-green-600 dark:text-green-400";
  };

  if (loading) {
    return (
      <div className="rounded-lg p-4 card-bg shadow-elev-1">
        <div className="font-medium">Service Agreement Projections</div>
        <div className="text-sm text-zinc-500 mt-2">Loading…</div>
      </div>
    );
  }

  if (!projections) {
    return (
      <div className="rounded-lg p-4 card-bg shadow-elev-1">
        <div className="font-medium">Service Agreement Projections</div>
        <div className="text-sm text-zinc-500 mt-2">No data available.</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-4 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1">
      <div className="font-medium">Service Agreement Projections</div>

      {/* Key Metrics */}
      <div className="mt-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Expected Revenue (30d)
          </span>
          <span className="text-sm font-medium">
            ${projections.totalExpectedRevenue?.toLocaleString() || "0"}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Active Agreements
          </span>
          <span className="text-sm font-medium">
            {Object.keys(projections.monthlyBreakdown).length}
          </span>
        </div>
      </div>

      {/* Upcoming Payments */}
      {upcomingPayments.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Upcoming Payments (7 days)
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {upcomingPayments.slice(0, 5).map((payment: any, index: number) => (
              <div
                key={`${payment.agreementId}-${index}`}
                className="flex justify-between items-center text-sm py-1 border-b border-zinc-100 dark:border-zinc-700 last:border-b-0"
              >
                <div className="flex-1">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    {payment.agreementName}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {formatPaymentDate(payment.paymentDate)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    ${payment.amount.toLocaleString()}
                  </div>
                  <div
                    className={`text-xs ${getUrgencyColor(payment.daysUntil)}`}
                  >
                    {payment.daysUntil === 0
                      ? "Due today"
                      : payment.daysUntil === 1
                      ? "Due tomorrow"
                      : `${payment.daysUntil} days`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {upcomingPayments.length === 0 && (
        <div className="text-sm text-zinc-500 mt-4">
          No upcoming payments in the next 7 days.
        </div>
      )}
    </div>
  );
}
