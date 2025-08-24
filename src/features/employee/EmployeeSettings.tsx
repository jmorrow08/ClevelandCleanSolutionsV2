import PasswordChange from "./PasswordChange";

export default function EmployeeSettings() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <div className="font-medium mb-2">Change Password</div>
        <PasswordChange />
      </div>
    </div>
  );
}
