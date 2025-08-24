import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";

type Props = {
  onClose: () => void;
  onCreated?: (mod: any) => void;
};

export default function TrainingModuleModal({ onClose, onCreated }: Props) {
  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<"employees" | "clients">(
    "employees"
  );
  const [passScore, setPassScore] = useState<string>("");
  const [assets, setAssets] = useState<{ id: string; filename?: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    async function loadAssets() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const q = query(
          collection(db, "mediaAssets"),
          where("category", "==", "training"),
          orderBy("uploadedAt", "desc")
        );
        const snap = await getDocs(q);
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setAssets(list);
      } catch {}
    }
    loadAssets();
  }, []);

  async function handleCreate() {
    const t = title.trim();
    if (!t) {
      show({ type: "error", message: "Title is required" });
      return;
    }
    if (selected.length === 0) {
      show({ type: "error", message: "Select at least one asset" });
      return;
    }
    try {
      setSubmitting(true);
      const db = getFirestore();
      const payload = {
        title: t,
        description: description.trim() || "",
        audience,
        assetIds: selected,
        passScore: passScore ? Number(passScore) : null,
        createdAt: serverTimestamp(),
        createdBy: null,
      };
      const ref = await addDoc(collection(db, "trainingModules"), payload);
      onCreated?.({ id: ref.id, ...(payload as any) });
      show({ type: "success", message: "Module created" });
      onClose();
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to create" });
    } finally {
      setSubmitting(false);
    }
  }

  function toggleAsset(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative w-full max-w-2xl rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
        <div className="text-lg font-medium">New Training Module</div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Title</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Description</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Audience</label>
            <select
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={audience}
              onChange={(e) => setAudience(e.target.value as any)}
            >
              <option value="employees">Employees</option>
              <option value="clients">Clients</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Pass score (optional)</label>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={passScore}
              onChange={(e) => setPassScore(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm font-medium">Select training assets</div>
            <div className="max-h-64 overflow-auto border rounded-md mt-1">
              <table className="w-full text-sm">
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id} className="border-b">
                      <td className="p-2 w-8">
                        <input
                          type="checkbox"
                          checked={selected.includes(a.id)}
                          onChange={() => toggleAsset(a.id)}
                        />
                      </td>
                      <td className="p-2">{a.filename || a.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-white ${
              submitting ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={handleCreate}
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}



