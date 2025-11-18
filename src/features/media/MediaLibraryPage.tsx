import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  deleteObject,
  getDownloadURL,
} from "firebase/storage";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { RoleGuard, HideFor } from "../../context/RoleGuard";
import { where } from "firebase/firestore";
import UploadDialog from "./UploadDialog";
import { Link, useNavigate } from "react-router-dom";

export default function MediaLibraryPage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<any[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "all" | "hr" | "training" | "client_resource" | "marketing"
  >("all");
  const [audience, setAudience] = useState<
    "all" | "internal" | "employees" | "clients" | "public"
  >("all");
  const [uploadedBy, setUploadedBy] = useState<string>("");
  const [tagSearch, setTagSearch] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const filters: any[] = [];
        if (activeTab !== "all")
          filters.push(where("category", "==", activeTab));
        if (audience !== "all") filters.push(where("audience", "==", audience));
        // uploadedBy and tagSearch require client filtering for now
        const q = query(
          collection(db, "mediaAssets"),
          ...filters,
          orderBy("uploadedAt", "desc"),
          limit(200)
        );
        const snap = await getDocs(q);
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        let filtered = list;
        if (uploadedBy.trim()) {
          filtered = filtered.filter((a) =>
            (a.uploadedBy || "").includes(uploadedBy.trim())
          );
        }
        if (tagSearch.trim()) {
          const term = tagSearch.trim().toLowerCase();
          filtered = filtered.filter((a) =>
            Array.isArray(a.tags)
              ? a.tags.some((t: string) =>
                  String(t).toLowerCase().includes(term)
                )
              : false
          );
        }
        if (fromDate) {
          const f = new Date(fromDate);
          filtered = filtered.filter((a) => {
            const dt = a.uploadedAt?.toDate
              ? a.uploadedAt.toDate()
              : a.uploadedAt;
            const d = dt ? new Date(dt) : null;
            return d ? d >= f : true;
          });
        }
        if (toDate) {
          const t = new Date(toDate);
          filtered = filtered.filter((a) => {
            const dt = a.uploadedAt?.toDate
              ? a.uploadedAt.toDate()
              : a.uploadedAt;
            const d = dt ? new Date(dt) : null;
            return d ? d <= t : true;
          });
        }
        setAssets(filtered);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeTab, audience, uploadedBy, tagSearch, fromDate, toDate]);

  const visible = useMemo(() => assets, [assets]);
  const allSelected = useMemo(
    () => visible.length > 0 && selectedIds.length === visible.length,
    [visible, selectedIds]
  );
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(visible.map((a) => a.id));
  }
  function toggleOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // Admin action functions
  function editAsset(assetId: string) {
    navigate(`/media/${assetId}`);
  }

  function moveAsset(assetId: string) {
    // For now, just navigate to edit page where user can change category/audience
    navigate(`/media/${assetId}`);
  }

  async function copyLink(asset: any) {
    if (asset.audience === "public" && asset.path) {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const storage = getStorage();
        const url = await getDownloadURL(ref(storage, asset.path));
        await navigator.clipboard.writeText(url);
        show({ type: "success", message: "Link copied to clipboard" });
      } catch (error) {
        show({ type: "error", message: "Failed to copy link" });
      }
    } else {
      show({ type: "error", message: "Asset must be public to copy link" });
    }
  }

  async function deleteAsset(assetId: string) {
    if (
      !confirm(
        "Are you sure you want to delete this asset? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const storage = getStorage();

      // Find the asset to get its path
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) {
        show({ type: "error", message: "Asset not found" });
        return;
      }

      // Delete from Firestore
      await deleteDoc(doc(db, "mediaAssets", assetId));

      // Delete from Storage if path exists
      if (asset.path) {
        try {
          await deleteObject(ref(storage, asset.path));
        } catch (storageError) {
          console.warn("Failed to delete from storage:", storageError);
          // Don't fail the whole operation if storage delete fails
        }
      }

      // Remove from local state
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      show({ type: "success", message: "Asset deleted successfully" });
    } catch (error) {
      console.error("Failed to delete asset:", error);
      show({ type: "error", message: "Failed to delete asset" });
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Media Library</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Upload and manage documents, videos, presentations, and other media
            files
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800">
          {(
            [
              ["all", "All"],
              ["hr", "HR Docs"],
              ["training", "Training"],
              ["client_resource", "Client Resources"],
              ["marketing", "Marketing"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`px-3 py-2 text-sm -mb-px border-b-2 ${
                activeTab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-zinc-600 dark:text-zinc-300"
              }`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <RoleGuard allow={["admin", "owner", "super_admin"]}>
          <button
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2"
            onClick={() => setShowUpload(true)}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            Upload Media
          </button>
        </RoleGuard>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <div>
          <label className="block text-xs mb-1">Audience</label>
          <select
            className="w-full border rounded-md px-2 py-1 text-sm card-bg"
            value={audience}
            onChange={(e) => setAudience(e.target.value as any)}
          >
            <option value="all">All</option>
            <option value="internal">Internal</option>
            <option value="employees">Employees</option>
            <option value="clients">Clients</option>
            <option value="public">Public</option>
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">Uploaded By</label>
          <input
            className="w-full border rounded-md px-2 py-1 text-sm card-bg"
            value={uploadedBy}
            onChange={(e) => setUploadedBy(e.target.value)}
            placeholder="uid or email"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Tags</label>
          <input
            className="w-full border rounded-md px-2 py-1 text-sm card-bg"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            placeholder="safety, onboarding"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">From</label>
          <input
            type="date"
            className="w-full border rounded-md px-2 py-1 text-sm card-bg"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs mb-1">To</label>
          <input
            type="date"
            className="w-full border rounded-md px-2 py-1 text-sm card-bg"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : assets.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-zinc-500 mb-4">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-zinc-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400 mb-2">
              No media assets yet
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              Get started by uploading your first document, video, or
              presentation
            </p>
          </div>
          <RoleGuard allow={["admin", "owner", "super_admin"]}>
            <button
              className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 mx-auto"
              onClick={() => setShowUpload(true)}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              Upload Your First Media
            </button>
          </RoleGuard>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-600 dark:text-zinc-300">
              {selectedIds.length > 0
                ? `${selectedIds.length} selected`
                : `${visible.length} items`}
            </div>
            <RoleGuard allow={["owner", "super_admin", "admin"]}>
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 text-xs rounded-md border"
                  onClick={() => {
                    // placeholder for Add to Campaign bulk action
                    if (selectedIds.length === 0)
                      return show({ type: "error", message: "Select assets" });
                    show({
                      type: "success",
                      message: "Added to campaign (stub)",
                    });
                  }}
                >
                  Add to Campaign
                </button>
                <button
                  className="px-2 py-1 text-xs rounded-md border"
                  onClick={() => {
                    if (selectedIds.length === 0)
                      return show({ type: "error", message: "Select assets" });
                    show({
                      type: "success",
                      message: "Assigned as training (stub)",
                    });
                  }}
                >
                  Assign as Training
                </button>
              </div>
            </RoleGuard>
          </div>
          <table className="w-full text-sm border rounded-md overflow-hidden">
            <thead className="bg-zinc-50 dark:bg-zinc-800">
              <tr>
                <th className="p-2 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Category</th>
                <th className="text-left p-2">Audience</th>
                <th className="text-left p-2">Used In</th>
                <th className="text-left p-2">Uploaded</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const usedChips: string[] = [];
                if (a.campaignCount)
                  usedChips.push(`${a.campaignCount} campaigns`);
                if (Array.isArray(a?.relatedEntities?.clientIds))
                  usedChips.push(
                    `${a.relatedEntities.clientIds.length} clients`
                  );
                return (
                  <tr key={a.id} className="border-t">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(a.id)}
                        onChange={() => toggleOne(a.id)}
                      />
                    </td>
                    <td className="p-2">
                      <Link
                        to={`/media/${encodeURIComponent(a.id)}`}
                        className="text-blue-600 dark:text-blue-400 underline"
                      >
                        {a.filename || a.id}
                      </Link>
                    </td>
                    <td className="p-2">
                      <span className="capitalize">{a.category || "—"}</span>
                    </td>
                    <td className="p-2">
                      <span className="capitalize">{a.audience || "—"}</span>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {usedChips.map((c, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-full text-xs bg-zinc-100 dark:bg-zinc-700"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-2">
                      {String(
                        a.uploadedAt?.toDate
                          ? a.uploadedAt.toDate()
                          : a.uploadedAt || ""
                      )}
                    </td>
                    <td className="p-2 space-x-2">
                      <button
                        className="px-2 py-1 rounded-md border text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        onClick={() => editAsset(a.id)}
                      >
                        Edit
                      </button>
                      <button
                        className="px-2 py-1 rounded-md border text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        onClick={() => moveAsset(a.id)}
                      >
                        Move
                      </button>
                      <button
                        className="px-2 py-1 rounded-md border text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        onClick={() => copyLink(a)}
                      >
                        Copy Link
                      </button>
                      <HideFor roles={["super_admin"]}>
                        <button
                          className="px-2 py-1 text-xs rounded-md bg-zinc-200 dark:bg-zinc-700 cursor-not-allowed"
                          title="Delete is super_admin-only"
                          disabled
                        >
                          Delete
                        </button>
                      </HideFor>
                      <RoleGuard allow={["super_admin"]}>
                        <button
                          className="px-2 py-1 text-xs rounded-md bg-red-600/10 text-red-700 dark:text-red-400 hover:bg-red-600/20"
                          onClick={() => deleteAsset(a.id)}
                        >
                          Delete
                        </button>
                      </RoleGuard>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showUpload && (
        <UploadDialog
          onClose={() => setShowUpload(false)}
          onUploaded={(id) => {
            // Refresh list after upload
            setSelectedIds([]);
            show({ type: "success", message: `Asset ${id} created` });
            // Trigger reload by toggling a filter briefly
            setTagSearch((s) => s);
          }}
        />
      )}
    </div>
  );
}
