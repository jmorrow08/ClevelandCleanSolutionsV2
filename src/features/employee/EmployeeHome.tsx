import MyWeek from "./MyWeek";
import PasswordChange from "./PasswordChange";
import TimesheetView from "./TimesheetView";
export default function EmployeeHome() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Employee</h1>
        <button className="md:hidden text-sm underline">Logout</button>
      </div>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <div className="font-medium mb-2">My Week</div>
        <MyWeek />
      </div>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <div className="font-medium mb-2">Password</div>
        <PasswordChange />
      </div>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <div className="font-medium mb-2">Timesheets</div>
        <TimesheetView />
      </div>
    </div>
  );
}
