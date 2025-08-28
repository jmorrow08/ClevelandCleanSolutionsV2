import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ScheduleJobProvider } from "../features/scheduling/ScheduleJobModal";

type NavItem = { label: string; to: string };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/" },
  { label: "Finance", to: "/finance" },
  { label: "Payroll Prep", to: "/finance/payroll-prep" },
  { label: "Inventory", to: "/inventory" },
  { label: "Scheduling", to: "/scheduling" },
  { label: "Service History", to: "/service-history" },
  { label: "CRM", to: "/crm" },
  { label: "Marketing", to: "/marketing" },
  { label: "Media", to: "/media" },
  { label: "Training", to: "/training/admin" },
  { label: "Analytics", to: "/analytics" },
  { label: "HR", to: "/hr" },
  { label: "Settings", to: "/settings" },
  { label: "Audit Log", to: "/settings/audit" },
  { label: "Notifications", to: "/notifications" },
  { label: "Tools", to: "/tools/validator" },
  { label: "Support", to: "/support" },
  { label: "Logout", to: "/logout" },
];

function ThemeToggle() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    // Default to light unless user explicitly chose dark
    const isDark = saved === "dark";
    setEnabled(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    document.body.classList.toggle("dark", isDark);
    // Normalize storage so future loads are consistent
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, []);
  function toggle() {
    const next = !enabled;
    setEnabled(next);
    document.documentElement.classList.toggle("dark", next);
    document.body.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }
  return (
    <button
      onClick={toggle}
      className="px-3 py-1 rounded-md text-sm bg-[var(--muted)] text-[var(--text)] border border-[var(--border)] hover:brightness-95 focus-ring"
      aria-label="Toggle theme"
    >
      {enabled ? "Dark" : "Light"}
    </button>
  );
}

function AdminSidebar() {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-[var(--border)] bg-[var(--card)]">
      <div className="h-14 flex items-center px-4 text-[var(--text)] font-semibold border-b border-[var(--border)]">
        CCS Admin
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm ${
                isActive
                  ? "bg-[var(--brand)] text-white"
                  : "text-[var(--text)] opacity-80 hover:bg-[var(--muted)]"
              }`
            }
            end={item.to === "/"}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function SidebarShell({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-[var(--border)] bg-[var(--card)]">
      <div className="h-14 flex items-center px-4 text-[var(--text)] font-semibold border-b border-[var(--border)]">
        {title}
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm ${
                isActive
                  ? "bg-[var(--brand)] text-white"
                  : "text-[var(--text)] opacity-80 hover:bg-[var(--muted)]"
              }`
            }
            end={item.to === "/"}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function EmployeeSidebar() {
  const items: NavItem[] = [
    { label: "Home", to: "/employee" },
    { label: "My Jobs", to: "/employee/jobs" },
    { label: "Upload Photos", to: "/employee/photos" },
    { label: "My Photos", to: "/employee/uploads" },
    { label: "Job Notes", to: "/employee/notes" },
    { label: "Payroll", to: "/employee/payroll" },
    { label: "Settings", to: "/employee/settings" },
    { label: "Knowledge", to: "/employee/knowledge" },
    { label: "Logout", to: "/logout" },
  ];
  return <SidebarShell title="CCS Employee" items={items} />;
}

function ClientSidebar() {
  const items: NavItem[] = [
    { label: "Home", to: "/client" },
    { label: "Services", to: "/client/services" },
    { label: "Invoices", to: "/client/invoices" },
    { label: "Support", to: "/client/support" },
    { label: "Profile", to: "/client/profile" },
    { label: "Resources", to: "/client/resources" },
    { label: "Logout", to: "/logout" },
  ];
  return <SidebarShell title="CCS Client" items={items} />;
}

function Topbar() {
  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--card)] backdrop-blur supports-[backdrop-filter]:bg-[var(--card)]">
      <div className="md:hidden">
        {/* Placeholder for mobile menu in future */}
        <span className="text-sm text-[var(--text)] opacity-60">Menu</span>
      </div>
      <div className="font-medium text-[var(--text)]">
        Cleveland Clean Solutions
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}

export default function AppLayout() {
  const { claims } = useAuth();
  const role = (claims as any)?.role as string | undefined;
  const isSuperAdmin =
    Boolean((claims as any)?.super_admin) || role === "super_admin";
  const isOwner = Boolean((claims as any)?.owner) || role === "owner";
  const isAdmin = Boolean((claims as any)?.admin) || role === "admin";
  const isEmployee = Boolean((claims as any)?.employee) || role === "employee";
  const isClient = Boolean((claims as any)?.client) || role === "client";
  const isAdminOrAbove = isSuperAdmin || isOwner || isAdmin;
  return (
    <ScheduleJobProvider>
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <div className="flex">
          {isAdminOrAbove ? (
            <AdminSidebar />
          ) : isEmployee ? (
            <EmployeeSidebar />
          ) : isClient ? (
            <ClientSidebar />
          ) : null}
          <main className="flex-1 min-w-0">
            <Topbar />
            <div className="p-4">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </ScheduleJobProvider>
  );
}
