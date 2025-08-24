import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const auth = getAuth();
        const db = getFirestore();
        const uid = auth.currentUser?.uid;
        if (!uid) return setLoading(false);
        const userSnap = await getDoc(doc(db, "users", uid));
        const profileId = (userSnap.data() as any)?.profileId;
        if (!profileId) return setLoading(false);
        const clientSnap = await getDoc(doc(db, "clientMasterList", profileId));
        setProfile(clientSnap.data());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Profile</h1>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : !profile ? (
          <div className="text-sm text-zinc-500">No profile found.</div>
        ) : (
          <div className="text-sm space-y-2">
            <div>Company: {profile.companyName || "—"}</div>
            <div>Contact: {profile.contactName || profile.name || "—"}</div>
            <div>Email: {profile.email || "—"}</div>
            <div>Phone: {profile.phone || "—"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
