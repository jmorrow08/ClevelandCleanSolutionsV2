import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";

type Audience = "internal" | "employees" | "clients" | "public";
type Category = "hr" | "training" | "client_resource" | "marketing" | "org";

type Asset = {
  id: string;
  filename?: string;
  path?: string;
  type?: string;
  tags?: string[];
  category?: Category;
  audience?: Audience;
  relatedEntities?: {
    employeeIds?: string[];
    clientIds?: string[];
    locationIds?: string[];
  };
  requiresAck?: boolean;
  version?: number;
  durationSec?: number | null;
  transcoded?: boolean;
  checksum?: string | null;
  uploadedAt?: any;
  uploadedBy?: string | null;
};

function ensureApp() {
  if (!getApps().length) initializeApp(firebaseConfig);
}

export default function AssetDetail() {
  const { assetId } = useParams();
  const { show } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [url, setUrl] = useState<string>("");

  // editable fields
  const [category, setCategory] = useState<Category>("org");
  const [audience, setAudience] = useState<Audience>("internal");
  const [tagsCsv, setTagsCsv] = useState<string>("");
  const [requiresAck, setRequiresAck] = useState<boolean>(false);
  const [version, setVersion] = useState<string>("1");
  const [durationSec, setDurationSec] = useState<string>("");
  const [clientIds, setClientIds] = useState<string>("");
  const [locationIds, setLocationIds] = useState<string>("");
  const [employeeIds, setEmployeeIds] = useState<string>("");

  // where used
  const [socialCount, setSocialCount] = useState<number>(0);
  const [trainingModuleCount, setTrainingModuleCount] = useState<number>(0);
  const [clientDocsCount, setClientDocsCount] = useState<number>(0);

  const filename = asset?.filename || asset?.id || "Asset";
  const uploadedAtStr = useMemo(() => {
    const v: any = asset?.uploadedAt;
    const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
    return d ? d.toLocaleString() : "";
  }, [asset?.uploadedAt]);

  useEffect(() => {
    async function load() {
      if (!assetId) return;
      try {
        setLoading(true);
        ensureApp();
        const db = getFirestore();
        const storage = getStorage();
        const refDoc = doc(db, "mediaAssets", assetId);
        const snap = await getDoc(refDoc);
        if (!snap.exists()) {
          show({ type: "error", message: "Asset not found" });
          setAsset(null);
          return;
        }
        const data = { id: snap.id, ...(snap.data() as any) } as Asset;
        setAsset(data);
        setCategory((data.category as Category) || "org");
        setAudience((data.audience as Audience) || "internal");
        setTagsCsv(Array.isArray(data.tags) ? data.tags.join(", ") : "");
        setRequiresAck(!!data.requiresAck);
        setVersion(String(data.version || 1));
        setDurationSec(
          typeof data.durationSec === "number" ? String(data.durationSec) : ""
        );
        setClientIds((data.relatedEntities?.clientIds || []).join(", "));
        setLocationIds((data.relatedEntities?.locationIds || []).join(", "));
        setEmployeeIds((data.relatedEntities?.employeeIds || []).join(", "));

        if (data.path) {
          try {
            const u = await getDownloadURL(ref(storage, data.path));
            setUrl(u);
          } catch {
            setUrl("");
          }
        } else {
          setUrl("");
        }

        // Where used queries
        try {
          const socialQ = query(
            collection(db, "socialOutbox"),
            where("mediaAssetId", "==", assetId)
          );
          const sSnap = await getDocs(socialQ);
          setSocialCount(sSnap.size);
        } catch {}

        try {
          const tmQ = query(
            collection(db, "trainingModules"),
            where("assetIds", "array-contains", assetId)
          );
          const tSnap = await getDocs(tmQ);
          setTrainingModuleCount(tSnap.size);
        } catch {}

        try {
          const cdQ = query(
            collection(db, "clientDocs"),
            where("assetId", "==", assetId)
          );
          const cSnap = await getDocs(cdQ);
          setClientDocsCount(cSnap.size);
        } catch {}
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [assetId, show]);

  const canPreviewImage = (asset?.type || "").startsWith("image/");
  const canPreviewVideo = (asset?.type || "").startsWith("video/");
  const isPdf = (asset?.type || "").includes("pdf");

  const canCopyPublicLink = audience === "public" && !!url;

  async function handleSave() {
    if (!assetId) return;
    try {
      setSaving(true);
      ensureApp();
      const db = getFirestore();
      const refDoc = doc(db, "mediaAssets", assetId);
      const related: any = {};
      const c = clientIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const l = locationIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const e = employeeIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (c.length) related.clientIds = c;
      if (l.length) related.locationIds = l;
      if (e.length) related.employeeIds = e;

      const next = {
        category,
        audience,
        tags: tagsCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        relatedEntities: related,
        requiresAck: !!requiresAck,
        version: Number(version) || 1,
        durationSec: durationSec ? Number(durationSec) : null,
      } as any;
      await updateDoc(refDoc, next);
      show({ type: "success", message: "Saved" });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  function copyLink() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    show({ type: "success", message: "Link copied" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{filename}</h1>
        <div className="text-sm text-zinc-500">{uploadedAtStr}</div>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : !asset ? (
        <div className="text-sm text-red-600">Not found</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md p-3 card-bg shadow-elev-1 space-y-3">
              <div className="text-sm font-medium">Preview</div>
              <div className="border rounded-md overflow-hidden">
                {canPreviewImage && url ? (
                  <img src={url} alt={filename} className="max-w-full" />
                ) : canPreviewVideo && url ? (
                  <video src={url} controls className="w-full" />
                ) : isPdf && url ? (
                  <iframe title="preview" src={url} className="w-full h-96" />
                ) : url ? (
                  <div className="p-3 text-sm">
                    <a
                      className="text-blue-600 dark:text-blue-400 underline"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                  </div>
                ) : (
                  <div className="p-3 text-sm text-zinc-500">No preview</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`px-3 py-1.5 rounded-md text-white ${
                    canCopyPublicLink
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-zinc-400"
                  }`}
                  onClick={copyLink}
                  disabled={!canCopyPublicLink}
                >
                  Copy link
                </button>
                <div className="text-xs text-zinc-500">
                  {audience === "public"
                    ? "Public link available"
                    : "Set audience to Public to share"}
                </div>
              </div>
            </div>

            <div className="rounded-md p-3 card-bg shadow-elev-1 space-y-3">
              <div className="text-sm font-medium">Metadata</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Category</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 card-bg"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                  >
                    <option value="org">Org</option>
                    <option value="hr">HR</option>
                    <option value="training">Training</option>
                    <option value="client_resource">Client Resource</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Audience</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 card-bg"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as Audience)}
                  >
                    <option value="internal">Internal</option>
                    <option value="employees">Employees</option>
                    <option value="clients">Clients</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm mb-1">Tags</label>
                  <input
                    className="w-full border rounded-md px-3 py-2 card-bg"
                    value={tagsCsv}
                    onChange={(e) => setTagsCsv(e.target.value)}
                    placeholder="policy, safety, onboarding"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Version</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full border rounded-md px-3 py-2 card-bg"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Duration (sec)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full border rounded-md px-3 py-2 card-bg"
                    value={durationSec}
                    onChange={(e) => setDurationSec(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="requires-ack"
                    type="checkbox"
                    checked={requiresAck}
                    onChange={(e) => setRequiresAck(e.target.checked)}
                  />
                  <label htmlFor="requires-ack" className="text-sm">
                    Requires acknowledgement
                  </label>
                </div>
                <div className="md:col-span-2 text-xs text-zinc-500">
                  <div>Uploaded by: {asset?.uploadedBy || "—"}</div>
                  <div>Path: {asset?.path || "—"}</div>
                  <div>Type: {asset?.type || "file"}</div>
                  {asset?.checksum && <div>Checksum: {asset.checksum}</div>}
                </div>
              </div>
              <RoleGuard allow={["owner", "super_admin", "admin", "marketing"]}>
                <div className="flex items-center justify-end gap-2">
                  <button
                    className="px-3 py-1.5 rounded-md border card-bg"
                    onClick={() => window.history.back()}
                    disabled={saving}
                  >
                    Back
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded-md text-white ${
                      saving ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
                    }`}
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </RoleGuard>
            </div>
          </div>

          <div className="rounded-md p-3 card-bg shadow-elev-1 space-y-3">
            <div className="text-sm font-medium">Related Entities</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm mb-1">Client IDs</label>
                <input
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={clientIds}
                  onChange={(e) => setClientIds(e.target.value)}
                  placeholder="clientId1, clientId2"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Location IDs</label>
                <input
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={locationIds}
                  onChange={(e) => setLocationIds(e.target.value)}
                  placeholder="locationId1, locationId2"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Employee IDs</label>
                <input
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={employeeIds}
                  onChange={(e) => setEmployeeIds(e.target.value)}
                  placeholder="employeeUid1, employeeUid2"
                />
              </div>
            </div>
          </div>

          <div className="rounded-md p-3 card-bg shadow-elev-1 space-y-3">
            <div className="text-sm font-medium">Where used</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <div className="text-xs text-zinc-500">Campaigns</div>
                <div className="text-lg font-semibold">—</div>
                <Link
                  className="text-blue-600 underline text-xs"
                  to="/marketing"
                >
                  Go to Marketing
                </Link>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-zinc-500">Social Outbox</div>
                <div className="text-lg font-semibold">{socialCount}</div>
                <Link
                  className="text-blue-600 underline text-xs"
                  to="/marketing/social"
                >
                  View Social
                </Link>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-zinc-500">Training Modules</div>
                <div className="text-lg font-semibold">
                  {trainingModuleCount}
                </div>
                <Link
                  className="text-blue-600 underline text-xs"
                  to="/training/admin"
                >
                  Manage Training
                </Link>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-zinc-500">Client Docs</div>
                <div className="text-lg font-semibold">{clientDocsCount}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
