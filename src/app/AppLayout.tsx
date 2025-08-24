import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";

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
  { label: "Support", to: "/support" },
  { label: "Logout", to: "/logout" },
];

function DarkModeToggle() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved
      ? saved === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setEnabled(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  function toggle() {
    const next = !enabled;
    setEnabled(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }
  return (
    <button
      onClick={toggle}
      className="px-3 py-1 rounded-md text-sm bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
      aria-label="Toggle dark mode"
    >
      {enabled ? "Dark" : "Light"}
    </button>
  );
}

function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-zinc-200 dark:md:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="h-14 flex items-center px-4 text-zinc-900 dark:text-zinc-100 font-semibold border-b border-zinc-200 dark:border-zinc-800">
        CCS Admin
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                isActive
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-700 dark:text-zinc-300"
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

function Topbar() {
  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="md:hidden">
        {/* Placeholder for mobile menu in future */}
        <span className="text-sm text-zinc-500">Menu</span>
      </div>
      <div className="font-medium text-zinc-900 dark:text-zinc-100">
        Cleveland Clean Solutions
      </div>
      <div className="flex items-center gap-2">
        <DarkModeToggle />
      </div>
    </header>
  );
}

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <Topbar />
          <div className="p-4">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
