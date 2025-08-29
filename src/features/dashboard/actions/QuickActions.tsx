import { useNavigate } from "react-router-dom";
import { useQuickActions } from "../../../context/QuickActionsContext";
import { useQuickAddModal } from "../QuickAddPanel";

export default function QuickActions() {
  const navigate = useNavigate();
  const { requestNewInvoice } = useQuickActions();
  const { open } = useQuickAddModal();
  return (
    <div className="flex gap-2">
      <button
        className="px-3 py-2 text-sm rounded-md bg-brand-600 text-white"
        onClick={() => {
          navigate("/finance");
          // allow route change then request modal
          setTimeout(() => requestNewInvoice(), 0);
        }}
      >
        New Invoice
      </button>
      <button
        className="px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700"
        onClick={() => open()}
      >
        Quick Add
      </button>
    </div>
  );
}

export function SchedulingQuickActions() {
  const { open } = useQuickAddModal();
  return (
    <button
      className="px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700"
      onClick={() => open()}
    >
      Quick Add
    </button>
  );
}
