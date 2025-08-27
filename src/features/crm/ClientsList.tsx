import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { Link } from "react-router-dom";
import { RoleGuard } from "../../context/RoleGuard";

type Client = {
  id: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  status?: boolean;
};

export default function ClientsList() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const qref = query(
          collection(db, "clientMasterList"),
          orderBy("companyName")
        );
        try {
          const snap = await getDocs(qref);
          const list: Client[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setClients(list);
        } catch (_) {
          // Fallback: fetch without orderBy in case of missing index
          const snap = await getDocs(collection(db, "clientMasterList"));
          const list: Client[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setClients(list);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return clients;
    const s = search.toLowerCase();
    return clients.filter((c) =>
      [c.companyName, c.contactName, c.email, c.phone, c.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    );
  }, [clients, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CRM - Clients</h1>
        <RoleGuard allow={["admin", "owner", "super_admin"]}>
          <Link
            to="/crm"
            className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-800 text-sm"
          >
            Leads
          </Link>
        </RoleGuard>
      </div>

      <div className="flex flex-col md:flex-row gap-2 md:items-end">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Search</label>
          <input
            placeholder="Company, contact, email, phone"
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="hidden md:block overflow-x-auto rounded-lg bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1">
        <table className="min-w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
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
                  No clients found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-zinc-100 dark:border-zinc-700"
                >
                  <td className="px-3 py-2 max-w-[320px]">
                    <div className="truncate" title={c.companyName || c.id}>
                      {c.companyName || c.id}
                    </div>
                  </td>
                  <td className="px-3 py-2">{c.contactName || "—"}</td>
                  <td className="px-3 py-2">{c.email || "—"}</td>
                  <td className="px-3 py-2">{c.phone || "—"}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                      {c.status === true
                        ? "Active"
                        : c.status === false
                        ? "Inactive"
                        : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to={`/crm/clients/${c.id}`}
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
            No clients found.
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className="rounded-lg p-3 bg-[var(--card)] dark:bg-zinc-800 shadow-elev-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className="font-medium min-w-0 flex-1 truncate"
                  title={c.companyName || c.id}
                >
                  {c.companyName || c.id}
                </div>
                <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-700">
                  {c.status === true
                    ? "Active"
                    : c.status === false
                    ? "Inactive"
                    : "—"}
                </span>
              </div>
              <div className="text-xs text-zinc-500 mt-1 truncate">
                {c.contactName || "—"}
              </div>
              <div className="text-xs text-zinc-500 truncate">
                {c.email || "—"}
              </div>
              <div className="text-xs text-zinc-500 truncate">
                {c.phone || "—"}
              </div>
              <div className="mt-2 text-right">
                <Link
                  to={`/crm/clients/${c.id}`}
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
