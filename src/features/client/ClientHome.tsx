import ClientDashboard from "./ClientDashboard";
// import Billing from "./Billing";
import ClientJobTimeline from "./ClientJobTimeline";

export default function ClientHome() {
  return (
    <div className="p-6 space-y-4">
      <ClientDashboard />
      <ClientJobTimeline />
      {/* Removed invoices block from home dashboard per request */}
    </div>
  );
}
