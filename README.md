## Cleveland Clean Solutions V2 (SPA)

React + Vite + TypeScript + Tailwind SPA that shares the SAME Firebase project as V1. No migrations.

### Scripts

- `npm run dev` – start dev server
- `npm run build` – typecheck + build
- `npm run preview` – preview build

### Tailwind

Configured via `tailwind.config.js` and `src/styles/tailwind.css`. Entry imports `src/index.css` which includes Tailwind.

### Firebase configuration

Create `.env.local` in project root and paste values from V1 (see `ClevelandCleanSolutionsProject/public/js/firebase-config.js`). Example:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=cleveland-clean-portal.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=cleveland-clean-portal
VITE_FIREBASE_STORAGE_BUCKET=cleveland-clean-portal.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=938625547862
VITE_FIREBASE_APP_ID=1:938625547862:web:3655b2b380b858702705f7
VITE_FIREBASE_MEASUREMENT_ID=G-7KZMMKZ1XW
```

The app uses `src/services/firebase.ts` to initialize; it does not change schemas and reads from the same Firestore as V1.

### Env vars

- Required: `VITE_FIREBASE_*` as above
- Optional: `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_SENDGRID_KEY` (for future stubs)

### Routing & Guards

- Router in `src/app/router.tsx`
- `ProtectedRoute` checks auth; `RoleGuard` supports `super_admin`, `owner`, `admin` (future)

### Status mapping (UI only)

Legacy "Completed" → render as `approved`; legacy "Pending Approval" → `completed_pending_approval`. See `src/services/statusMap.ts`.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

## Social Posting (Design - Safe Connector Model)

Collections:

- `socialConnectors` — { provider: 'facebook'|'instagram'|'tiktok'|'linkedin', pageId, status, createdAt }
- `socialOutbox` — { provider, caption, mediaAssetId?, scheduledAt, status: 'pending'|'sent'|'failed', resultIds, createdAt, createdBy }

UI:

- `src/features/marketing/Social.tsx`
  - Tabs: Connectors (metadata list + instructions), Composer (queue posts), Scheduled (pending/sent)
  - Composer: choose provider(s), optional mediaAssetId (from Media Library), caption, schedule datetime, queues one doc per provider.

Backend plan (to implement later):

- Cloud Function worker polls `socialOutbox` for `status=='pending'` and `scheduledAt<=now`.
- Uses provider access tokens stored in Secret Manager; no tokens in code or Firestore.
- For each doc: posts via provider API; on success set `status='sent'` and append response IDs to `resultIds`.
- On failure: set `status='failed'`, record error metadata (e.g. lastError, lastAttemptAt), and schedule exponential backoff retries with a capped max attempts (e.g., 5).
- Consider idempotency keys to avoid duplicate posts on retries.
- Rate limiting: batch or delay per provider to respect API limits.

Security & Roles:

- Only `owner`/`super_admin`/`admin`/`marketing` can queue posts; employees read-only.
- Firestore Rules (suggested): allow create on `socialOutbox` for allowed roles; read for employees; `socialConnectors` read for all authenticated.

Notes:

- No live connectors or API keys are used yet. This is a safe, metadata-only design.
