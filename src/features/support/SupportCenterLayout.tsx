import { NavLink, Outlet, useLocation } from "react-router-dom";

export default function SupportCenterLayout() {
  const { pathname } = useLocation();
  const base = "/support";
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Support Center</h1>
        <div className="text-sm text-zinc-500">
          Manage flagged photos and support tickets
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700">
        <Tab
          to={`${base}/flagged`}
          active={pathname.startsWith(`${base}/flagged`)}
          icon="🏳️"
        >
          Flagged Photos
        </Tab>
        <Tab
          to={`${base}`}
          end
          active={
            pathname === base ||
            pathname === `${base}/` ||
            pathname.startsWith(`${base}/t`)
          }
          icon="🧭"
        >
          Support Tickets
        </Tab>
        <Tab
          to={`${base}/reviews`}
          active={pathname.startsWith(`${base}/reviews`)}
          icon="⭐"
        >
          Client Reviews
        </Tab>
      </div>

      <Outlet />
    </div>
  );
}

function Tab({
  to,
  children,
  active,
  icon,
  end,
}: {
  to: string;
  children: any;
  active?: boolean;
  icon?: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={`px-3 py-2 -mb-px border-b-2 text-sm ${
        active
          ? "border-blue-600 text-blue-700 dark:text-blue-300"
          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
      }`}
    >
      <span className="mr-1">{icon}</span>
      {children}
    </NavLink>
  );
}
