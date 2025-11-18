export type Claims = Record<string, any> | null | undefined;

export type CanonicalRole =
  | "super_admin"
  | "owner"
  | "admin"
  | "employee"
  | "client";

const ROLE_PRIORITY: CanonicalRole[] = [
  "super_admin",
  "owner",
  "admin",
  "employee",
  "client",
];

function normalizeRoleInput(role: unknown): CanonicalRole | null {
  if (typeof role !== "string") return null;
  const value = role.trim().toLowerCase();
  return ROLE_PRIORITY.includes(value as CanonicalRole)
    ? (value as CanonicalRole)
    : null;
}

export function getRole(
  claims: Claims,
  fallback?: string | null
): CanonicalRole | null {
  const candidates = new Set<CanonicalRole>();
  const direct = normalizeRoleInput((claims as any)?.role);
  if (direct) candidates.add(direct);
  const fallbackRole = normalizeRoleInput(fallback);
  if (fallbackRole) candidates.add(fallbackRole);
  for (const role of ROLE_PRIORITY) {
    if ((claims as any)?.[role]) candidates.add(role);
  }
  for (const role of ROLE_PRIORITY) {
    if (candidates.has(role)) return role;
  }
  return null;
}

export function hasRole(
  claims: Claims,
  role: CanonicalRole,
  fallback?: string | null
): boolean {
  const resolved = getRole(claims, fallback);
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


