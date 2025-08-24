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
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import AudienceBuilder, { type AudienceQuery } from "./AudienceBuilder";
import { RoleGuard } from "../../context/RoleGuard";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

type Campaign = {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "sending" | "complete";
  schedule?: {
    type: "one_shot" | "drip";
    runAt?: any; // Timestamp or ISO string for draft
    dripHours?: number | null;
  } | null;
  audienceQuery?: AudienceQuery | null;
  templateId?: string | null;
  metrics?: {
    sent?: number;
    delivered?: number;
    opened?: number;
    clicked?: number;
  };
  createdAt?: any;
  updatedAt?: any;
};

type Template = { id: string; name: string };

function ensureApp() {
  if (!getApps().length) initializeApp(firebaseConfig);
}

export default function Campaigns() {
  const { claims } = useAuth();
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const canEdit = useMemo(
    () => !!(claims?.owner || claims?.super_admin),
    [claims]
  );

  const [form, setForm] = useState<{
    name: string;
    templateId: string;
    scheduleType: "one_shot" | "drip";
    runAt: string; // ISO datetime-local
    dripHours: number | "";
    audience: AudienceQuery;
  }>({
    name: "",
    templateId: "",
    scheduleType: "one_shot",
    runAt: "",
    dripHours: "",
    audience: {},
  });

  useEffect(() => {
    async function load() {
      try {
        ensureApp();
        const db = getFirestore();
        const q = query(
          collection(db, "campaigns"),
          orderBy("updatedAt", "desc")
        );
        const snap = await getDocs(q);
        const list: Campaign[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setCampaigns(list);

        const tSnap = await getDocs(
          query(collection(db, "templates"), orderBy("updatedAt", "desc"))
        );
        const tList: Template[] = [];
        tSnap.forEach((d) => {
          const data = d.data() as any;
          tList.push({ id: d.id, name: data.name || d.id });
        });
        setTemplates(tList);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function rate(n?: number, d?: number): string {
    const num = Number(n || 0);
    const den = Number(d || 0);
    if (!den) return "0%";
    return `${Math.round((num / den) * 100)}%`;
  }

  async function saveDraft() {
    if (!canEdit) return;
    if (!form.name.trim()) {
      show({ type: "error", message: "Name is required" });
      return;
    }
    if (!form.templateId) {
      show({ type: "error", message: "Select a template" });
      return;
    }
    try {
      setSaving(true);
      const db = getFirestore();
      const schedule =
        form.scheduleType === "one_shot"
          ? { type: "one_shot", runAt: form.runAt || null }
          : {
              type: "drip",
              dripHours: form.dripHours ? Number(form.dripHours) : null,
            };
      const payload = {
        name: form.name.trim(),
        status: "draft",
        schedule,
        templateId: form.templateId,
        audienceQuery: form.audience || {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "campaigns"), payload);
      setCampaigns((prev) => [{ id: ref.id, ...(payload as any) }, ...prev]);
      setShowNew(false);
      setForm({
        name: "",
        templateId: "",
        scheduleType: "one_shot",
        runAt: "",
        dripHours: "",
        audience: {},
      });
      show({ type: "success", message: "Campaign saved as draft" });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  async function scheduleCampaign(id: string) {
    if (!canEdit) return;
    try {
      const db = getFirestore();
      await updateDoc(doc(db, "campaigns", id), {
        status: "scheduled",
        updatedAt: serverTimestamp(),
      });
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "scheduled" } : c))
      );
      show({ type: "success", message: "Campaign scheduled" });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to schedule" });
    }
  }

  async function sendTest(campaign: Campaign) {
    if (!canEdit) return;
    const email = testEmail.trim();
    if (!email) {
      show({ type: "error", message: "Enter a test email" });
      return;
    }
    try {
      const db = getFirestore();
      await addDoc(collection(db, "notifications"), {
        type: "email_test",
        toEmail: email,
        templateId: campaign.templateId || null,
        campaignId: campaign.id,
        payload: {
          // No external call yet; functions stub will render
          meta: "send-test",
        },
        channel: "email",
        provider: "sendgrid",
        status: "queued",
        createdAt: serverTimestamp(),
      });
      show({ type: "success", message: "Enqueued test email" });
      setTestEmail("");
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to enqueue" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">Campaigns</h2>
        <RoleGuard allow={["owner", "super_admin"]}>
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
            onClick={() => setShowNew(true)}
          >
            New Campaign
          </button>
        </RoleGuard>
      </div>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : campaigns.length === 0 ? (
        <div className="text-sm text-zinc-500">No campaigns.</div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              className="border rounded-md px-2 py-1 text-sm bg-white dark:bg-zinc-900"
              placeholder="Test email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <div className="text-xs text-zinc-500">Use Send Test per row.</div>
          </div>
          <table className="w-full text-sm border rounded-md overflow-hidden">
            <thead className="bg-zinc-50 dark:bg-zinc-800">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Sent</th>
                <th className="text-left p-2">Open</th>
                <th className="text-left p-2">Click</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.slice(0, 50).map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-2 truncate">{c.name || c.id}</td>
                  <td className="p-2">{c.status || "draft"}</td>
                  <td className="p-2">{c.metrics?.sent || 0}</td>
                  <td className="p-2">
                    {rate(c.metrics?.opened, c.metrics?.delivered)}
                  </td>
                  <td className="p-2">
                    {rate(c.metrics?.clicked, c.metrics?.delivered)}
                  </td>
                  <td className="p-2 space-x-2">
                    <RoleGuard allow={["owner", "super_admin"]}>
                      <button
                        className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                        onClick={() => sendTest(c)}
                      >
                        Send Test
                      </button>
                      {c.status === "draft" && (
                        <button
                          className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          onClick={() => scheduleCampaign(c.id)}
                        >
                          Schedule
                        </button>
                      )}
                    </RoleGuard>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !saving && setShowNew(false)}
          />
          <div className="relative w-full max-w-2xl rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
            <div className="text-lg font-medium">Create Campaign</div>
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
                <label className="block text-sm mb-1">Template</label>
                <select
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={form.templateId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, templateId: e.target.value }))
                  }
                >
                  <option value="">Select template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm mb-1">Schedule</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                    value={form.scheduleType}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        scheduleType: e.target.value as any,
                      }))
                    }
                  >
                    <option value="one_shot">One-shot</option>
                    <option value="drip">Drip</option>
                  </select>
                </div>
                {form.scheduleType === "one_shot" ? (
                  <div className="md:col-span-2">
                    <label className="block text-sm mb-1">Run at</label>
                    <input
                      type="datetime-local"
                      className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                      value={form.runAt}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, runAt: e.target.value }))
                      }
                    />
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <label className="block text-sm mb-1">
                      Drip every (hours)
                    </label>
                    <input
                      type="number"
                      min={1}
                      className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                      value={form.dripHours}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dripHours: e.target.value as any,
                        }))
                      }
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm mb-2">Audience</label>
                <AudienceBuilder
                  value={form.audience}
                  onChange={(v) => setForm((f) => ({ ...f, audience: v }))}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                onClick={() => setShowNew(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-white ${
                  saving ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
                }`}
                onClick={saveDraft}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save Draft"}
              </button>
            </div>
          </div>
        </div>
      )}
      {!canEdit && (
        <div className="text-xs text-zinc-500">Read-only for employees.</div>
      )}
    </div>
  );
}
