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


