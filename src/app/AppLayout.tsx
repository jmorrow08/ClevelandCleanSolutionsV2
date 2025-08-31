import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { ScheduleJobProvider } from "../features/scheduling/ScheduleJobModal";

type NavItem = { label: string; to: string };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/" },
  { label: "Finance", to: "/finance" },
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

function AdminSidebar({
  isMobileOpen,
  onClose,
}: {
  isMobileOpen?: boolean;
  onClose?: () => void;
}) {
  return (
    <aside
      className={`flex flex-col border-r border-[var(--border)] card-bg w-48 md:w-60
                      ${
                        isMobileOpen !== undefined
                          ? isMobileOpen
                            ? "block"
                            : "hidden"
                          : "hidden"
                      } md:flex
                      md:relative fixed inset-y-0 left-0 z-50 md:z-auto`}
    >
      <div className="h-14 flex items-center px-4 text-[var(--text)] font-semibold border-b border-[var(--border)]">
        <span className="md:hidden mr-2" onClick={onClose}>
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </span>
        Admin Portal
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
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

function SidebarShell({
  title,
  items,
  isMobileOpen,
  onClose,
}: {
  title: string;
  items: NavItem[];
  isMobileOpen?: boolean;
  onClose?: () => void;
}) {
  return (
    <aside
      className={`flex flex-col border-r border-[var(--border)] card-bg w-48 md:w-60
                      ${
                        isMobileOpen !== undefined
                          ? isMobileOpen
                            ? "block"
                            : "hidden"
                          : "hidden"
                      } md:flex
                      md:relative fixed inset-y-0 left-0 z-50 md:z-auto`}
    >
      <div className="h-14 flex items-center px-4 text-[var(--text)] font-semibold border-b border-[var(--border)]">
        <span className="md:hidden mr-2" onClick={onClose}>
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </span>
        {title}
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
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

function EmployeeSidebar({
  isMobileOpen,
  onClose,
}: {
  isMobileOpen?: boolean;
  onClose?: () => void;
}) {
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
  return (
    <SidebarShell
      title="Employee Portal"
      items={items}
      isMobileOpen={isMobileOpen}
      onClose={onClose}
    />
  );
}

function ClientSidebar({
  isMobileOpen,
  onClose,
}: {
  isMobileOpen?: boolean;
  onClose?: () => void;
}) {
  const items: NavItem[] = [
    { label: "Home", to: "/client" },
    { label: "Services", to: "/client/services" },
    { label: "Invoices", to: "/client/invoices" },
    { label: "Support", to: "/client/support" },
    { label: "Profile", to: "/client/profile" },
    { label: "Resources", to: "/client/resources" },
    { label: "Logout", to: "/logout" },
  ];
  return (
    <SidebarShell
      title="Client Portal"
      items={items}
      isMobileOpen={isMobileOpen}
      onClose={onClose}
    />
  );
}

function Topbar({ onToggleMobileMenu }: { onToggleMobileMenu?: () => void }) {
  const { settings } = useSettings();
  const companyName =
    settings?.companyProfile?.name || "Cleveland Clean Solutions";
  const logoUrl = settings?.companyProfile?.logoDataUrl;

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-[var(--border)] card-bg backdrop-blur supports-[backdrop-filter]:card-bg">
      <div className="flex items-center gap-4">
        {/* Hamburger menu button for mobile */}
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 rounded-md hover:bg-[var(--muted)] transition-colors"
          aria-label="Toggle menu"
        >
          <svg
            className="w-6 h-6 text-[var(--text)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Company Logo"
              className="h-8 w-auto object-contain"
              onError={(e) => {
                // Hide logo if it fails to load
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="font-medium text-[var(--text)]">{companyName}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}

export default function AppLayout() {
  const { claims } = useAuth();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const role = (claims as any)?.role as string | undefined;
  const isSuperAdmin =
    Boolean((claims as any)?.super_admin) || role === "super_admin";
  const isOwner = Boolean((claims as any)?.owner) || role === "owner";
  const isAdmin = Boolean((claims as any)?.admin) || role === "admin";
  const isEmployee = Boolean((claims as any)?.employee) || role === "employee";
  const isClient = Boolean((claims as any)?.client) || role === "client";
  const isAdminOrAbove = isSuperAdmin || isOwner || isAdmin;

  const toggleMobileSidebar = () => {
    setIsMobileSidebarOpen(!isMobileSidebarOpen);
  };

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  return (
    <ScheduleJobProvider>
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        {/* Mobile sidebar backdrop */}
        {isMobileSidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={closeMobileSidebar}
          />
        )}

        <div className="flex">
          {isAdminOrAbove ? (
            <AdminSidebar
              isMobileOpen={isMobileSidebarOpen}
              onClose={closeMobileSidebar}
            />
          ) : isEmployee ? (
            <EmployeeSidebar
              isMobileOpen={isMobileSidebarOpen}
              onClose={closeMobileSidebar}
            />
          ) : isClient ? (
            <ClientSidebar
              isMobileOpen={isMobileSidebarOpen}
              onClose={closeMobileSidebar}
            />
          ) : null}
          <main className="flex-1 min-w-0">
            <Topbar onToggleMobileMenu={toggleMobileSidebar} />
            <div className="p-3 md:p-4">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </ScheduleJobProvider>
  );
}
