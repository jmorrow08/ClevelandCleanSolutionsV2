import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type Props = { requireRole?: "super_admin" | "owner" | "admin" };

export default function ProtectedRoute({ requireRole }: Props) {
  const { user, loading, claims } = useAuth();

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  if (requireRole) {
    const hasRole = Boolean(claims?.[requireRole]);
    if (!hasRole) return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

