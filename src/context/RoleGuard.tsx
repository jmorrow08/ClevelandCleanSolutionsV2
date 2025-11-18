import { type ReactNode } from "react";
import { useAuth } from "./AuthContext";

type Role = "super_admin" | "owner" | "admin" | "employee" | "client";

function hasRole(claims: Record<string, unknown> | null, role: Role): boolean {
  if (!claims) return false;
  if (typeof claims.role === "string" && claims.role === role) return true;
  return Boolean(claims[role]);
}

export function RoleGuard({
  allow,
  children,
}: {
  allow: Role[];
  children: ReactNode;
}) {
  const { claims } = useAuth();
  const can = allow.some((role) => hasRole(claims, role));
  if (!can) return null;
  return children;
}

export function HideFor({
  roles,
  children,
}: {
  roles: Role[];
  children: ReactNode;
}) {
  const { claims } = useAuth();
  const shouldHide = roles.some((role) => hasRole(claims, role));
  if (shouldHide) return null;
  return children;
}
