import { Link } from "react-router-dom";
import { Camera, StickyNote, DollarSign } from "lucide-react";

const actions = [
  {
    icon: Camera,
    label: "Upload Photos",
    href: "/employee/photos",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
  },
  {
    icon: StickyNote,
    label: "Job Notes",
    href: "/employee/notes",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
  },
  {
    icon: DollarSign,
    label: "Payroll",
    href: "/employee/payroll",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
  },
];

export default function QuickActions() {
  return (
    <div className="card-bg border border-border rounded-lg shadow-sm">
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {actions.map((action, index) => (
            <Link
              key={index}
              to={action.href}
              className="flex flex-col items-center p-4 rounded-lg border border-border hover:shadow-md transition-all card-bg hover:bg-gray-50 dark:hover:bg-zinc-800"
            >
              <div
                className={`h-12 w-12 ${action.iconBg} rounded-lg flex items-center justify-center mx-auto mb-2`}
              >
                <action.icon className={`h-6 w-6 ${action.iconColor}`} />
              </div>
              <span className="text-sm font-medium text-center">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
