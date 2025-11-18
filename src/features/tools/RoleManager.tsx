import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/context/RoleGuard";
import { assignUserRoleByEmail, type AssignableRole } from "@/services/admin";
import { useToast } from "@/context/ToastContext";

export default function RoleManager() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("owner");
  const [loading, setLoading] = useState(false);
  const { show } = useToast();
  const { claims } = useAuth();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await assignUserRoleByEmail(email.trim().toLowerCase(), role);
      show({ type: "success", message: `Assigned ${role} to ${email}` });
    } catch (err: any) {
      show({ type: "error", message: err?.message || "Failed to assign role" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <RoleGuard allow={["super_admin"]}>
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Role Manager</h1>
        <form onSubmit={onSubmit} className="card-bg rounded-lg p-4 space-y-3 max-w-lg">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-md p-2 bg-transparent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Role</label>
            <select
              className="w-full border rounded-md p-2 bg-transparent"
              value={role}
              onChange={(e) => setRole(e.target.value as AssignableRole)}
            >
              <option value="owner">owner</option>
              <option value="admin">admin</option>
              <option value="employee">employee</option>
              <option value="client">client</option>
              <option value="super_admin">super_admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading || !email}
            className="px-3 py-2 rounded-md bg-[var(--brand)] text-white disabled:opacity-60"
          >
            {loading ? "Assigning..." : "Assign Role"}
          </button>
        </form>
        <div className="text-xs opacity-70">
          Signed in as: {(claims as any)?.email || "user"} — only super_admins can use this tool.
        </div>
      </div>
    </RoleGuard>
  );
}


