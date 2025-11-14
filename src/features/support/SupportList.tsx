import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { Link } from "react-router-dom";
import {
  formatDateTime,
  getEmployeeName,
  loadAssignableEmployees,
  type SupportTicket,
} from "./supportUtils";
import { getClientNames } from "../../services/queries/resolvers";

type FilterState = {
  status: "all" | "open" | "in_progress" | "resolved";
  priority: "all" | "low" | "normal" | "high" | "urgent";
  assignee: "all" | string;
};

export default function SupportList() {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    status: "all",
    priority: "all",
    assignee: "all",
  });
  const [employees, setEmployees] = useState<
    Array<{ id: string; fullName: string }>
  >([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [assigneeNames, setAssigneeNames] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const q = query(
          collection(db, "supportTickets"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const list: SupportTicket[] = [] as any;
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setTickets(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadNames() {
      const clientIds = Array.from(
        new Set(tickets.map((t) => t.clientId).filter(Boolean))
      ) as string[];
      const assigneeIds = Array.from(
        new Set(tickets.map((t) => t.assigneeId).filter(Boolean))
      ) as string[];
      const clientNameList = await getClientNames(clientIds);
      const cn: Record<string, string> = {};
      clientIds.forEach((id, i) => (cn[id] = clientNameList[i] || id));
      setClientNames(cn);
      const an: Record<string, string> = {};
      await Promise.all(
        assigneeIds.map(async (id) => (an[id] = await getEmployeeName(id)))
      );
      setAssigneeNames(an);
    }
    if (tickets.length > 0) {
      loadNames();
    } else {
      setClientNames({});
      setAssigneeNames({});
    }
  }, [tickets]);

  useEffect(() => {
    loadAssignableEmployees()
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      const statusOk =
        filters.status === "all" || (t.status || "open") === filters.status;
      const prioOk =
        filters.priority === "all" ||
        (t.priority || "normal") === filters.priority;
      const assignOk =
        filters.assignee === "all" || t.assigneeId === filters.assignee;
      return statusOk && prioOk && assignOk;
    });
  }, [tickets, filters]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Support</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-2 md:items-end">
        <div className="w-full md:w-48">
          <label
            htmlFor="filter-status"
            className="block text-xs text-zinc-500 mb-1"
          >
            Status
          </label>
          <select
            id="filter-status"
            className="w-full border rounded-md px-3 py-2 card-bg"
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: e.target.value as FilterState["status"],
              }))
            }
          >
            {(["all", "open", "in_progress", "resolved"] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full md:w-48">
          <label
            htmlFor="filter-priority"
            className="block text-xs text-zinc-500 mb-1"
          >
            Priority
          </label>
          <select
            id="filter-priority"
            className="w-full border rounded-md px-3 py-2 card-bg"
            value={filters.priority}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                priority: e.target.value as FilterState["priority"],
              }))
            }
          >
            {(["all", "low", "normal", "high", "urgent"] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full md:w-64">
          <label
            htmlFor="filter-assignee"
            className="block text-xs text-zinc-500 mb-1"
          >
            Assignee
          </label>
          <select
            id="filter-assignee"
            className="w-full border rounded-md px-3 py-2 card-bg"
            value={filters.assignee}
            onChange={(e) =>
              setFilters((f) => ({ ...f, assignee: e.target.value }))
            }
          >
            <option value="all">all</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg card-bg shadow-elev-1">
        <table className="min-w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500" colSpan={6}>
                  No tickets.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-zinc-100 dark:border-zinc-700"
                >
                  <td className="px-3 py-2">
                    <Link
                      to={`/support/${t.id}`}
                      className="text-blue-600 dark:text-blue-400 underline"
                    >
                      {t.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 max-w-[380px]">
                    <div
                      className="truncate"
                      title={t.subject || "Support ticket"}
                    >
                      {t.subject || "Support ticket"}
                    </div>
                  </td>
                  <td className="px-3 py-2 max-w-[320px]">
                    <div
                      className="truncate"
                      title={
                        t.clientName ||
                        clientNames[t.clientId || ""] ||
                        (t.clientId
                          ? `Client ${t.clientId.slice(0, 8)}...`
                          : "Unknown Client")
                      }
                    >
                      {t.clientName ||
                        clientNames[t.clientId || ""] ||
                        (t.clientId
                          ? `Client ${t.clientId.slice(0, 8)}...`
                          : "Unknown Client")}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                      {t.status || "open"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                      {t.priority || "normal"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {assigneeNames[t.assigneeId || ""] || "—"}
                  </td>
                  <td className="px-3 py-2">{formatDateTime(t.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
