# Motovolt dealer management update

This add-on moves the runtime dealer directory from `src/lib/dealers.ts` into Supabase. Open `/dealers` to add, edit, archive and restore dealers with the existing dashboard passcode. It uses the same protected 15-day dashboard session, without email/password accounts.

The public registration form keeps its searchable selector. Adding a dealer no longer requires editing code, running SQL, syncing analytics locations or deploying again.

## Install in this order

This update assumes your current dashboard and financer-name form updates are installed. Keep your current dependencies, environment variables, dashboard passcode, OTP settings and Google Sheet.

### 1. Prepare the initial import BEFORE replacing dealers.ts

From this package, copy only these two files into the matching locations in your existing project first:

- `scripts/prepare-dealer-migration.mjs`
- `supabase/migrations/202611130001_database_dealers.sql`

Leave your current `src/lib/dealers.ts` in place for this step. Open the terminal in your existing project root and run:

```powershell
node scripts/prepare-dealer-migration.mjs
```

This reads the current literal `DEALERS` array and writes it into the new migration's seed section. It does not execute the TypeScript file, contact Supabase or change the database. It checks for duplicate IDs and malformed fields. Your current IDs, names, cities, states and addresses are imported, including additions made since the previous handover.

Run this before the migration's FIRST database execution. The import only runs once in the database; rerunning SQL later intentionally will not overwrite administrative edits.

The supplied SQL already contains the latest 256-dealer list provided in this conversation, with Dealer 85 in Kolkata, West Bengal, and Dealer 260 in Delhi, Delhi. If your current TS directory is unchanged, you can use that seed directly. Preparing from your current file is preferred when it has changed.

### 2. Run the NEW migration in Supabase SQL Editor

Open the complete, prepared file:

`supabase/migrations/202611130001_database_dealers.sql`

Paste all of it into Supabase SQL Editor and run it. Do not run a database reset, the full original schema, or an old dashboard/dealer seed migration.

The migration runs in one transaction and:

- Reuses/creates `public.form_dealers`, keeping existing IDs and archived status.
- Imports the current directory once, preserving additional dealers already in the database.
- Adds an address, edit version and update timestamp to dealer records.
- Creates a cached active-dealer directory, rebuilt transactionally when a dealer changes.
- Adds protected database functions for list/add/edit/archive/restore.
- Blocks new registrations for archived or nonexistent dealers, and supplies the canonical dealer name in the database.
- Keeps the existing analytics location table synchronized as a compatibility projection, including archived dealers.

It never updates or deletes `form_registrations`, OTP records, payment proofs, sheet jobs, saved financer names or Google Sheets rows. It does not replace your existing `form_submit` function. Re-running it preserves dealer edits and archive choices.

### 3. Copy the remaining source files and deploy

Now copy the supplied `src`, `scripts` and `tests` files into the matching project locations. They are complete files, not JSX snippets. Keep the prepared migration from step 1; do not overwrite it with an unprepared copy.

Run:

```powershell
npm run typecheck
npm test
npm run build
```

Then deploy through your existing Vercel workflow. No new environment variables or packages are needed. This is a patch for your existing app, not a replacement project.

The update preserves the existing optional email, product variants, required VIN/Battery ID, finance selector and no-payment-upload form. The public Finance refresh button is removed, as requested earlier. Historical proof links remain viewable on old receipts.

### 4. Open the dealer page

Open your deployed site's `/dealers` path. On the current domain that is:

`https://dealers.motovolt.co/dealers`

Use the existing dashboard access code. A valid existing dashboard session opens the manager directly. There is also a **Manage dealers** link in the dashboard sidebar and a Dashboard link on the dealer page.

## Using the manager

- **Add dealer:** enter a name, city, state and optional address. A stable, unused numeric Dealer ID is generated automatically. The dealer starts active.
- **Edit:** change the name, city, state or address. Dealer IDs cannot be changed. Concurrent edits are checked; if someone else saved first, reopen Edit from the updated list rather than overwriting their work.
- **Archive:** hides the dealer from new registrations. It keeps the dealer record, ID, past sales and analytics links.
- **Restore:** makes an archived dealer available again. Use the Archived filter to find it.
- **Search:** matches name, city, state, address or ID. Search runs on the already loaded directory; it does not query the database for each keystroke.

An exact normalized name/city/state match cannot be added again. Restore an existing archived dealer instead of creating its duplicate. Pre-existing duplicate names are retained; no migration attempts to merge them or change their IDs.

## What happens to past data

Existing registration rows retain their saved Dealer ID and dealer name. Existing Google Sheets rows are not rewritten. Archiving a dealer does not remove their sales from totals, rankings or geographic reports.

As in the existing dashboard, location analytics use the current directory joined by Dealer ID. Editing a dealer's city/state therefore corrects the geographic reporting for their historical sales without rewriting the registration rows. The analytics display name follows the updated directory; saved receipts and previously written sheet rows keep their original values.

Submission retries still use the existing idempotency handling. A saved submission can be retrieved even if its dealer was later archived. A NEW submission for an archived dealer is rejected; entered customer details remain editable so another active dealer can be selected.

## Caching and updates

The active list is stored as one database JSON document. It is rebuilt once when a dealer is added, edited, archived or restored, in the same transaction as the change. Public reads fetch that cached document rather than aggregating the dealer table each time.

A form fetches the list after its anonymous browser session is established. It refreshes on reconnect and when the window regains focus (focus requests are throttled to one per 30 seconds). No refresh button or per-keystroke server search is added. An already open form may display an old choice until it refreshes, but the database always checks active status at submission time.

Dealer changes also invalidate the existing dashboard analytics cache. The next analytics load uses updated locations; already open analytics retain their normal refresh behavior.

## Access controls

`/dealers` serves a page shell; no management data is embedded in that shell. Listing all dealers and every mutation go through protected server endpoints and database functions. They validate the existing dashboard session against the database, including expiry/revocation. Mutations also require the configured origin, validate the payload and use existing rate limiting.

The directory tables have RLS enabled and direct access revoked from `anon` and `authenticated`. Server credentials remain server-only. The public form endpoint can read only the cached active directory through the server; it cannot modify it. There is no delete endpoint or browser delete permission.

Anyone authorized with the shared dashboard passcode has dealer-management access. This update does not add separate employee accounts or roles. Signing out revokes the current dashboard/dealer session together.

## Files and old workflows

See `CHANGES.md` for the supplied paths. `src/lib/dealers.ts` now contains only types and a label helper; the runtime TS array and synchronous lookup are removed. The initial list remains in the SQL migration and in a test fixture, not in the public application bundle.

Stop using the old `scripts/dashboard-sync-dealers.ts` workflow. Its replacement prints an explanatory message instead of SQL. Dashboard locations synchronize automatically from `form_dealers`; do not edit the compatibility location table as a second dealer source.

The test fixture is only used by legacy database tests; changing it does not change the live directory. The demo RPC no longer imports the TS dealer list. Dealer management and database-backed selection require a configured test/live Supabase database; the old standalone demo mode does not emulate the protected directory.

## Verification and remaining deployment checks

The PostgreSQL-compatible database tests cover valid/expired/revoked sessions, public-role permissions, adding/editing, generated IDs, duplicate checks, edit conflicts, archive/restore, canonical submitted names, missing/archived dealer rejection, history preservation, cache invalidation and safe SQL reruns. Existing finance, dashboard, validation, OTP, upload and Sheets tests also run. An older month-boundary test fixture was made independent of the current month; production quota code is unchanged.

TypeScript and the production build were checked. The local preview rendered the page, but this environment did not complete browser hydration, so interactive browser acceptance is not claimed. No live Supabase or Google Sheets production data was accessed or changed during development.

After deployment, check with the company administrator:

1. A signed-out/private browser opens `/dealers` with the passcode gate and cannot change the directory.
2. The existing passcode opens management. Add one deliberately named test dealer and confirm it appears in the public form after refocus/reload.
3. Edit its city/address, archive it, confirm it disappears from the active selector, then verify Restore works. Leave it archived when finished if it is only a test record.
4. Confirm existing sales totals and a historical registration/Sheet row are intact.

The existing finance-options permission checks and 15-day cookie behavior remain in place.
