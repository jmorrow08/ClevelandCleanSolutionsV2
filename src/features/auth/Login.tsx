import { useEffect, useState } from "react";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { claimsToHome } from "../../utils/roleHome";
import { useAuth } from "../../context/AuthContext";

export default function Login() {
  const auth = getAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { claims } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If already logged in, send to role-based home
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        try {
          const token = await u.getIdTokenResult();
          const home = claimsToHome(token.claims as any);
          navigate(home, { replace: true });
        } catch {
          navigate("/", { replace: true });
        }
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
        const token = await u.getIdTokenResult();
        const home = claimsToHome(token.claims as any);
        navigate(home, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      const u = auth.currentUser;
      if (u) {
        const token = await u.getIdTokenResult();
        const home = claimsToHome(token.claims as any);
        navigate(home, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google");
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
            className="w-full rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 py-2 font-medium disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-4">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 py-2 text-sm disabled:opacity-50"
          >
            Continue with Google
          </button>
        </div>

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
