import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";
import { useToast } from "../../context/ToastContext";
import TrainingModuleModal from "./TrainingModuleModal";
import AssignmentModal from "./AssignmentModal";

type Module = {
  id: string;
  title: string;
  description?: string;
  audience: "employees" | "clients";
  assetIds: string[];
  passScore?: number | null;
  createdAt?: any;
  createdBy?: string | null;
};

export default function TrainingAdmin() {
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<Module[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [assignFor, setAssignFor] = useState<Module | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const q = query(
          collection(db, "trainingModules"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const list: Module[] = [] as any;
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setModules(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Training Admin</h1>
        <RoleGuard allow={["owner", "super_admin", "admin"]}>
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
            onClick={() => setShowNew(true)}
          >
            New Module
          </button>
        </RoleGuard>
      </div>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : modules.length === 0 ? (
        <div className="text-sm text-zinc-500">No modules yet.</div>
      ) : (
        <table className="w-full text-sm border rounded-md overflow-hidden">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="text-left p-2">Title</th>
              <th className="text-left p-2">Audience</th>
              <th className="text-left p-2">Assets</th>
              <th className="text-left p-2">Pass</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-2">{m.title || m.id}</td>
                <td className="p-2 capitalize">{m.audience}</td>
                <td className="p-2">{m.assetIds?.length || 0}</td>
                <td className="p-2">{m.passScore ?? "—"}</td>
                <td className="p-2 space-x-2">
                  <RoleGuard allow={["owner", "super_admin", "admin"]}>
                    <button
                      className="px-2 py-1 rounded-md border text-xs"
                      onClick={() => setAssignFor(m)}
                    >
                      Assign
                    </button>
                  </RoleGuard>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showNew && (
        <TrainingModuleModal
          onClose={() => setShowNew(false)}
          onCreated={(mod) => setModules((prev) => [mod as any, ...prev])}
        />
      )}
      {assignFor && (
        <AssignmentModal
          moduleId={assignFor.id}
          onClose={() => setAssignFor(null)}
        />
      )}
    </div>
  );
}
