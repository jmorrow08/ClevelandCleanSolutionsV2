import { type ReactNode } from "react";
import { useAuth } from "./AuthContext";

export function RoleGuard({
  allow,
  children,
}: {
  allow: Array<
    "super_admin" | "owner" | "admin" | "marketing" | "employee" | "client"
  >;
  children: ReactNode;
}) {
  const { claims } = useAuth();
  const can = allow.some((r) => claims?.[r]);
  if (!can) return null;
  return children;
}

export function HideFor({
  roles,
  children,
}: {
  roles: Array<
    "super_admin" | "owner" | "admin" | "marketing" | "employee" | "client"
  >;
  children: ReactNode;
}) {
  const { claims } = useAuth();
  const shouldHide = roles.some((r) => claims?.[r]);
  if (shouldHide) return null;
  return children;
}
