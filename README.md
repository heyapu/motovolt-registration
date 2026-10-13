# Motovolt public customer form

A simple form with no staff login. Enter the customer's Indian mobile number, complete the security check, verify the MSG91 OTP, fill in the details, and submit. Dealer name is a normal input: the store where the vehicle was bought.

Stack: Next.js, TypeScript/TSX, SCSS modules, Supabase PostgreSQL, MSG91 SendOTP, Google Sheets API, Upstash Redis and Cloudflare Turnstile. Supabase Auth is not used. No staff account, password or dealer provisioning is needed.

## 1. Use this project

Extract `motovolt-public-form.zip` and open the `motovolt-public-form` folder. This replaces the previous authenticated application. Keep your existing environment values in `.env.local` in this new folder; the download contains only `.env.example`.

Use Node.js 22 or newer:

```bash
npm ci
```

Do not overwrite your configured `.env.local`. If starting fresh, copy `.env.example` to `.env.local` and fill its values.

## 2. Push the database first

In your Supabase project's SQL Editor, run the complete contents of:

```text
supabase/migrations/202610130002_public_form.sql
```

The separately provided `Motovolt-public-form-database.sql` contains the same migration. Run one copy, once, as the database owner. A repeated run will report that objects already exist. Do not run another database wipe.

This creates new `form_*` tables, functions and a row sequence. It does not need the Auth schema and does not delete or import tables from the previous application. Previous registrations or existing Sheet records need an explicit import if they should participate in duplicate checks.

The database contains the four products automatically. All customer and OTP tables have RLS enabled and anonymous/authenticated API roles have no table or function permissions. Only the server's Supabase secret/service-role key can execute the application's operations.

Verify setup:

```sql
select id, name from public.form_products order by id;
```

Expected products: URBN, Hum, Kivo and M7.

## 3. Check the existing environment

Keep all secrets on the server. Do not rename them with a `NEXT_PUBLIC_` prefix and do not paste the completed environment file into chat or source control.

| Variable | Value |
| --- | --- |
| `APP_ORIGIN` | Exact browser origin, e.g. `http://localhost:3000` locally or your deployed HTTPS URL; no path |
| `SUPABASE_URL` | Your project's URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key or legacy service-role key; never the anon/publishable key |
| `MSG91_AUTH_KEY` | Existing MSG91 server auth key |
| `MSG91_TEMPLATE_ID` | Approved **SendOTP** template ID, 24 hexadecimal characters |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `OTP_HMAC_SECRET` | Independent random secret, at least 32 characters |
| `CRON_SECRET` | Different random secret, at least 32 characters |
| `TURNSTILE_SITE_KEY` | New Turnstile widget site key |
| `TURNSTILE_SECRET_KEY` | New Turnstile widget secret key |
| `GOOGLE_SHEET_ID` | Spreadsheet ID from your existing Sheet URL |
| `GOOGLE_SHEET_TAB` | Exact worksheet/tab title; default is `Test Rides` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Complete service-account JSON on one line, retaining private key `\n` escapes |
| `SHEETS_ENABLED` | `true` |
| `DEMO_MODE` | `false` for real data |
| `OTP_PROVIDER` | `msg91` |
| `OTP_DAILY_SEND_LIMIT` | Default `1000`; lower it to your intended daily budget |

Generate each random secret separately:

```bash
openssl rand -hex 32
```

An existing Supabase publishable key variable can be left in your environment, but this application does not use it. Use the exact deployed origin in `APP_ORIGIN` and redeploy after changing environment values.

MSG91 must have a working approved SendOTP template and sufficient balance. The template should describe a six-digit OTP valid for ten minutes, matching this code. An SMS Flow template or DLT numeric template ID is not a SendOTP template ID. This application sends its own cryptographically generated OTP through SendOTP, stores only an HMAC digest, and also calls MSG91 VerifyOTP before accepting verification.

## 4. Add the bot check

In Cloudflare, open **Turnstile**, choose **Add widget**, name it `Motovolt form`, add your deployed hostname (and `localhost` for local real-service testing), and choose **Managed** mode. Copy its site key and secret key into the two Turnstile environment variables.

You do not need to move your domain/DNS to Cloudflare. This form renders the widget and checks its token on the server, including the expected hostname, action and anonymous browser identifier. Real-service mode rejects the standard testing keys. A failed/unavailable bot check prevents a new paid SMS; there is no bypass flag in production.

Official setup: [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/) and [widget creation](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/).

## 5. Connect your existing Google Sheet

You already enabled the Sheets API and configured the environment. Check these remaining details:

1. Open the service-account JSON locally and find `client_email`.
2. Share the spreadsheet with that email as an **Editor**. Do not make it public.
3. Set `GOOGLE_SHEET_TAB` to the exact tab title.
4. Keep the first nine headers exactly as you supplied. Leave J–N empty, or add the five headers below.

The writer preserves A–I and automatically fills J–N if all five extra header cells are empty. It stops for review if headers conflict.

| Column | Header | Source |
| --- | --- | --- |
| A | Record ID | Server-generated submission UUID |
| B | Dealer name | Plain store/dealer input |
| C | Contact number | OTP-verified number, normalized to `+91…` |
| D | Customer name | Name input |
| E | Vehicle name | Selected URBN, Hum, Kivo or M7 |
| F | Test ride on | Blank: this purchase form does not collect a test ride date |
| G | Verified at | Server verification timestamp |
| H | Submitted at | Server submission timestamp |
| I | Staff ID | Blank: there is no staff login |
| J | Email | Email input |
| K | Age | Whole years |
| L | Battery ID | Optional input |
| M | VIN number | Optional input |
| N | Payment mode | Cash, UPI, Credit Card / Debit Card, or Finance |

Header row, ready to paste into A1:

```tsv
Record ID	Dealer name	Contact number	Customer name	Vehicle name	Test ride on	Verified at	Submitted at	Staff ID	Email	Age	Battery ID	VIN number	Payment mode
```

Start with a tab containing the header row and empty data rows. New records are assigned fixed rows beginning at row 2. If that tab already contains customer rows, use a fresh tab or arrange a reviewed data import/sequence adjustment first. Old Sheet rows are not automatically imported into Supabase or included in duplicate checks.

Each registration always writes the same fixed row with `RAW` cell values. Retrying after a lost response therefore updates that record's own row instead of appending another copy. The writer refuses to overwrite a row occupied by a different Record ID or unidentified data. Keep the raw tab in its original row order; use filter views or a separate report tab for sorting. Inserting/deleting/sorting data rows would invalidate the row mapping.

## 6. Run the form

For real services:

```bash
npm run env:check
npm run dev
```

Open `http://localhost:3000`. The environment check validates configuration shape, not credentials or provider connectivity.

To try the form locally without any configured accounts or paid SMS:

```bash
npm run dev:demo
```

Use a valid Indian mobile number and OTP **123456**. There is no login. The banner clearly marks the demo; no external SMS, database or Sheet writes occur. Demo data is in memory and disappears when the development server restarts. Demo mode is forbidden in a production runtime.

For deployment, use a Node.js Next.js host such as Vercel, add the server environment variables there, set the real HTTPS `APP_ORIGIN`, and use:

```bash
npm run build
npm run start
```

Do not use a static export. The OTP, database and Sheets operations require server routes. The host must support at least 60-second function execution for submissions and the retry endpoint.

## 7. Add the retry schedule after deployment

The form attempts Google Sheets immediately on submission. A schedule is needed to recover pending writes if Google fails or the request is interrupted. It is not needed to receive the first form submission.

Supabase commits the registration and its retry job in one transaction before contacting Google. Google Sheets is the everyday business view and Supabase is the durable backup/duplicate authority. The two services cannot be committed atomically; the receipt accurately shows `sync pending` until the Sheet write succeeds.

In Supabase Vault, create these two secrets once, through the dashboard or SQL Editor:

```sql
select vault.create_secret(
  'https://YOUR_DEPLOYED_FORM_HOST',
  'motovolt_public_app_origin'
);
select vault.create_secret(
  'YOUR_EXACT_CRON_SECRET_FROM_THE_APP_ENV',
  'motovolt_public_cron_secret'
);
```

Use your deployed app URL here, not the Supabase project URL or localhost. Keep the cron secret out of committed SQL. If these Vault names already exist, update their existing values rather than creating new secrets with the same names.

Then run:

```text
supabase/schedule.sql
```

This enables `pg_cron`/`pg_net`, retries up to five queued records every minute, and clears expired/unlinked OTP state hourly. The retry endpoint requires the machine's `CRON_SECRET`; this does not introduce user login. If an old portal's cron jobs remain, disable those old job names before relying on this replacement application.

Official references: [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions), [Vault](https://supabase.com/docs/guides/database/vault).

## 8. Duplicate and abuse rules

One registration per normalized phone number, across every dealer/store name. Changing the dealer name does not bypass this. A supplied VIN or Battery ID is also globally unique after trimming and uppercasing. Blank optional identifiers are stored as `NULL` and do not collide. Customer names and email addresses are not unique keys.

The pre-submit check gives useful messages; database unique constraints enforce the same rules when requests race. A verified number can create one registration. Repeated submissions with the same request ID/details return the original receipt. Different details cannot edit that record. The app and even normal service-role SQL updates/deletes are blocked by an immutable-record trigger; database-owner administration is separate.

Protection includes server-validated Turnstile before new OTP sends, a hidden honeypot, signed HttpOnly/SameSite browser binding, strict request validation, same-origin POST checks, request-size limits, RLS, server-only provider keys, and Redis rate limits. Redis or CAPTCHA failures stop new requests rather than disabling the protections.

Default limits:

| Action | Limit |
| --- | --- |
| OTP resend | One paid send per phone per 60 seconds |
| OTP per phone | Three sends per 15 minutes |
| OTP per anonymous browser | Five sends per 15 minutes |
| OTP per IP | Ten sends per 15 minutes |
| OTP total | `OTP_DAILY_SEND_LIMIT` per rolling 24 hours |
| Wrong codes | At most five checks per challenge; then locked |
| Verification requests | 30 per browser / 120 per IP per 15 minutes |
| Submissions | 30 per browser / 120 per IP per minute |

The per-IP limit is shared by dealers on the same office network. Adjust these defaults in `src/lib/server/limits.ts` after measuring legitimate volume. Vercel's trusted ingress IP header is used only on Vercel. Other production hosts share one conservative IP bucket until their verified proxy handling is explicitly configured; spoofable `X-Forwarded-For` is ignored.

No public form can be guaranteed hack-proof or scam-proof. OTP proves access to the phone at verification time. It does not prove the typed dealer name, purchase, age, email ownership, vehicle IDs or payment. There is no payment collection. Anyone with the link can try to submit; if access must be internal-only, restrict the deployment to your company network/IPs. No employee identity or staff attribution is implied by this version.

## 9. Internet interruption

OTP sending and verification require internet. After successful verification, the open form can be filled offline; details are saved to that browser's IndexedDB. Submitting offline queues one frozen draft, and the open page retries when connection returns. A confirmed record is shown as submitted and locked. A definite duplicate/invalid-data rejection keeps the unsaved details editable.

The OTP lasts ten minutes and verified permission lasts sixty minutes. If verification expires before a new submission reaches the server, reverify the same number; the current draft remains. A lost successful submission response can still be reconciled/retried to the original receipt without a second registration.

Use one active form tab per browser. Local drafts and anonymous browser identity last at most 24 hours. Closing the browser stops retries; reconnect and reopen while that identity is still valid. Clearing cookies/site data, switching browsers, or cookie expiry prevents access to the earlier browser-bound draft/receipt. A fully offline page reload is not guaranteed to restore a connected form. On shared devices, finish the entry and choose **Record another customer**; unfinished local drafts contain customer data.

## 10. Verify with your own environment

Before sharing the deployed URL, make one real registration using a phone/vehicle ID that has not previously been registered. Check that its receipt says it reached Google Sheets, its A–N values match the Supabase row, and a second attempt with the same number is rejected. Test a lower-case duplicate VIN and Battery ID too. Use a separate staging project/tab for test data because confirmed records are deliberately locked.

Automated checks:

```bash
npm run check
npm run test:api
```

At delivery, TypeScript checking, production build, **36 unit/database tests** and **44 local HTTP checks** passed. These cover OTP/provider guards, expiry, browser ownership, duplicate constraints, immutable/idempotent submissions, RLS permissions, CAPTCHA token checks, occupied Sheet rows and fixed fourteen-cell writes. Provider requests in unit tests are mocked; the HTTP checks use only the isolated local demo.

Four Playwright browser scenarios are included for mobile/offline completion, a lost response, origin/browser guards, and duplicate correction. They require a Chromium installation and were not run in the delivery environment:

```bash
npx playwright install chromium
npm run test:e2e
```

Actual MSG91, Turnstile, Upstash, hosted Supabase, cron and Google credentials must still be tested in your environment. No production credentials were bundled or accessed.

## 11. Diagnose a pending Sheet write

In the Supabase SQL Editor:

```sql
select status, count(*) from public.form_sheet_jobs group by status;
select submission_id, status, attempts, last_error, available_at
from public.form_sheet_jobs
where status <> 'done'
order by available_at;
```

Retries use backoff and stop for review after twelve attempts. Fix missing Sheet sharing, wrong tab title, conflicting headers or occupied mapped rows first. Then reset only the affected job, replacing the placeholder UUID:

```sql
update public.form_sheet_jobs
set status='pending', attempts=0, available_at=now(),
    lease_owner=null, lease_until=null, last_error=null
where submission_id='AFFECTED_RECORD_UUID'::uuid
  and (status='needs_attention' or status='pending');
```

Do not reset the row sequence or delete the database while leaving old Sheet rows in place. That breaks duplicate history and row ownership. Do not remove a pending registration merely because Google is temporarily unavailable; the saved Supabase record is the recoverable backup.

## Files to edit

- Form: `src/components/PublicForm.tsx`
- Styling: `src/components/PublicForm.module.scss`
- Validation: `src/lib/validation.ts`
- Limits: `src/lib/server/limits.ts`
- OTP adapter: `src/lib/server/msg91.ts`
- Sheet columns: `src/lib/sheet-layout.ts` and migration's `form_claim_sheet_jobs`
- Database: `supabase/migrations/202610130002_public_form.sql`
- Scheduled retries: `supabase/schedule.sql`

Schema changes after initial installation need a new migration; do not edit and rerun the original create script on a live database.
