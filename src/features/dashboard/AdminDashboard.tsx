import KPIStrip from "./widgets/KPIStrip";
import EmployeeTimeTracking from "./widgets/EmployeeTimeTracking";
import JobsNeedingCompletion from "./widgets/JobsNeedingCompletion";
import QuickActions from "./actions/QuickActions";
import { QuickAddProvider } from "./QuickAddPanel";

export default function AdminDashboard() {
  return (
    <QuickAddProvider>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <QuickActions />
        </div>
        <KPIStrip />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <JobsNeedingCompletion />
          <EmployeeTimeTracking />
        </div>
      </div>
    </QuickAddProvider>
  );
}
