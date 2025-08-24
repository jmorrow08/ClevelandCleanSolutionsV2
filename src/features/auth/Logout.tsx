import { useEffect } from "react";
import { getAuth, signOut } from "firebase/auth";
import { useNavigate, useLocation } from "react-router-dom";

export default function Logout() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const auth = getAuth();
    signOut(auth)
      .catch(() => {
        // ignore and still redirect
      })
      .finally(() => {
        const from = (location.state as any)?.from?.pathname || "/login";
        navigate(from, { replace: true });
      });
  }, [navigate, location.state]);

  return (
    <div className="min-h-[200px] flex items-center justify-center text-sm text-zinc-500">
      Signing out…
    </div>
  );
}
