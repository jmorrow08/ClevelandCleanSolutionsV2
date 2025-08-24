import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";
import { useAuth } from "../../context/AuthContext";
import { useNewClientModal } from "./NewClientModal";
import { useNewLocationModal } from "./NewLocationModal";
import { Link } from "react-router-dom";

export default function LeadsPage() {
  const { claims } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ name: string; source: string }>({
    name: "",
    source: "",
  });
  const { show } = useToast();
  const { open: openNewClient } = useNewClientModal();
  const { open: openNewLocation } = useNewLocationModal();

  useEffect(() => {
    const canRead = !!(
      claims?.admin ||
      claims?.owner ||
      claims?.marketing ||
      claims?.super_admin
    );
    if (!canRead) {
      setLoading(false);
      setLeads([]);
      return;
    }
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setLeads(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [claims]);

  async function createLead() {
    const name = form.name.trim();
    const source = form.source.trim();
    if (!name) {
      show({ type: "error", message: "Name is required" });
      return;
    }
    try {
      setCreating(true);
      const db = getFirestore();
      const optimistic = {
        id: `tmp-${Math.random().toString(36).slice(2)}`,
        name,
        source,
        createdAt: new Date(),
        stage: "New",
      } as any;
      setLeads((prev) => [optimistic, ...prev]);
      const ref = await addDoc(collection(db, "leads"), {
        name,
        source,
        stage: "New",
        createdAt: serverTimestamp(),
      });
      setLeads((prev) => [
        { ...optimistic, id: ref.id },
        ...prev.filter((x) => x.id !== optimistic.id),
      ]);
      setShowNew(false);
      setForm({ name: "", source: "" });
      show({ type: "success", message: "Lead created." });
    } catch (e: any) {
      setLeads((prev) => prev.filter((x) => !x.id.startsWith("tmp-")));
      show({ type: "error", message: e?.message || "Failed to create lead" });
    } finally {
      setCreating(false);
    }
  }

  async function changeStage(id: string, next: string) {
    try {
      const db = getFirestore();
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, stage: next } : l))
      );
      await updateDoc(doc(db, "leads", id), { stage: next });
      show({ type: "success", message: "Stage updated." });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to update stage" });
    }
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">CRM - Leads</h1>
      {!(
        claims?.admin ||
        claims?.owner ||
        claims?.marketing ||
        claims?.super_admin
      ) && <div className="text-sm text-zinc-500">You do not have access.</div>}
      <div className="text-sm">
        <Link
          to="/crm/clients"
          className="underline text-blue-600 dark:text-blue-400"
        >
          View Clients
        </Link>
      </div>
      <RoleGuard allow={["admin", "owner", "marketing", "super_admin"]}>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
            onClick={() => setShowNew(true)}
          >
            New Lead
          </button>
          <button
            className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
            onClick={openNewClient}
          >
            New Client
          </button>
          <button
            className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
            onClick={openNewLocation}
          >
            New Location
          </button>
        </div>
      </RoleGuard>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : leads.length === 0 ? (
        <div className="text-sm text-zinc-500">No leads.</div>
      ) : (
        <ul className="text-sm">
          {leads.slice(0, 50).map((l) => (
            <li
              key={l.id}
              className="py-2 border-b border-zinc-100 dark:border-zinc-700 flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{l.name || l.id}</div>
                <div className="text-xs text-zinc-500 truncate">
                  {l.source || "—"}
                </div>
              </div>
              <div className="shrink-0">
                <select
                  className="border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-xs"
                  value={l.stage || "New"}
                  onChange={(e) => changeStage(l.id, e.target.value)}
                >
                  {["New", "Qualified", "Proposal", "Won", "Lost"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !creating && setShowNew(false)}
          />
          <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
            <div className="text-lg font-medium">New Lead</div>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm mb-1">Name</label>
                <input
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Source</label>
                <input
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={form.source}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, source: e.target.value }))
                  }
                  placeholder="Website, Referral, Ad…"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                onClick={() => setShowNew(false)}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-white ${
                  creating ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
                }`}
                onClick={createLead}
                disabled={creating}
              >
                {creating ? "Saving…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
