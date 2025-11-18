import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  getIdTokenResult,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { firebaseConfig } from "@/services/firebase";
import { getRole } from "@/auth/claims";

type Claims = Record<string, any>;

function normalizeClaims(
  rawClaims: Claims | null,
  fallbackRole?: string | null
): Claims | null {
  if (!rawClaims && !fallbackRole) return rawClaims;
  const normalized: Claims = { ...(rawClaims || {}) };
  const canonical = getRole(normalized, fallbackRole ?? null);
  if (canonical) {
    normalized.role = canonical;
    normalized[canonical] = true;
  }
  return normalized;
}

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  claims: Claims | null;
  profileId: string | null;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  claims: null,
  profileId: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<Claims | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    // Ensure Firebase app is initialized once
    if (!getApps().length) {
      initializeApp(firebaseConfig);
    }
    const auth = getAuth();
    // Optional: connect to emulators in dev without impacting production
    try {
      if (
        import.meta.env.DEV &&
        (import.meta.env as any).VITE_USE_FIREBASE_EMULATOR === "true"
      ) {
        try {
          connectAuthEmulator(auth, "http://127.0.0.1:9099", {
            disableWarnings: true,
          });
        } catch {}
        try {
          const db = getFirestore();
          connectFirestoreEmulator(db, "127.0.0.1", 8080);
        } catch {}
      }
    } catch {}
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const token = await getIdTokenResult(u, true);
        const db = getFirestore();
        let userDocData: Record<string, unknown> | null = null;
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          userDocData = (snap.data() as any) || null;
        } catch {
          userDocData = null;
        }
        const profileFromDoc =
          typeof userDocData?.profileId === "string"
            ? (userDocData.profileId as string)
            : null;
        setProfileId(profileFromDoc);
        const normalized = normalizeClaims(
          token.claims as Claims,
          (userDocData?.role as string) || null
        );
        setClaims(normalized);
      } else {
        setClaims(null);
        setProfileId(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Presence heartbeat: mark current user online and update lastActive periodically
  useEffect(() => {
    if (!user) return;
    const db = getFirestore();
    const uid = user.uid;
    let intervalId: any;
    let isOnline = true;

    async function writeOnline() {
      if (!isOnline) return; // Don't write if we're offline

      try {
        // Check if user is still authenticated before writing
        if (!getAuth().currentUser) return;

        await setDoc(
          doc(db, "presence", uid),
          {
            uid: uid,
            displayName:
              user?.displayName || (user as any)?.name || user?.email || "User",
            online: true,
            lastActive: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        console.warn("Failed to update presence:", error);
        // Don't retry immediately on error, but log more details for debugging
        if (error instanceof Error) {
          console.warn("Presence update error details:", {
            code: (error as any).code,
            message: error.message,
            uid: uid,
          });
        }
        return;
      }

      // Best-effort mirror under users/{uid}.presence for legacy readers
      try {
        await setDoc(
          doc(db, "users", uid),
          { presence: { online: true, lastActive: serverTimestamp() } },
          { merge: true }
        );
      } catch (error) {
        console.warn("Failed to update user presence:", error);
        // Log more details for debugging
        if (error instanceof Error) {
          console.warn("User presence update error details:", {
            code: (error as any).code,
            message: error.message,
            uid: uid,
          });
        }
      }
    }

    // Initial write and heartbeat every 60s (increased from 30s to reduce frequency)
    writeOnline();
    intervalId = setInterval(writeOnline, 60000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        isOnline = true;
        writeOnline();
      } else {
        isOnline = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Handle online/offline events
    const handleOnline = () => {
      isOnline = true;
      writeOnline();
    };
    const handleOffline = () => {
      isOnline = false;
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);

      // Mark offline on sign-out
      (async () => {
        try {
          // If auth state already cleared, skip writes to avoid permission-denied
          if (!getAuth().currentUser) return;
          await setDoc(
            doc(db, "presence", uid),
            {
              uid: uid,
              online: false,
              lastActive: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (error) {
          console.warn("Failed to mark offline in presence:", error);
          if (error instanceof Error) {
            console.warn("Offline presence update error details:", {
              code: (error as any).code,
              message: error.message,
              uid: uid,
            });
          }
        }
        try {
          if (!getAuth().currentUser) return;
          await setDoc(
            doc(db, "users", uid),
            { presence: { online: false, lastActive: serverTimestamp() } },
            { merge: true }
          );
        } catch (error) {
          console.warn("Failed to mark offline in users:", error);
          if (error instanceof Error) {
            console.warn("Offline users presence update error details:", {
              code: (error as any).code,
              message: error.message,
              uid: uid,
            });
          }
        }
      })();
    };
  }, [user?.uid]);

  const value = useMemo(
    () => ({ user, loading, claims, profileId }),
    [user, loading, claims, profileId]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
