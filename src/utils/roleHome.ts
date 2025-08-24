export type Claims = Record<string, any> | null | undefined;

export function claimsToHome(claims: Claims): string {
  if (!claims) return "/login";
  // Explicit role takes precedence if present
  const role: string | undefined = (claims as any).role;
  const isSuperAdmin = Boolean((claims as any).super_admin);
  const isOwner = Boolean((claims as any).owner);
  const isAdmin = Boolean((claims as any).admin);
  const isEmployee = Boolean((claims as any).employee);
  const isClient = Boolean((claims as any).client);

  if (role === "super_admin" || role === "owner" || role === "admin")
    return "/";
  if (role === "employee") return "/employee";
  if (role === "client") return "/client";

  if (isSuperAdmin || isOwner || isAdmin) return "/";
  if (isEmployee) return "/employee";
  if (isClient) return "/client";

  return "/";
}
