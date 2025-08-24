import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";

// Types
export type SocialProvider = "facebook" | "instagram" | "tiktok" | "linkedin";

type SocialConnector = {
  id: string;
  provider: SocialProvider;
  pageId?: string;
  status: "connected" | "disconnected" | "pending";
  createdAt?: any;
};

type SocialOutbox = {
  id: string;
  provider: SocialProvider;
  caption: string;
  mediaAssetId?: string | null;
  scheduledAt?: Date | null;
  status: "pending" | "sent" | "failed";
  resultIds?: string[];
  createdAt?: any;
  createdBy?: string | null;
};

export default function Social() {
  const [tab, setTab] = useState<"connectors" | "composer" | "scheduled">(
    "connectors"
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Social</h1>
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <button
          className={`px-3 py-2 text-sm -mb-px border-b-2 ${
            tab === "connectors"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-600 dark:text-zinc-300"
          }`}
          onClick={() => setTab("connectors")}
        >
          Connectors
        </button>
        <button
          className={`px-3 py-2 text-sm -mb-px border-b-2 ${
            tab === "composer"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-600 dark:text-zinc-300"
          }`}
          onClick={() => setTab("composer")}
        >
          Composer
        </button>
        <button
          className={`px-3 py-2 text-sm -mb-px border-b-2 ${
            tab === "scheduled"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-600 dark:text-zinc-300"
          }`}
          onClick={() => setTab("scheduled")}
        >
          Scheduled
        </button>
      </div>
      {tab === "connectors" && <ConnectorsTab />}
      {tab === "composer" && <ComposerTab />}
      {tab === "scheduled" && <ScheduledTab />}
    </div>
  );
}

function ConnectorsTab() {
  const [connectors, setConnectors] = useState<SocialConnector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const q = query(
          collection(db, "socialConnectors"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const list: SocialConnector[] = [] as any;
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setConnectors(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-3">
      <div className="text-sm text-zinc-600 dark:text-zinc-300">
        Connect your social pages via Settings when ready. Tokens will be stored
        securely (Secret Manager). For now, this is metadata only.
      </div>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {connectors.length === 0 ? (
            <li className="rounded-md p-3 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
              No connectors yet. Example providers: Facebook, Instagram, TikTok,
              LinkedIn.
            </li>
          ) : (
            connectors.map((c) => (
              <li
                key={c.id}
                className="rounded-md p-3 bg-white dark:bg-zinc-800 shadow-elev-1"
              >
                <div className="text-sm font-medium capitalize">
                  {c.provider}
                </div>
                <div className="text-xs text-zinc-500">
                  {c.pageId || "no pageId"}
                </div>
                <div className="mt-2 text-xs">
                  Status: <span className="font-medium">{c.status}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
      <div className="text-xs text-zinc-500">
        Owners can add connectors in Settings → Social when enabled.
      </div>
    </div>
  );
}

function ProviderCheckbox({
  value,
  checked,
  onChange,
}: {
  value: SocialProvider;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 mr-3 text-sm">
      <input
        type="checkbox"
        className="rounded"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="capitalize">{value}</span>
    </label>
  );
}

function ComposerTab() {
  const { show } = useToast();
  const [caption, setCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [mediaAssetId, setMediaAssetId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const [providersState, setProvidersState] = useState<
    Record<SocialProvider, boolean>
  >({
    facebook: false,
    instagram: false,
    tiktok: false,
    linkedin: false,
  });

  const selectedProviders = useMemo(
    () =>
      (Object.keys(providersState) as SocialProvider[]).filter(
        (p) => providersState[p]
      ),
    [providersState]
  );

  async function handleSubmit() {
    if (selectedProviders.length === 0) {
      show({ type: "error", message: "Choose at least one provider." });
      return;
    }
    if (!caption.trim() && !mediaAssetId) {
      show({ type: "error", message: "Add a caption or select media." });
      return;
    }
    try {
      setSubmitting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const auth = getAuth();
      const createdBy = auth.currentUser?.uid || null;
      const when = scheduledAt ? new Date(scheduledAt) : null;

      for (const provider of selectedProviders) {
        await addDoc(collection(db, "socialOutbox"), {
          provider,
          caption: caption || "",
          mediaAssetId: mediaAssetId || null,
          scheduledAt: when,
          status: "pending",
          resultIds: [],
          createdAt: serverTimestamp(),
          createdBy,
        });
      }
      setCaption("");
      setMediaAssetId("");
      setScheduledAt("");
      setProvidersState({
        facebook: false,
        instagram: false,
        tiktok: false,
        linkedin: false,
      });
      show({ type: "success", message: "Queued for sending." });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to queue" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <RoleGuard allow={["owner", "super_admin", "admin", "marketing"]}>
        <div className="rounded-md p-3 bg-white dark:bg-zinc-800 shadow-elev-1 space-y-3">
          <div className="text-sm font-medium">Choose providers</div>
          <div>
            {(Object.keys(providersState) as SocialProvider[]).map((p) => (
              <ProviderCheckbox
                key={p}
                value={p}
                checked={!!providersState[p]}
                onChange={(next) =>
                  setProvidersState((prev) => ({ ...prev, [p]: next }))
                }
              />
            ))}
          </div>
          <div className="text-sm font-medium">Media</div>
          <div className="text-xs text-zinc-500">
            Enter a media asset ID from Media Library for now.
          </div>
          <input
            value={mediaAssetId}
            onChange={(e) => setMediaAssetId(e.target.value)}
            placeholder="mediaAssetId (optional)"
            className="w-full px-3 py-2 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm"
          />
          <div className="text-sm font-medium">Caption</div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write your caption…"
            className="w-full min-h-[100px] px-3 py-2 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm"
          />
          <div className="text-sm font-medium">Schedule</div>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="px-3 py-2 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm"
          />
          <div className="pt-2">
            <button
              className={`px-3 py-1.5 rounded-md text-white ${
                submitting ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
              }`}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Queuing…" : "Queue Post"}
            </button>
          </div>
        </div>
      </RoleGuard>
      <div className="text-xs text-zinc-500">
        Employees have read-only access; only
        owners/super_admins/admin/marketing can queue.
      </div>
    </div>
  );
}

function ScheduledTab() {
  const [items, setItems] = useState<SocialOutbox[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const q = query(
          collection(db, "socialOutbox"),
          orderBy("status", "asc"),
          orderBy("scheduledAt", "asc")
        );
        const snap = await getDocs(q);
        const list: SocialOutbox[] = [] as any;
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setItems(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-zinc-500">No scheduled or sent posts.</div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {items.map((i) => (
            <li
              key={i.id}
              className="rounded-md p-3 bg-white dark:bg-zinc-800 shadow-elev-1"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium capitalize">
                  {i.provider}
                </div>
                <div
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    i.status === "pending"
                      ? "border-amber-300 text-amber-700 dark:border-amber-500 dark:text-amber-300"
                      : i.status === "sent"
                      ? "border-green-300 text-green-700 dark:border-green-500 dark:text-green-300"
                      : "border-red-300 text-red-700 dark:border-red-500 dark:text-red-300"
                  }`}
                >
                  {i.status}
                </div>
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {i.scheduledAt?.toDate
                  ? i.scheduledAt.toDate().toLocaleString()
                  : String(i.scheduledAt || "unscheduled")}
              </div>
              {i.mediaAssetId && (
                <div className="text-xs mt-2">media: {i.mediaAssetId}</div>
              )}
              {i.caption && (
                <div className="text-sm mt-2 whitespace-pre-wrap">
                  {i.caption}
                </div>
              )}
              {i.resultIds && i.resultIds.length > 0 && (
                <div className="text-xs text-zinc-500 mt-2">
                  results: {i.resultIds.join(", ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
