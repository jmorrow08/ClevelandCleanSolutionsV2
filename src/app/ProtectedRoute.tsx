import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useEffect, useRef } from "react";
import { useToast } from "../context/ToastContext";

type Props = {
  requireRole?: "admin-or-above" | "employee-or-above" | "client-or-above";
};

type Claims = Record<string, any> | null | undefined;
type RoleName = "super_admin" | "owner" | "admin" | "employee" | "client";

function hasRole(claims: Claims, role: RoleName): boolean {
  if (!claims) return false;
  if (typeof (claims as any).role === "string" && (claims as any).role === role)
    return true;
  return Boolean((claims as any)[role]);
}

function isAdminOrAbove(claims: Claims): boolean {
  return (
    hasRole(claims, "super_admin") ||
    hasRole(claims, "owner") ||
    hasRole(claims, "admin")
  );
}

function isEmployeeOrAbove(claims: Claims): boolean {
  return (
    isAdminOrAbove(claims) ||
    hasRole(claims, "employee")
  );
}

function isClientOrAbove(claims: Claims): boolean {
  return (
    isAdminOrAbove(claims) ||
    hasRole(claims, "client")
  );
}

export default function ProtectedRoute({ requireRole }: Props) {
  const { user, loading, claims } = useAuth();
  const { show } = useToast();
  const warnedRef = useRef(false);

  // Only compute authorization if claims have been loaded (not null/undefined)
  // This prevents showing authorization errors during the initial claims fetch
  let authorized = true;
  if (requireRole && claims !== null) {
    if (requireRole === "admin-or-above") authorized = isAdminOrAbove(claims);
    if (requireRole === "employee-or-above")
      authorized = isEmployeeOrAbove(claims);
    if (requireRole === "client-or-above") authorized = isClientOrAbove(claims);
  }

  // Side-effects (toasts) must not run during render
  useEffect(() => {
    if (loading) return;
    if (!user && !warnedRef.current) {
      warnedRef.current = true;
      show({ type: "info", message: "Please sign in to continue." });
    }
  }, [loading, user, show]);

  useEffect(() => {
    if (loading) return;
    // Only show authorization error if claims have been loaded and user is still unauthorized
    if (
      user &&
      requireRole &&
      claims !== null &&
      !authorized &&
      !warnedRef.current
    ) {
      warnedRef.current = true;
      show({
        type: "error",
        message: "You are not authorized to access this area.",
      });
    }
  }, [loading, user, requireRole, authorized, claims, show]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  // Only redirect if claims have been loaded and user is unauthorized
  if (requireRole && claims !== null && !authorized)
    return <Navigate to="/login" replace />;

  return <Outlet />;
}
