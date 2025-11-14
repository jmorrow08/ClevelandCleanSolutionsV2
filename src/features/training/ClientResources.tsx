import { useEffect, useState } from "react";
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
import { useToast } from "../../context/ToastContext";
import { useFirestoreErrorHandler } from "../../utils/firestoreErrors";
import { useAuth } from "../../context/AuthContext";

type Asset = {
  id: string;
  filename?: string;
  audience?: string;
  category?: string;
  relatedEntities?: { clientIds?: string[] };
  requiresAck?: boolean;
  path?: string;
  type?: string;
  url?: string;
};

export default function ClientResources() {
  const { user, claims } = useAuth();

  // Debug: Log user claims
  useEffect(() => {
    console.log("ClientResources: User claims:", claims);
    console.log("ClientResources: User:", user?.uid);
  }, [user, claims]);
  const { show } = useToast();
  const { handleFirestoreError } = useFirestoreErrorHandler();
  const [loading, setLoading] = useState(true);
  const [companyAssets, setCompanyAssets] = useState<Asset[]>([]);
  const [publicGuides, setPublicGuides] = useState<Asset[]>([]);
  const [videoModal, setVideoModal] = useState<{
    asset: Asset | null;
    url: string;
  } | null>(null);

  // Best-effort: current client context not modeled; fallback to any client-targeted assets
  useEffect(() => {
    async function load() {
      if (!user) return;
      setLoading(true);
      try {
        const db = getFirestoreInstance();

        // Company-specific guides
        const companyQ = query(
          collection(db, "mediaAssets"),
          where("category", "==", "client_resource"),
          where("audience", "==", "clients"),
          orderBy("uploadedAt", "desc")
        );

        try {
          const cSnap = await getDocs(companyQ);
          console.log(
            "ClientResources: Found",
            cSnap.docs.length,
            "documents matching query"
          );
          const cList: Asset[] = [];
          const app = getFirebaseApp();
          const storage = getStorage(app);

          for (const doc of cSnap.docs) {
            const v: any = doc.data();
            console.log(
              "ClientResources: Processing document",
              doc.id,
              "data:",
              {
                filename: v.filename,
                category: v.category,
                audience: v.audience,
                path: v.path,
                relatedEntities: v.relatedEntities,
              }
            );

            const rel = v.relatedEntities || {};
            // Include assets for all clients or specific clients
            const shouldInclude =
              !rel.clientIds || // No clientIds means all clients
              (Array.isArray(rel.clientIds) && rel.clientIds.length === 0) || // Empty array means all clients
              (Array.isArray(rel.clientIds) && rel.clientIds.length > 0); // Specific clients

            console.log(
              "ClientResources: Should include document",
              doc.id,
              ":",
              shouldInclude
            );

            if (shouldInclude) {
              const asset: Asset = { id: doc.id, ...(v as any) };

              // Get download URL for the asset
              if (asset.path) {
                try {
                  console.log(
                    "ClientResources: Attempting to get download URL for path:",
                    asset.path
                  );
                  asset.url = await getDownloadURL(ref(storage, asset.path));
                  console.log(
                    "ClientResources: Successfully got download URL for",
                    asset.id
                  );
                } catch (urlError) {
                  console.warn(
                    "Failed to get download URL for asset:",
                    asset.id,
                    "path:",
                    asset.path,
                    "error:",
                    urlError
                  );
                }
              } else {
                console.warn(
                  "ClientResources: No path found for asset",
                  asset.id
                );
              }

              cList.push(asset);
            }
          }
          console.log(
            "ClientResources: Final company assets list:",
            cList.map((a) => ({ id: a.id, filename: a.filename, url: !!a.url }))
          );
          setCompanyAssets(cList);
        } catch (error) {
          console.warn("Failed to load company assets:", error);
          setCompanyAssets([]);
        }

        // Public guides
        try {
          const publicQ = query(
            collection(db, "mediaAssets"),
            where("category", "==", "client_resource"),
            where("audience", "==", "public"),
            orderBy("uploadedAt", "desc")
          );
          const pSnap = await getDocs(publicQ);
          const pList: Asset[] = [];
          pSnap.forEach((d) => pList.push({ id: d.id, ...(d.data() as any) }));
          setPublicGuides(pList);
        } catch (error) {
          console.warn("Failed to load public guides:", error);
          setPublicGuides([]);
        }
      } catch (error) {
        handleFirestoreError(error, "client-resources");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, show]);

  async function acknowledgeAsset(a: Asset) {
    if (!user) {
      show({
        type: "error",
        message: "You must be logged in to acknowledge resources.",
      });
      return;
    }

    try {
      const db = getFirestoreInstance();
      await addDoc(collection(db, "trainingCompletions"), {
        moduleId: null,
        userId: null,
        clientUserId: user.uid,
        acknowledged: true,
        assetId: a.id,
        completedAt: serverTimestamp(),
      });
      show({ type: "success", message: "Resource acknowledged successfully" });
    } catch (e: any) {
      handleFirestoreError(e);
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
      <h1 className="text-xl font-semibold">Resources</h1>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <>
          <div className="rounded-lg p-4 card-bg shadow-elev-1">
            <div className="font-medium mb-2">Resources for My Company</div>
            {companyAssets.length === 0 ? (
              <div className="text-sm text-zinc-500">No company resources.</div>
            ) : (
              <ul className="space-y-2">
                {companyAssets.map((a) => (
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
            <div className="font-medium mb-2">Public Guides</div>
            {publicGuides.length === 0 ? (
              <div className="text-sm text-zinc-500">No public guides.</div>
            ) : (
              <ul className="space-y-2">
                {publicGuides.map((a) => (
                  <li key={a.id} className="flex items-center justify-between">
                    <div>{a.filename || a.id}</div>
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
