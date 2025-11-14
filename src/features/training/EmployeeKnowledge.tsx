import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  getDocs,
  getFirestore,
  orderBy,
  query,
  where,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { getFirebaseApp, getFirestoreInstance } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

type Module = {
  id: string;
  title: string;
  description?: string;
  audience: "employees" | "clients";
  assetIds: string[];
  passScore?: number | null;
};

type Asset = {
  id: string;
  filename?: string;
  path?: string;
  type?: string;
  category?: string;
  audience?: string;
  relatedEntities?: any;
  requiresAck?: boolean;
  url?: string;
};

export default function EmployeeKnowledge() {
  const { user } = useAuth();
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [hrDocs, setHrDocs] = useState<Asset[]>([]);
  const [employeeVideos, setEmployeeVideos] = useState<Asset[]>([]);
  const [moduleMap, setModuleMap] = useState<Record<string, Module>>({});
  const [videoModal, setVideoModal] = useState<{
    asset: Asset | null;
    url: string;
  } | null>(null);

  useEffect(() => {
    async function load() {
      if (!user) return;
      try {
        const db = getFirestoreInstance();
        // Assigned modules
        const aSnap = await getDocs(
          query(
            collection(db, "trainingAssignments"),
            where("userId", "==", user.uid),
            orderBy("assignedAt", "desc")
          )
        );
        const aList: any[] = [];
        const moduleIds = new Set<string>();
        aSnap.forEach((d) => {
          const v = { id: d.id, ...(d.data() as any) };
          aList.push(v);
          if (v.moduleId) moduleIds.add(v.moduleId);
        });
        setAssignments(aList);
        // load modules
        const mods: Record<string, Module> = {};
        if (moduleIds.size) {
          const qMods = await getDocs(query(collection(db, "trainingModules")));
          qMods.forEach((d) => {
            const m = { id: d.id, ...(d.data() as any) } as Module;
            if (moduleIds.has(m.id)) mods[m.id] = m;
          });
        }
        setModuleMap(mods);

        // HR Docs visible to employees or targeted to this employee
        try {
          const hrSnap = await getDocs(
            query(collection(db, "mediaAssets"), where("category", "==", "hr"))
          );
          const hrList: Asset[] = [];
          const app = getFirebaseApp();
          const storage = getStorage(app);

          for (const doc of hrSnap.docs) {
            const v: any = doc.data();
            const aud = v.audience || "internal";
            const rel = v.relatedEntities || {};
            // Include assets for all employees or specifically targeted to this employee
            const shouldInclude =
              aud === "employees" || // All employees
              (Array.isArray(rel.employeeIds) &&
                rel.employeeIds.includes(user.uid)); // Specific employee

            if (shouldInclude) {
              const asset: Asset = { id: doc.id, ...(v as any) };

              // Get download URL for the asset
              if (asset.path) {
                try {
                  asset.url = await getDownloadURL(ref(storage, asset.path));
                } catch (urlError) {
                  console.warn(
                    "Failed to get download URL for HR asset:",
                    asset.id,
                    urlError
                  );
                }
              }

              hrList.push(asset);
            }
          }
          setHrDocs(hrList);
        } catch (error) {
          console.error("Error loading HR docs:", error);
          // Set empty array if permission denied or other error
          setHrDocs([]);
        }

        // Employee videos - videos with audience set to "employees"
        try {
          const employeeVideoSnap = await getDocs(
            query(
              collection(db, "mediaAssets"),
              where("audience", "==", "employees")
            )
          );
          const employeeVideoList: Asset[] = [];
          // Use the same app and storage instance
          const app = getFirebaseApp();
          const storage = getStorage(app);

          for (const doc of employeeVideoSnap.docs) {
            const v: any = doc.data();
            const rel = v.relatedEntities || {};
            // Include assets for all employees or specifically targeted to this employee
            const shouldInclude =
              !rel.employeeIds || // No employeeIds means all employees
              (Array.isArray(rel.employeeIds) &&
                rel.employeeIds.length === 0) || // Empty array means all employees
              (Array.isArray(rel.employeeIds) &&
                rel.employeeIds.includes(user.uid)); // Specific employee

            if (shouldInclude) {
              const asset: Asset = { id: doc.id, ...(v as any) };

              // Get download URL for the asset
              if (asset.path) {
                try {
                  asset.url = await getDownloadURL(ref(storage, asset.path));
                } catch (urlError) {
                  console.warn(
                    "Failed to get download URL for employee video:",
                    asset.id,
                    urlError
                  );
                }
              }

              employeeVideoList.push(asset);
            }
          }
          setEmployeeVideos(employeeVideoList);
        } catch (error) {
          console.error("Error loading employee videos:", error);
          setEmployeeVideos([]);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  async function acknowledgeAsset(asset: Asset) {
    if (!user) return;
    try {
      const db = getFirestore();
      await addDoc(collection(db, "trainingCompletions"), {
        moduleId: null,
        userId: user.uid,
        clientUserId: null,
        acknowledged: true,
        assetId: asset.id,
        completedAt: serverTimestamp(),
      });
      show({ type: "success", message: "Acknowledged" });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed" });
    }
  }

  function viewAsset(asset: Asset) {
    if (asset.url) {
      setVideoModal({ asset, url: asset.url });
    } else {
      show({ type: "error", message: "Unable to load this resource" });
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Knowledge Center</h1>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <>
          <div className="rounded-lg p-4 card-bg shadow-elev-1">
            <div className="font-medium mb-2">Assigned Modules</div>
            {assignments.length === 0 ? (
              <div className="text-sm text-zinc-500">No assignments.</div>
            ) : (
              <ul className="space-y-2">
                {assignments.map((a) => {
                  const m = moduleMap[a.moduleId] as Module | undefined;
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium">
                          {m?.title || a.moduleId}
                        </div>
                        <div className="text-xs text-zinc-500">
                          Due:{" "}
                          {a.dueAt?.toDate
                            ? a.dueAt.toDate().toLocaleString()
                            : "—"}
                        </div>
                      </div>
                      <button
                        className="px-2 py-1 rounded-md border text-xs"
                        onClick={async () => {
                          try {
                            const db = getFirestore();
                            await addDoc(
                              collection(db, "trainingCompletions"),
                              {
                                moduleId: a.moduleId,
                                userId: user?.uid || "",
                                clientUserId: null,
                                completedAt: serverTimestamp(),
                              }
                            );
                            show({
                              type: "success",
                              message: "Marked complete",
                            });
                          } catch (e: any) {
                            show({
                              type: "error",
                              message: e?.message || "Failed",
                            });
                          }
                        }}
                      >
                        Mark done
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-lg p-4 card-bg shadow-elev-1">
            <div className="font-medium mb-2">HR Docs</div>
            {hrDocs.length === 0 ? (
              <div className="text-sm text-zinc-500">No HR docs.</div>
            ) : (
              <ul className="space-y-2">
                {hrDocs.map((a) => (
                  <li key={a.id} className="flex items-center justify-between">
                    <div>{a.filename || a.id}</div>
                    <div className="flex items-center gap-2">
                      <button
                        className="px-2 py-1 rounded-md border text-xs bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() => viewAsset(a)}
                      >
                        View
                      </button>
                      {a.requiresAck && (
                        <button
                          className="px-2 py-1 rounded-md border text-xs"
                          onClick={() => acknowledgeAsset(a)}
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg p-4 card-bg shadow-elev-1">
            <div className="font-medium mb-2">Employee Videos</div>
            {employeeVideos.length === 0 ? (
              <div className="text-sm text-zinc-500">No employee videos.</div>
            ) : (
              <ul className="space-y-2">
                {employeeVideos.map((a) => (
                  <li key={a.id} className="flex items-center justify-between">
                    <div>{a.filename || a.id}</div>
                    <div className="flex items-center gap-2">
                      <button
                        className="px-2 py-1 rounded-md border text-xs bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() => viewAsset(a)}
                      >
                        View
                      </button>
                      {a.requiresAck && (
                        <button
                          className="px-2 py-1 rounded-md border text-xs"
                          onClick={() => acknowledgeAsset(a)}
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Video Modal */}
      {videoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="relative w-full max-w-4xl mx-4">
            <div className="card-bg border border-[var(--border)] rounded-lg shadow-elev-2 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-semibold">
                  {videoModal.asset?.filename ||
                    videoModal.asset?.id ||
                    "Resource"}
                </div>
                <button
                  className="px-2 py-1 text-sm rounded-md border hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  onClick={() => setVideoModal(null)}
                >
                  Close
                </button>
              </div>
              <div className="max-h-[70vh] overflow-auto">
                {videoModal.asset?.type?.startsWith("video/") ? (
                  <video
                    src={videoModal.url}
                    controls
                    className="w-full rounded-md"
                    autoPlay={false}
                  />
                ) : videoModal.asset?.type?.startsWith("image/") ? (
                  <img
                    src={videoModal.url}
                    alt={videoModal.asset.filename || "Resource"}
                    className="w-full rounded-md"
                  />
                ) : videoModal.asset?.type?.includes("pdf") ? (
                  <iframe
                    title="resource preview"
                    src={videoModal.url}
                    className="w-full h-96 rounded-md"
                  />
                ) : (
                  <div className="p-4 text-center">
                    <a
                      href={videoModal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Download {videoModal.asset?.filename || "Resource"}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
