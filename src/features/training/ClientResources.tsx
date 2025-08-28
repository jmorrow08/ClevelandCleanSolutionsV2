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
import { firebaseConfig } from "../../services/firebase";
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
};

export default function ClientResources() {
  const { user, claims } = useAuth();
  const { show } = useToast();
  const { handleFirestoreError } = useFirestoreErrorHandler();
  const [loading, setLoading] = useState(true);
  const [companyAssets, setCompanyAssets] = useState<Asset[]>([]);
  const [publicGuides, setPublicGuides] = useState<Asset[]>([]);

  // Best-effort: current client context not modeled; fallback to any client-targeted assets
  useEffect(() => {
    async function load() {
      if (!user) return;
      setLoading(true);
      try {
        const db = getFirestore();

        // Company-specific guides
        const companyQ = query(
          collection(db, "mediaAssets"),
          where("category", "==", "client_resource"),
          where("audience", "==", "client"),
          orderBy("uploadedAt", "desc")
        );

        try {
          const cSnap = await getDocs(companyQ);
          const cList: Asset[] = [];
          cSnap.forEach((d) => {
            const v: any = d.data();
            const rel = v.relatedEntities || {};
            // Without a concrete clientId context, include any with related clientIds.
            if (Array.isArray(rel.clientIds) && rel.clientIds.length > 0) {
              cList.push({ id: d.id, ...(v as any) });
            }
          });
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
        handleFirestoreError(error);
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
      const db = getFirestore();
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Resources</h1>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <>
          <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
            <div className="font-medium mb-2">Resources for My Company</div>
            {companyAssets.length === 0 ? (
              <div className="text-sm text-zinc-500">No company resources.</div>
            ) : (
              <ul className="space-y-2">
                {companyAssets.map((a) => (
                  <li key={a.id} className="flex items-center justify-between">
                    <div>{a.filename || a.id}</div>
                    {a.requiresAck && (
                      <button
                        className="px-2 py-1 rounded-md border text-xs"
                        onClick={() => acknowledgeAsset(a)}
                      >
                        Acknowledge
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
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
    </div>
  );
}
