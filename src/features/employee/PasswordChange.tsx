import { useState } from "react";

export default function PasswordChange() {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <label className="text-sm">New Password</label>
      <div className="flex items-center gap-2">
        <input
          type={show ? "text" : "password"}
          className="border rounded-md px-3 py-2 bg-white dark:bg-zinc-900 flex-1"
          placeholder="Enter new password"
          disabled
        />
        <button
          onClick={() => setShow((s) => !s)}
          className="px-3 py-2 rounded-md text-sm bg-zinc-200 dark:bg-zinc-700"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <div className="text-xs text-zinc-500">
        Password change disabled until rules added.
      </div>
    </div>
  );
}
