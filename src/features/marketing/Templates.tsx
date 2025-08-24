import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

type Template = {
  id: string;
  name: string;
  subject: string;
  html: string;
  updatedAt?: any;
  createdAt?: any;
};

export default function Templates() {
  const { claims } = useAuth();
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [form, setForm] = useState<Omit<Template, "id">>({
    name: "",
    subject: "",
    html: "",
  });
  const [showPreview, setShowPreview] = useState(false);

  const canEdit = useMemo(
    () => !!(claims?.owner || claims?.super_admin),
    [claims]
  );

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const q = query(
          collection(db, "templates"),
          orderBy("updatedAt", "desc")
        );
        const snap = await getDocs(q);
        const list: Template[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setTemplates(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!selected) setForm({ name: "", subject: "", html: "" });
    else
      setForm({
        name: selected.name || "",
        subject: selected.subject || "",
        html: selected.html || "",
      });
  }, [selected]);

  async function saveNew() {
    if (!canEdit) return;
    if (!form.name.trim()) {
      show({ type: "error", message: "Name is required" });
      return;
    }
    try {
      setSaving(true);
      const db = getFirestore();
      const ref = await addDoc(collection(db, "templates"), {
        name: form.name.trim(),
        subject: form.subject || "",
        html: form.html || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTemplates((prev) => [
        {
          id: ref.id,
          name: form.name.trim(),
          subject: form.subject || "",
          html: form.html || "",
        },
        ...prev,
      ]);
      setSelected({ id: ref.id, ...form });
      show({ type: "success", message: "Template created" });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  async function updateExisting() {
    if (!canEdit || !selected) return;
    try {
      setSaving(true);
      const db = getFirestore();
      await updateDoc(doc(db, "templates", selected.id), {
        name: form.name.trim(),
        subject: form.subject || "",
        html: form.html || "",
        updatedAt: serverTimestamp(),
      });
      setTemplates((prev) =>
        prev.map((t) => (t.id === selected.id ? { ...t, ...form } : t))
      );
      show({ type: "success", message: "Template updated" });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to update" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!canEdit) return;
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, "templates", id));
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (selected?.id === id) setSelected(null);
      show({ type: "success", message: "Template deleted" });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to delete" });
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-1 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium">Templates</div>
          <RoleGuard allow={["owner", "super_admin"]}>
            <button
              className="px-2 py-1 rounded-md text-sm bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setSelected(null)}
            >
              New
            </button>
          </RoleGuard>
        </div>
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-zinc-500">No templates.</div>
        ) : (
          <ul className="text-sm border rounded-md divide-y">
            {templates.map((t) => (
              <li
                key={t.id}
                className={`p-2 flex items-center justify-between cursor-pointer ${
                  selected?.id === t.id ? "bg-zinc-100 dark:bg-zinc-800" : ""
                }`}
                onClick={() => setSelected(t)}
              >
                <div className="truncate">{t.name || t.id}</div>
                {canEdit && (
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(t.id);
                    }}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="md:col-span-2">
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Name</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Subject</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={form.subject}
              onChange={(e) =>
                setForm((f) => ({ ...f, subject: e.target.value }))
              }
              disabled={!canEdit}
              placeholder="e.g. We'd love your feedback"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">HTML</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800 font-mono text-xs"
              rows={16}
              value={form.html}
              onChange={(e) => setForm((f) => ({ ...f, html: e.target.value }))}
              disabled={!canEdit}
              placeholder="<h1>Hello</h1><p>…</p>"
            />
          </div>
          <RoleGuard allow={["owner", "super_admin"]}>
            <div className="flex items-center gap-2">
              {selected ? (
                <button
                  className={`px-3 py-1.5 rounded-md text-white ${
                    saving ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                  onClick={updateExisting}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              ) : (
                <button
                  className={`px-3 py-1.5 rounded-md text-white ${
                    saving ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                  onClick={saveNew}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Create Template"}
                </button>
              )}
              <button
                className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                onClick={() => setShowPreview(true)}
              >
                Preview
              </button>
            </div>
          </RoleGuard>
          {!canEdit && (
            <div className="text-xs text-zinc-500">
              Read-only for employees.
            </div>
          )}
        </div>
      </div>
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowPreview(false)}
          />
          <div className="relative w-full max-w-3xl h-[80vh] rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4 overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-medium">
                Preview: {form.name || selected?.name || "Untitled"}
              </div>
              <button
                className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                onClick={() => setShowPreview(false)}
              >
                Close
              </button>
            </div>
            <div className="text-sm text-zinc-500 mb-2">
              Subject: {form.subject || selected?.subject || "(none)"}
            </div>
            <div className="border rounded-md p-3 bg-white dark:bg-zinc-800">
              <iframe
                title="template-preview"
                className="w-full h-[60vh] bg-white"
                sandbox="allow-same-origin"
                srcDoc={form.html || selected?.html || "<div/>"}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
