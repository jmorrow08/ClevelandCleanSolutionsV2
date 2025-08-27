## Cleveland Clean Solutions V2 (SPA)

React + Vite + TypeScript + Tailwind SPA that uses the SAME Firebase project as V1 (no migrations).

### Quick start

- `npm install`
- Create `.env.local` in repo root with values from V1 (`ClevelandCleanSolutionsProject/public/js/firebase-config.js`):

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=cleveland-clean-portal.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=cleveland-clean-portal
VITE_FIREBASE_STORAGE_BUCKET=cleveland-clean-portal.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=938625547862
VITE_FIREBASE_APP_ID=1:938625547862:web:3655b2b380b858702705f7
VITE_FIREBASE_MEASUREMENT_ID=G-7KZMMKZ1XW
```

- `npm run dev` → open the URL it prints

### Scripts

- `npm run dev` – start dev server
- `npm run build` – typecheck + build
- `npm run preview` – preview the production build
- `npm run test` – run unit tests (Vitest + JSDOM)

### Environment variables

- Required: `VITE_FIREBASE_*` listed above
- Optional (reserved): `VITE_USE_FIREBASE_EMULATOR` ("true" to connect in dev)

### Firebase initialization

- Centralized in `src/services/firebase.ts` using the above env vars.
- The app reads the same Firestore and Auth as V1. No schema changes are introduced by V2.

### Emulator usage (optional, dev only)

If you run local emulators, set in `.env.local`:

```
VITE_USE_FIREBASE_EMULATOR=true
```

When `import.meta.env.DEV` and this flag is set, the app attempts to connect:

- Auth: `http://127.0.0.1:9099`
- Firestore: `127.0.0.1:8080`
- Functions: `127.0.0.1:5001` (used by finance payroll features)

### Routing, auth, roles

- Router: `src/app/router.tsx`
- Auth provider: `src/context/AuthContext.tsx` (loads custom claims and `profileId`)
- Role checks: `src/context/RoleGuard.tsx` supports `super_admin`, `owner`, `admin`, `marketing`, `employee`, `client`

### Status mapping (UI only)

Legacy → Canonical map in `src/services/statusMap.ts`:

- "Pending Approval" → `completed_pending_approval`
- "Completed" → `approved`

### Project structure (selected)

- `src/app` – layout, router, route guards
- `src/context` – Auth, Settings, Toast, RoleGuard
- `src/features` – feature modules (admin dashboard, finance, hr, scheduling, etc.)
- `src/services` – firebase config, queries, status mapping, pdf utils
- `src/styles` – Tailwind entry

### Tailwind

Configured via `tailwind.config.js` and `src/styles/tailwind.css` (imported by `src/index.css`).

### Notes

- Uses React 19, Vite 7, TypeScript 5, Tailwind 4.
- Shares Firebase config with V1; keep `.env.local` in V2 in sync with V1.
