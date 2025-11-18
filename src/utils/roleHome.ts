import { getRole } from "@/auth/claims";

export type Claims = Record<string, any> | null | undefined;

export function claimsToHome(
  claims: Claims,
  fallbackRole?: string | null
): string {
  if (!claims) return "/login";
  const role = getRole(claims, fallbackRole);
  if (role === "employee") return "/employee";
  if (role === "client") return "/client";
  if (role === "super_admin" || role === "owner" || role === "admin") {
    return "/";
  }
  return "/";
}
