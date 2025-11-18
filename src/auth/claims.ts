export type Claims = Record<string, any> | null | undefined;

export type CanonicalRole =
  | "super_admin"
  | "owner"
  | "admin"
  | "employee"
  | "client";

export function getRole(claims: Claims): CanonicalRole | null {
  const direct =
    claims && typeof (claims as any).role === "string"
      ? ((claims as any).role as string)
      : null;
  const roles: CanonicalRole[] = [
    "super_admin",
    "owner",
    "admin",
    "employee",
    "client",
  ];
  if (direct && roles.includes(direct as CanonicalRole)) {
    return direct as CanonicalRole;
  }
  for (const r of roles) {
    if ((claims as any)?.[r]) return r;
  }
  return null;
}

export function hasRole(claims: Claims, role: CanonicalRole): boolean {
  const resolved = getRole(claims);
  return resolved === role || Boolean((claims as any)?.[role]);
}

export function isAdminOrAbove(claims: Claims): boolean {
  return (
    hasRole(claims, "super_admin") ||
    hasRole(claims, "owner") ||
    hasRole(claims, "admin")
  );
}

export function isEmployeeOrAbove(claims: Claims): boolean {
  return isAdminOrAbove(claims) || hasRole(claims, "employee");
}

export function isClientOrAbove(claims: Claims): boolean {
  return isAdminOrAbove(claims) || hasRole(claims, "client");
}


