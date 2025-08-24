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
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import type { User } from "firebase/auth";
import { firebaseConfig } from "../services/firebase";

type Claims = Record<string, any>;

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  claims: Claims | null;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  claims: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<Claims | null>(null);

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
        setClaims(token.claims as Claims);
      } else {
        setClaims(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo(
    () => ({ user, loading, claims }),
    [user, loading, claims]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
