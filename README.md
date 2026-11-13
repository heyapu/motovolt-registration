# Motovolt dashboard passcode reset

This is an additive update for the existing dashboard. No customer registrations, dealers, Google Sheets rows, OTPs or payment records are changed. No new npm package is needed; the server calls Resend's API directly.

## 1. Configure Vercel

Confirm notification.motovolt.co has verified sending status in Resend. Add these Production environment variables (also Preview only if you intend to test that environment):

```env
RESEND_API_KEY=your-existing-resend-api-key
RESEND_FROM_EMAIL=Motovolt Dashboard <no-reply@notification.motovolt.co>
DASHBOARD_RESET_EMAIL=the-authorized-company-inbox@motovolt.co
APP_ORIGIN=https://dealers.motovolt.co
```

Replace the authorized inbox placeholder with a real company-controlled inbox. This is the ONLY address that can receive a reset. Anyone who controls this inbox can change the shared dashboard/dealer/finance administration passcode. Changing the configured inbox requires changing the server environment and redeploying; there is no public email-registration feature.

Keep these values server-side; do not prefix them NEXT_PUBLIC_. Keep your existing Supabase and Upstash variables unchanged. The Resend API key must permit sending from the verified subdomain. In Resend domain settings, disable click tracking for reset messages; the reset link uses a URL fragment to keep the token out of HTTP access logs. No receiving mailbox on notification.motovolt.co is required for this sender-only flow.

## 2. Run the NEW SQL migration

Paste the complete file supabase/migrations/202611130002_dashboard_reset.sql into Supabase SQL Editor and run it once. It requires the existing dashboard migration. Do not reset the database or rerun older seed migrations.

The migration adds a private reset-token table and two service-role-only RPCs. Rerunning this new migration preserves the current access code. It doesn't reset the access code until someone completes a valid reset link.

## 3. Copy code and deploy

Copy the supplied src files into matching project paths. Keep your existing files not included here. Optional: copy the test file into tests. Run npm run typecheck, then npm run build, and deploy normally.

## 4. Add a link to the existing login screens

In src/components/dashboard/Dashboard.tsx, in the passcode login form, place this immediately AFTER its submit button:

```tsx
<a href="/reset-pass">Forgot access code?</a>
```

You can add the same link to the passcode login form in src/components/dealers/DealerManager.tsx. This is optional: the page is directly available at https://dealers.motovolt.co/reset-pass.

## 5. Test carefully

1. Open /reset-pass and enter the configured DASHBOARD_RESET_EMAIL.
2. Check the inbox (and spam) for the Motovolt reset email. Resend's Emails dashboard shows delivery status. The page intentionally gives the same response for an unapproved email and delivery failures.
3. Open the link within 15 minutes. Choose a unique 12–64-character access code without spaces, and confirm it. Merely opening the link does not consume it.
4. Completing the reset updates the existing scrypt hash, increments its version and invalidates ALL dashboard, dealer and finance management sessions. Share the new code with the authorized team using your normal secure method.
5. Sign in with the new code. The old code and any used/previous reset links must fail. The normal 15-day session still applies after signing in.

Requesting a link does not change the current passcode or sign anyone out. A request doesn't invalidate other pending links; completing a reset invalidates all of them. Tokens are random 32-byte values; only their SHA-256 hashes are stored in Supabase. Links are removed from the address bar on page load, so if you refresh the reset form before finishing, reopen the original email link.

IP, global and mailbox limits use the existing Upstash limiter. Request limits: 4/IP/hour, 40 global/hour and 3 approved-mailbox sends/hour. Completion limits: 8/IP/15 minutes and 100 global/15 minutes. The mailbox limit can be temporarily exhausted by someone who knows the approved email; the existing SQL-owner manual reset remains an administrative fallback. No public response confirms which email is approved. Timing padding reduces the normal mismatch signal but does not guarantee constant-time third-party email delivery.

## Troubleshooting

- No email: check verified Resend sending domain, sender address, key permissions, configured approved inbox and Resend delivery logs. Vercel logs dashboard_reset_delivery_failed without logging the address, token or provider response. A rate-limited request may need an hour before another delivery attempt.
- Invalid/expired link: request another link; links last 15 minutes and old links stop working after any successful reset.
- 503 when completing: confirm the NEW migration was applied to the Supabase project configured in Vercel. Existing SUPABASE_SECRET_KEY must be a server-side service-role/secret key.
- No page: ensure the new src files were deployed, not only the environment variables.

## Validation

TypeScript and production build checked. Automated tests cover scrypt compatibility, invalid code rejection, unknown/expired/reused links, version invalidation, session deletion, business-data preservation, public-role RPC denial and safe migration reruns. No live reset emails or production changes were performed; complete the browser/email delivery check after deployment.
