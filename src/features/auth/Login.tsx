import { useEffect, useState } from "react";
import {
  getAuth,
  signInWithEmailAndPassword,
  type User,
} from "firebase/auth";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { claimsToHome } from "@/utils/roleHome";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const auth = getAuth();
  const navigate = useNavigate();
  const { claims } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function resolveHome(user: User) {
    const token = await user.getIdTokenResult(true);
    let fallbackRole: string | null = null;
    try {
      const db = getFirestore();
      const snap = await getDoc(doc(db, "users", user.uid));
      const role = snap.data()?.role;
      fallbackRole =
        typeof role === "string" && role.trim() ? role : null;
    } catch {
      fallbackRole = null;
    }
    return claimsToHome(token.claims as any, fallbackRole);
  }

  useEffect(() => {
    async function handleAuthChange(user: User) {
      try {
        const home = await resolveHome(user);
        navigate(home, { replace: true });
      } catch {
        navigate("/", { replace: true });
      }
    }

    // If already logged in, send to role-based home
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) {
        void handleAuthChange(u);
      }
    });
    return () => unsub();
  }, [auth, navigate]);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const u = auth.currentUser;
      if (u) {
        try {
          const home = await resolveHome(u);
          navigate(home, { replace: true });
        } catch {
          navigate("/", { replace: true });
        }
      } else {
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 dark:border-zinc-800 card-bg p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Use your company credentials to continue.
        </p>

        {error ? (
          <div className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <form className="mt-4 space-y-3" onSubmit={handleEmailLogin}>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[var(--brand)] text-white py-2 font-medium disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-4 text-xs text-zinc-600 dark:text-zinc-400">
          <span>Having trouble?</span>{" "}
          <Link to={claimsToHome(claims)} className="underline">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
