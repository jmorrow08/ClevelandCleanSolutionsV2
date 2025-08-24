import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  updateDoc,
  where,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { firebaseConfig } from "../../services/firebase";
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
};

export default function EmployeeKnowledge() {
  const { user } = useAuth();
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [hrDocs, setHrDocs] = useState<Asset[]>([]);
  const [moduleMap, setModuleMap] = useState<Record<string, Module>>({});

  useEffect(() => {
    async function load() {
      if (!user) return;
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
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
        const hrSnap = await getDocs(
          query(collection(db, "mediaAssets"), where("category", "==", "hr"))
        );
        const hrList: Asset[] = [];
        hrSnap.forEach((d) => {
          const v: any = d.data();
          const aud = v.audience || "internal";
          const rel = v.relatedEntities || {};
          const include =
            aud === "employees" ||
            (Array.isArray(rel.employeeIds) &&
              rel.employeeIds.includes(user.uid));
          if (include) hrList.push({ id: d.id, ...(v as any) });
        });
        setHrDocs(hrList);
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Knowledge Center</h1>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <>
          <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
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
                                userId: user.uid,
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

          <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
            <div className="font-medium mb-2">HR Docs</div>
            {hrDocs.length === 0 ? (
              <div className="text-sm text-zinc-500">No HR docs.</div>
            ) : (
              <ul className="space-y-2">
                {hrDocs.map((a) => (
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
        </>
      )}
    </div>
  );
}



