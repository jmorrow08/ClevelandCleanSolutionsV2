import { useState } from "react";
import InvoicesPage from "./InvoicesPage";
import PaymentsPage from "./PaymentsPage";
import ExpensesPage from "./ExpensesPage";
import PayrollRunsTab from "./PayrollRunsTab";
import ARAgingTab from "./ARAgingTab";
import CashflowTab from "./CashflowTab";

const tabs = [
  { key: "invoices", label: "Invoices" },
  { key: "payments", label: "Payments" },
  { key: "expenses", label: "Expenses" },
  { key: "payroll", label: "Payroll Runs" },
  { key: "ar", label: "AR Aging" },
  { key: "cashflow", label: "Cashflow" },
];

export default function FinanceHub() {
  const [active, setActive] = useState<string>(tabs[0].key);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Finance</h1>
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                active === t.key
                  ? "border-zinc-900 dark:border-zinc-100"
                  : "border-transparent text-zinc-500"
              }`}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4 min-h-[200px]">
        {active === "invoices" && <InvoicesPage />}
        {active === "payments" && <PaymentsPage />}
        {active === "expenses" && <ExpensesPage />}
        {active === "payroll" && <PayrollRunsTab />}
        {active === "ar" && <ARAgingTab />}
        {active === "cashflow" && <CashflowTab />}
      </div>
    </div>
  );
}
