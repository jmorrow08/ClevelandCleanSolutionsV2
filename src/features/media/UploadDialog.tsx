import { useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

type Props = {
  onClose: () => void;
  onUploaded?: (assetId: string) => void;
};

type Category = "hr" | "training" | "client_resource" | "marketing" | "org";
type Audience = "internal" | "employees" | "clients" | "public";

export default function UploadDialog({ onClose, onUploaded }: Props) {
  const { show } = useToast();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<Category>("org");
  const [audience, setAudience] = useState<Audience>("internal");
  const [tags, setTags] = useState<string>("");
  const [clientIds, setClientIds] = useState<string>("");
  const [locationIds, setLocationIds] = useState<string>("");
  const [employeeIds, setEmployeeIds] = useState<string>("");
  const [requiresAck, setRequiresAck] = useState<boolean>(false);
  const [version, setVersion] = useState<string>("1");
  const [durationSec, setDurationSec] = useState<string>("");

  const defaultPathPrefix = useMemo(() => {
    if (category === "hr") return "media/hr";
    if (category === "training") return "media/training";
    if (category === "org") return "media/org";
    if (category === "marketing") {
      return audience === "public" ? "media/public" : "media/org";
    }
    // client_resource
    if (audience === "public") return "media/public";
    const firstClient = clientIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0];
    return firstClient ? `media/client/${firstClient}` : "media/client/shared";
  }, [category, audience, clientIds]);

  const canSubmit = useMemo(() => {
    if (!file) return false;
    if (category === "client_resource" && audience === "clients") {
      const ids = clientIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) return false;
    }
    return !submitting;
  }, [file, category, audience, clientIds, submitting]);

  async function handleSubmit() {
    if (!file) return;
    try {
      setSubmitting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const storage = getStorage();
      const db = getFirestore();
      const id = uuidv4();
      const path = `${defaultPathPrefix}/${id}-${file.name}`;
      await uploadBytes(ref(storage, path), file);

      const relatedEntities: any = {};
      const clientArray = clientIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const locationArray = locationIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const employeeArray = employeeIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (clientArray.length) relatedEntities.clientIds = clientArray;
      if (locationArray.length) relatedEntities.locationIds = locationArray;
      if (employeeArray.length) relatedEntities.employeeIds = employeeArray;

      const payload: any = {
        filename: file.name,
        path,
        type: file.type || "file",
        tags: tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        category,
        audience,
        relatedEntities: Object.keys(relatedEntities).length
          ? relatedEntities
          : {},
        requiresAck: !!requiresAck,
        version: Number(version) || 1,
        durationSec: durationSec ? Number(durationSec) : null,
        transcoded: false,
        checksum: null,
        uploadedBy: user?.uid || null,
        uploadedAt: serverTimestamp(),
      };

      const refDoc = await addDoc(collection(db, "mediaAssets"), payload);
      show({ type: "success", message: "Upload complete." });
      onUploaded?.(refDoc.id);
      onClose();
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Upload failed" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative w-full max-w-2xl rounded-lg card-bg shadow-elev-3 p-4">
        <div className="text-lg font-medium">Upload Media</div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Category</label>
            <select
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              <option value="org">Org</option>
              <option value="hr">HR Doc</option>
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
              <option value="internal">Internal (admins)</option>
              <option value="employees">Employees</option>
              <option value="clients">Clients</option>
              <option value="public">Public</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Tags (comma separated)</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              placeholder="policy, onboarding, safety"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          {audience === "clients" && (
            <>
              <div>
                <label className="block text-sm mb-1">Client IDs</label>
                <input
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  placeholder="clientId1, clientId2"
                  value={clientIds}
                  onChange={(e) => setClientIds(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Location IDs</label>
                <input
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  placeholder="locationId1, locationId2"
                  value={locationIds}
                  onChange={(e) => setLocationIds(e.target.value)}
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm mb-1">
              Employee IDs (optional)
            </label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              placeholder="employeeUid1, employeeUid2"
              value={employeeIds}
              onChange={(e) => setEmployeeIds(e.target.value)}
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
            <label className="block text-sm mb-1">
              Duration (sec, if video)
            </label>
            <input
              type="number"
              min={0}
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 mt-2 md:mt-7">
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
            Storage path:{" "}
            <span className="font-mono">{defaultPathPrefix}/…</span>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-md border card-bg"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-white ${
              canSubmit ? "bg-blue-600 hover:bg-blue-700" : "bg-zinc-400"
            }`}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
