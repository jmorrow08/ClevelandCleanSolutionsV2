import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import { useToast } from "../../context/ToastContext";
import { RoleGuard, HideFor } from "../../context/RoleGuard";
import { addDoc, serverTimestamp, where } from "firebase/firestore";
import UploadDialog from "./UploadDialog";
import { Link } from "react-router-dom";

export default function MediaLibraryPage() {
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
  const { show } = useToast();
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
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Media Library</h1>
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
        <RoleGuard allow={["admin", "owner", "marketing", "super_admin"]}>
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
            onClick={() => setShowUpload(true)}
          >
            Upload
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
        <div className="text-sm text-zinc-500">No media assets.</div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-600 dark:text-zinc-300">
              {selectedIds.length > 0
                ? `${selectedIds.length} selected`
                : `${visible.length} items`}
            </div>
            <RoleGuard allow={["owner", "super_admin", "marketing", "admin"]}>
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
                      <button className="px-2 py-1 rounded-md border text-xs">
                        Edit
                      </button>
                      <button className="px-2 py-1 rounded-md border text-xs">
                        Move
                      </button>
                      <button className="px-2 py-1 rounded-md border text-xs">
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
                          className="px-2 py-1 text-xs rounded-md bg-red-600/10 text-red-700 dark:text-red-400 cursor-not-allowed"
                          title="Delete not implemented"
                          disabled
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
