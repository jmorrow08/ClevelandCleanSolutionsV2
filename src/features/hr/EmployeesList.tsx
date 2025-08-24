import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  getDocs,
  where,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { Link } from "react-router-dom";
import { RoleGuard } from "../../context/RoleGuard";
import { NewEmployeeProvider, useNewEmployeeModal } from "./NewEmployeeModal";

type Employee = {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  employeeIdString?: string;
  jobTitle?: string;
  status?: boolean;
};

export function filterEmployees(
  list: Employee[],
  nameQuery: string,
  role: string
): Employee[] {
  const q = (nameQuery || "").trim().toLowerCase();
  const roleQ = (role || "").trim().toLowerCase();
  return list.filter((e) => {
    const name = (
      (e.fullName ||
        [e.firstName, e.lastName].filter(Boolean).join(" ") ||
        e.email ||
        e.phone ||
        e.id) as string
    ).toLowerCase();
    const matchesName = q ? name.includes(q) : true;
    const matchesRole =
      roleQ && roleQ !== "all"
        ? (e.role || "employee").toLowerCase() === roleQ
        : true;
    return matchesName && matchesRole;
  });
}

function EmployeesListInner() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [, setError] = useState<string | null>(null);
  const { open } = useNewEmployeeModal();
  const [nameFilter, setNameFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        // Primary source: employeeMasterList (fetch and sort client-side by display name)
        let list: Employee[] = [];
        try {
          const snap = await getDocs(collection(db, "employeeMasterList"));
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          list.sort((a, b) => {
            const an = (
              a.fullName ||
              [a.firstName, a.lastName].filter(Boolean).join(" ") ||
              a.email ||
              a.id ||
              ""
            )
              .toString()
              .toLowerCase();
            const bn = (
              b.fullName ||
              [b.firstName, b.lastName].filter(Boolean).join(" ") ||
              b.email ||
              b.id ||
              ""
            )
              .toString()
              .toLowerCase();
            return an.localeCompare(bn);
          });
        } catch (e) {
          // ignore and fallback
        }

        // Fallback source: users collection filtered by role (employee/admin/owner/super_admin)
        if (list.length === 0) {
          try {
            const roles = ["employee", "admin", "owner", "super_admin"];
            const snap = await getDocs(
              query(collection(db, "users"), where("role", "in", roles))
            );
            const conv: Employee[] = [];
            snap.forEach((d) => {
              const u = d.data() as any;
              const idForDetail = u.profileId || d.id;
              conv.push({
                id: idForDetail,
                fullName:
                  u.fullName ||
                  u.displayName ||
                  u.name ||
                  u.email ||
                  idForDetail,
                email: u.email || "",
                phone: u.phone || u.phoneNumber || "",
                role: u.role || "employee",
              });
            });
            list = conv;
          } catch (e) {
            // keep empty; permission may block read
          }
        }
        setEmployees(list);
      } catch (e: any) {
        setError(e?.message || "Failed to load employees");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const availableRoles = useMemo(() => {
    const set = new Set<string>(["all"]);
    employees.forEach((e) => set.add((e.role || "employee").toLowerCase()));
    return Array.from(set);
  }, [employees]);

  const filtered = useMemo(
    () => filterEmployees(employees, nameFilter, roleFilter),
    [employees, nameFilter, roleFilter]
  );

  function displayName(e: Employee): string {
    const fromParts = [e.firstName, e.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return (e.fullName || fromParts || e.email || e.id) as string;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">HR - Employees</h1>
        <RoleGuard allow={["admin", "owner", "super_admin"]}>
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
            onClick={open}
          >
            New Employee
          </button>
        </RoleGuard>
      </div>

      <div className="flex flex-col md:flex-row gap-2 md:items-end">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Name</label>
          <input
            placeholder="Search by name"
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
        </div>
        <div className="w-full md:w-56">
          <label className="block text-xs text-zinc-500 mb-1">Role</label>
          <select
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            {availableRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="hidden md:block overflow-x-auto rounded-lg bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1">
        <table className="min-w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500" colSpan={5}>
                  No employees found.
                </td>
              </tr>
            ) : (
              filtered.map((e, idx) => (
                <tr
                  key={`${e.id}:${e.email || ""}:${idx}`}
                  className="border-t border-zinc-100 dark:border-zinc-700"
                >
                  <td className="px-3 py-2 max-w-[320px]">
                    <div className="truncate" title={displayName(e)}>
                      {displayName(e)}
                    </div>
                  </td>
                  <td className="px-3 py-2">{e.email || "—"}</td>
                  <td className="px-3 py-2">{e.phone || "—"}</td>
                  <td className="px-3 py-2">{e.employeeIdString || "—"}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                      {e.role || "employee"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to={`/hr/${e.id}`}
                      className="text-blue-600 dark:text-blue-400 underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="rounded-lg p-3 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg p-3 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
            No employees found.
          </div>
        ) : (
          filtered.map((e, idx) => (
            <div
              key={`${e.id}:${e.email || ""}:${idx}`}
              className="rounded-lg p-3 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className="font-medium min-w-0 flex-1 truncate"
                  title={displayName(e)}
                >
                  {displayName(e)}
                </div>
                <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                  {e.role || "employee"}
                </span>
              </div>
              <div className="text-xs text-zinc-500 mt-1 truncate">
                {e.email || "—"}
              </div>
              <div className="text-xs text-zinc-500 truncate">
                {e.phone || "—"}
              </div>
              <div className="text-xs text-zinc-500 truncate">
                ID: {e.employeeIdString || "—"}
              </div>
              <div className="mt-2 text-right">
                <Link
                  to={`/hr/${e.id}`}
                  className="text-blue-600 dark:text-blue-400 underline text-sm"
                >
                  View
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function EmployeesList() {
  return (
    <NewEmployeeProvider>
      <EmployeesListInner />
    </NewEmployeeProvider>
  );
}
