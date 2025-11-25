import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, getIdTokenResult, connectAuthEmulator } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firebaseConfig } from '@/services/firebase';
import { getRole } from '@/auth/claims';

type Claims = Record<string, any>;

type ProfileCache = { uid: string; profileId: string };
const PROFILE_CACHE_KEY = 'auth-profile-cache';

function readCachedProfileId(uid?: string | null): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfileCache>;
    if (!parsed || typeof parsed.uid !== 'string' || typeof parsed.profileId !== 'string') {
      return null;
    }
    if (uid && parsed.uid !== uid) return null;
    return parsed.profileId;
  } catch {
    return null;
  }
}

function writeCachedProfileId(cache: ProfileCache | null) {
  if (typeof window === 'undefined') return;
  try {
    if (cache?.uid && cache?.profileId) {
      window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cache));
    } else {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // Ignore storage errors (incognito or disabled cookies)
  }
}

function normalizeClaims(rawClaims: Claims | null, fallbackRole?: string | null): Claims | null {
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
  const [profileId, setProfileId] = useState<string | null>(() => {
    // Only hydrate from cache when we can associate it with the
    // currently authenticated Firebase user. This avoids briefly
    // showing a previous user's profileId during auth transitions.
    try {
      if (typeof window === 'undefined') return null;
      if (!getApps().length) return null;
      const auth = getAuth();
      const uid = auth.currentUser?.uid ?? null;
      return uid ? readCachedProfileId(uid) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // Ensure Firebase app is initialized once
    if (!getApps().length) {
      initializeApp(firebaseConfig);
    }
    const auth = getAuth();
    // Optional: connect to emulators in dev without impacting production
    try {
      if (import.meta.env.DEV && (import.meta.env as any).VITE_USE_FIREBASE_EMULATOR === 'true') {
        try {
          connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
            disableWarnings: true,
          });
        } catch {}
        try {
          const db = getFirestore();
          connectFirestoreEmulator(db, '127.0.0.1', 8080);
        } catch {}
      }
    } catch {}
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const token = await getIdTokenResult(u, true);
        const db = getFirestore();
        let userDocData: Record<string, unknown> | null = null;
        let profileFromDoc: string | null = null;
        let docReadError = false;
        try {
          const snap = await getDoc(doc(db, 'users', u.uid));
          if (snap.exists()) {
            userDocData = (snap.data() as any) || null;
            const rawProfileId = (userDocData as any)?.profileId;
            profileFromDoc =
              typeof rawProfileId === 'string' && rawProfileId.trim() ? rawProfileId.trim() : null;
          } else {
            userDocData = null;
          }
        } catch {
          docReadError = true;
          userDocData = null;
        }
        const profileFromClaims =
          typeof (token.claims as any)?.profileId === 'string' &&
          (token.claims as any)?.profileId?.trim()
            ? ((token.claims as any).profileId as string).trim()
            : null;
        const cachedProfileId = readCachedProfileId(u.uid);
        const resolvedProfileId =
          profileFromDoc ?? profileFromClaims ?? (docReadError ? cachedProfileId : null);
        setProfileId(resolvedProfileId);
        if (resolvedProfileId) {
          writeCachedProfileId({ uid: u.uid, profileId: resolvedProfileId });
        } else if (!docReadError) {
          writeCachedProfileId(null);
        }
        const normalized = normalizeClaims(
          token.claims as Claims,
          (userDocData?.role as string) || null,
        );
        setClaims(normalized);
      } else {
        setClaims(null);
        setProfileId(null);
        writeCachedProfileId(null);
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
          doc(db, 'presence', uid),
          {
            uid: uid,
            displayName: user?.displayName || (user as any)?.name || user?.email || 'User',
            online: true,
            lastActive: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (error) {
        console.warn('Failed to update presence:', error);
        // Don't retry immediately on error, but log more details for debugging
        if (error instanceof Error) {
          console.warn('Presence update error details:', {
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
          doc(db, 'users', uid),
          { presence: { online: true, lastActive: serverTimestamp() } },
          { merge: true },
        );
      } catch (error) {
        console.warn('Failed to update user presence:', error);
        // Log more details for debugging
        if (error instanceof Error) {
          console.warn('User presence update error details:', {
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
      if (document.visibilityState === 'visible') {
        isOnline = true;
        writeOnline();
      } else {
        isOnline = false;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Handle online/offline events
    const handleOnline = () => {
      isOnline = true;
      writeOnline();
    };
    const handleOffline = () => {
      isOnline = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      // Mark offline on sign-out
      (async () => {
        try {
          // If auth state already cleared, skip writes to avoid permission-denied
          if (!getAuth().currentUser) return;
          await setDoc(
            doc(db, 'presence', uid),
            {
              uid: uid,
              online: false,
              lastActive: serverTimestamp(),
            },
            { merge: true },
          );
        } catch (error) {
          console.warn('Failed to mark offline in presence:', error);
          if (error instanceof Error) {
            console.warn('Offline presence update error details:', {
              code: (error as any).code,
              message: error.message,
              uid: uid,
            });
          }
        }
        try {
          if (!getAuth().currentUser) return;
          await setDoc(
            doc(db, 'users', uid),
            { presence: { online: false, lastActive: serverTimestamp() } },
            { merge: true },
          );
        } catch (error) {
          console.warn('Failed to mark offline in users:', error);
          if (error instanceof Error) {
            console.warn('Offline users presence update error details:', {
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
    [user, loading, claims, profileId],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
