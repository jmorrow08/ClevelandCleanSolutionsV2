# Stripe Integration Audit

Date: 2025-11-14

## Code & Rules References

- `firestore.rules` + `firestore.rules.additions` contain a "Stripe Extension Collections" section. Access is restricted to authenticated users interacting with the Firebase `firestore-stripe-payments` extension:
  - `/customers/{uid}` base doc: read-only for the authenticated user.
  - `/customers/{uid}/checkout_sessions/{sessionId}`: clients may create sessions with limited fields (price, quantity, URLs, etc.); the extension writes back `url`/`error`.
  - `/customers/{uid}/payments/{paymentId}`: read-only ledger populated by the extension.
- `src/features/client/Billing.tsx` is the only UI code touching Stripe data. It reads invoices from Firestore and then lists extension payments from `/customers/{uid}/payments`, falling back to non-ordered fetches if composite indexes are missing. There is no initiation of checkout sessions or client-side payment capture logic.
- No Cloud Functions reference Stripe libraries (`rg -n "stripe" functions` returns nothing). There is no server-side payment orchestration or Stripe webhook handler.
- Env configs / `.env` files: no `STRIPE_*` variables exist in the repo (`rg -n "STRIPE" -i` yields only the files noted above). The project currently relies exclusively on Firebase extensions with implicit credentials.
- Firestore documents such as `invoices` are not cross-linked to Stripe objects; matching occurs via `payeeEmail` comparisons only.

## Missing Pieces / Gaps

1. **No checkout creation in UI** – although Firestore rules allow `checkout_sessions` creation, there is no React component invoking it. Clients cannot start payments from the portal.
2. **No webhook listener** – the repo lacks a Cloud Function to consume Stripe webhooks (payments succeeded, payouts, etc.), so downstream systems will not update automatically.
3. **No Stripe Connect / ACH prep** – there is no mention of Stripe Connect onboarding, accounts, or payout profiles. ACH/Connect work remains entirely to-do.
4. **No env management** – absence of `STRIPE_PUBLISHABLE_KEY`/`STRIPE_SECRET_KEY` variables implies Stripe JS isn’t initialized and server code cannot authenticate with Stripe directly.
5. **No client-side Stripe Elements** – no React components load `@stripe/stripe-js` or render card entry forms.

## Next Steps (when ready)

1. Add environment variables (`STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, optional Connect keys) and wire them into Vite + Cloud Functions.
2. Build a client-side checkout flow: call the extension to create checkout sessions, handle redirects, surface statuses in the Billing UI.
3. Implement webhook verification inside Cloud Functions to reconcile invoices/timesheets after payment success.
4. For future Connect/ACH work, design account-link onboarding UIs and server handlers (using `stripe.accounts.create`, `accountLinks.create`, etc.).
5. Document the Stripe data model (customers, prices, products) and add admin tooling to audit mismatches between Firestore invoices and Stripe charges.

Until these gaps are addressed, Stripe integration remains read-only (payments listing) and cannot process real transactions.
