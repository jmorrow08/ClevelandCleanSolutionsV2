import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
  getDoc,
  doc,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";

type PhotoItem = {
  id: string;
  photoUrl: string;
  uploadedAt?: any;
  locationName?: string | null;
  notes?: string | null;
};

export default function MyPhotos() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [rows, setRows] = useState<PhotoItem[]>([]);

  useEffect(() => {
    (async () => {
      if (!user?.uid) return;
      try {
        setLoading(true);
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Resolve profileId
        let profileId: string | null = null;
        try {
          const us = await getDoc(doc(db, "users", user.uid));
          profileId =
            us.exists() && typeof (us.data() as any).profileId === "string"
              ? (us.data() as any).profileId
              : null;
        } catch {}

        const now = new Date();
        const start = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0
        );
        const end = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
          999
        );

        const qy = query(
          collection(db, "servicePhotos"),
          where("employeeProfileId", "==", profileId || ""),
          where("uploadedAt", ">=", Timestamp.fromDate(start)),
          where("uploadedAt", "<=", Timestamp.fromDate(end)),
          orderBy("uploadedAt", "desc")
        );
        const snap = await getDocs(qy);
        const list: PhotoItem[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setRows(list);
      } catch (e: any) {
        setError(e?.message || "Failed to load photos.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">My Photos</h1>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1 text-sm text-zinc-500">
          You have not uploaded any photos today.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {rows.map((p) => (
            <div
              key={p.id}
              className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1"
            >
              <img
                src={p.photoUrl}
                alt="job"
                className="w-full h-40 object-cover rounded"
                onClick={() => window.open(p.photoUrl, "_blank")}
              />
              <div className="mt-2 text-xs text-zinc-500">
                <div>{p.locationName || "Unknown location"}</div>
                <div>
                  {p.uploadedAt?.toDate
                    ? p.uploadedAt.toDate().toLocaleString()
                    : p.uploadedAt?.seconds
                    ? new Date(p.uploadedAt.seconds * 1000).toLocaleString()
                    : ""}
                </div>
                {p.notes ? <div className="italic">{p.notes}</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
