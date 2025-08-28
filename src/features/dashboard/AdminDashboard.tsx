import KPIStrip from "./widgets/KPIStrip";
import TodayBoard from "./widgets/TodayBoard";
import Approvals from "./widgets/Approvals";
import Alerts from "./widgets/Alerts";
import CashSnapshot from "./widgets/CashSnapshot";
import MyQueue from "./widgets/MyQueue";
import PresencePulse from "./widgets/PresencePulse";
import QuickActions from "./actions/QuickActions";
import QuickAddPanel from "./QuickAddPanel";

export default function AdminDashboard() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <QuickActions />
      </div>
      <QuickAddPanel />
      <KPIStrip />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TodayBoard />
        <Approvals />
        <Alerts />
        <CashSnapshot />
        <MyQueue />
        <PresencePulse />
      </div>
    </div>
  );
}
