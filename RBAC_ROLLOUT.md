# RBAC rollout runbook (Firebase + Vite app)

## 1) Deploy rules and functions

Prereqs: Firebase CLI logged in; project set via `firebase use <projectId>`.

```bash
# Firestore + Storage rules
firebase deploy --only firestore:rules,storage:rules

# Cloud Functions (claims management, bootstrap)
firebase deploy --only functions
```

## 2) Seed the initial super_admin (one-time)

Option A: local script using a service account:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
node scripts/ensureSuperAdmin.js info@clevelandcleansolutions.com
```

Option B: If a super_admin already exists, call the function to grant others:

```ts
const fn = httpsCallable(getFunctions(), "grantSuperAdminByEmail");
await fn({ email: "info@clevelandcleansolutions.com" });
```

## 3) Verify owner/super_admin toggle behavior (manual)

- Sign in as owner. Use the toggle in the header to switch between Admin and Employee portals.
- Sign in as super_admin. Confirm the toggle is visible and functional.

## 4) Role assignment flow

- Super admin: can assign any role via HR modal (uses callable `setUserRole`).
- Owner: can assign only `admin` or `employee` (client and higher roles hidden/blocked).
- Admin/Employee/Client: cannot modify roles.

## Role quick-reference and dual-mode behavior

- **Super admin (dev impersonation user)** – Full Firebase + Cloud Functions access. Only role that can: deploy rules, assign any role (including super_admin/owner), delete sensitive documents, or use `/tools/role-manager`.
- **Owner** – Full admin portal access + HR/Finance controls. Owners can also switch into the employee portal; when they do, they now inherit the same Firestore/Storage permissions as employees *provided their `users/{uid}` document stores a valid `profileId`.*
- **Admin** – Admin portal only. No access to owner-only finance pages, cannot switch into employee mode, and cannot mutate privileged settings.
- **Employee** – Employee portal (jobs/photos/notes/time tracking). No access to admin portal routes.
- **Client** – Client portal routes and client-visible media only.

| Role         | Admin Portal | Employee Portal | Client Portal | Notes |
| ------------ | ------------ | ---------------- | ------------- | ----- |
| super_admin  | ✅            | 🚫               | ✅             | Use for dev/admin tooling only; continue validating UX with delegated accounts. |
| owner        | ✅            | ✅ (via Portal Mode toggle) | ✅ | Requires `users/{uid}.profileId` to link to their employee record before employee view appears. |
| admin        | ✅            | ✅ (via Portal Mode toggle) | ✅ | Also needs `profileId` to log hours/upload photos. |
| employee     | 🚫            | ✅                | 🚫            | Default employee portal only. |
| client       | 🚫            | 🚫                | ✅            | Client portal only. |

Portal mode reminders (owner/admin ↔ employee):

1. Ensure every owner that needs employee features keeps their user document linked to the appropriate employee profile ID. If the link is removed, both service photo uploads and general job notes will be denied by rules (and the UI will now display the warning).
2. Owners retain admin-level reads even while acting as employees, but write surfaces that require an employee profile (service photos, job notes, time tracking) validate the `profileId`.
3. The “dev user” mentioned in operations corresponds to the `super_admin` role; no separate role name is necessary, but these users should be provisioned sparingly since they bypass all other checks.
4. Quick pre-check before onboarding a dual-role user: in Firestore, inspect `users/{uid}` and confirm both `role` and `profileId` are set. The UI now surfaces a badge and warnings, but this manual verification prevents last-minute surprises.

## 5) Tests (emulator)

```bash
pnpm vitest run test/emulator/rules/rbac.test.ts
# or
npm run test -- test/emulator/rules/rbac.test.ts
```

What is covered:
- Settings writes denied for non–super_admin; allowed for super_admin.
- Owner/admin/employee read access patterns.
- Storage user-folder ownership checks.
- Direct Firestore role mutation denied (must use callable).

## 6) Post-deploy checklist

- HR role dropdown reflects caller’s privileges.
- Attempting to elevate privileges directly in Firestore is denied.
- Storage uploads/reads behave as expected for employees vs admins.
- Monitor Cloud Functions logs for `permission-denied` spikes.

## 7) Notes

- No secrets in client code. All privileged role changes go through Functions.
- Firestore rules prohibit client-side `users.role` writes (except super_admin).
- Owner’s toggle is UI-only; server permissions are enforced by rules.
