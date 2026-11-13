import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync(new URL("../supabase/migrations/202611130001_database_dealers.sql", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../supabase/migrations/202611090001_dashboard.sql", import.meta.url), "utf8");
const good = "a".repeat(64), expired = "b".repeat(64);

test("database dealer directory: authenticated CRUD, archival, history, cache, conflicts, permissions and safe reruns", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create table form_products(id text primary key, name text, active boolean);
      create table form_dealers(id text primary key, name text not null, city text not null, state text not null, active boolean not null default true);
      insert into form_dealers values ('85','Old dealer name','Old city','Old state',true), ('2','Old inactive dealer','Kolkata','West Bengal',false), ('legacy-db-only','Legacy DB-only dealer','Pune','Maharashtra',true);
      create table form_registrations(id uuid primary key, phone text, submitted_at timestamptz, age integer, email text, payment_mode text, product_id text, product_name text, dealer_name text, dealer_id text references form_dealers(id), gender text, product_colour text, connectivity text, range_variant text, charger_type text, financer_name text);
      insert into form_registrations(id,dealer_name,dealer_id) values ('00000000-0000-4000-8000-000000000001','Historical name snapshot','85');
      create table form_sheet_jobs(submission_id uuid primary key, status text);
    `);
    await db.exec(dashboard);
    await db.exec(migration);
    const rows = async <T = Record<string, any>>(sql: string, args: unknown[] = []) => (await db.query<T>(sql, args)).rows;
    const row = async (sql: string, args: unknown[] = []) => (await rows(sql, args))[0];
    const directory = async () => (await row("select data, revision from form_dealer_directory where id"));
    assert.equal((await row("select count(*)::int n from form_dealers")).n, 257);
    assert.equal((await row("select city from form_dealers where id='85'")).city, "Kolkata");
    assert.equal((await row("select state from form_dealers where id='260'")).state, "Delhi");
    assert.equal((await row("select active from form_dealers where id='2'")).active, false);
    assert.equal((await row("select dealer_name from form_registrations")).dealer_name, "Historical name snapshot");
    assert.equal((await directory()).data.length, 256);
    assert.ok(!(await directory()).data.some((d: any) => d.id === "2"));
    await assert.rejects(db.query("select dealer_admin_list($1)", [good]), /DASHBOARD_UNAUTHORIZED/);
    const hash = "scrypt$32768$8$1$" + "a".repeat(32) + "$" + "b".repeat(64);
    await db.query("select dashboard_set_access_hash($1)", [hash]);
    await db.query("select dashboard_create_session($1,1)", [good]);
    await db.query("select dashboard_create_session($1,1)", [expired]);
    await db.query("update dashboard_sessions set expires_at=now()-interval '1 second' where hash=$1", [expired]);
    const save = (session: string, id: string | null, version: number | null, name = "New Dealer", city = "Kolkata", state = "West Bengal", address = "Test address") => db.query<{ result: { id: string; version: number } }>("select dealer_admin_save($1,$2,$3,$4,$5,$6,$7) result", [session,id,version,name,city,state,address]);
    const archive = (session: string, id: string, version: number, archived: boolean) => db.query("select dealer_admin_archive($1,$2,$3,$4)", [session,id,version,archived]);
    await assert.rejects(save(expired, null, null), /DASHBOARD_UNAUTHORIZED/);
    await assert.rejects(save("f".repeat(64), null, null), /DASHBOARD_UNAUTHORIZED/);
    await assert.rejects(archive(expired, "85", 1, true), /DASHBOARD_UNAUTHORIZED/);
    await assert.rejects(save(good, null, null, "x"), /INVALID_DEALER_DETAILS/);
    await assert.rejects(save(good, null, null, "Line\nBreak"), /INVALID_DEALER_DETAILS/);
    await assert.rejects(save(good, null, null, "New Dealer", "Kolkata", "West Bengal", "x".repeat(1001)), /INVALID_DEALER_DETAILS/);

    await db.exec("insert into dashboard_cache(key,data) values ('cached-test','{}')");
    const revision = (await directory()).revision;
    const created = (await save(good, null, null)).rows[0].result;
    assert.equal(created.id, "266");
    assert.equal(created.version, 1);
    assert.ok((await directory()).revision > revision);
    assert.equal((await row("select count(*)::int n from dashboard_cache")).n, 0);
    assert.ok((await directory()).data.some((d: any) => d.id === "266"));
    assert.equal((await row("select name from dashboard_dealer_locations where id='266'")).name, "New Dealer");
    await assert.rejects(save(good, null, null, " new dealer ", "kolkata", "west bengal"), /DEALER_ALREADY_EXISTS/);
    await assert.rejects(save(good, "266", null), /DEALER_CHANGED/);
    await save(good, "266", 1, "Renamed Dealer", "Delhi", "Delhi", "Updated address");
    assert.equal((await row("select version from form_dealers where id='266'")).version, 2);
    assert.equal((await row("select city from dashboard_dealer_locations where id='266'")).city, "Delhi");
    await assert.rejects(save(good, "266", 1, "Stale overwrite"), /DEALER_CHANGED/);
    await assert.rejects(archive(good, "266", 1, true), /DEALER_CHANGED/);
    await archive(good, "266", 2, true);
    assert.ok(!(await directory()).data.some((d: any) => d.id === "266"));
    assert.equal((await row("select city from dashboard_dealer_locations where id='266'")).city, "Delhi");
    await assert.rejects(db.exec("insert into form_registrations(id,dealer_id,dealer_name) values (gen_random_uuid(),'266','Forged name')"), /INVALID_DEALER/);
    await assert.rejects(db.exec("insert into form_registrations(id,dealer_id,dealer_name) values (gen_random_uuid(),'does-not-exist','Forged name')"), /INVALID_DEALER/);
    await archive(good, "266", 3, false);
    await db.exec("insert into form_registrations(id,dealer_id,dealer_name) values ('00000000-0000-4000-8000-000000000002','266','Forged name')");
    assert.equal((await row("select dealer_name from form_registrations where dealer_id='266'")).dealer_name, "Renamed Dealer");
    await archive(good, "266", 4, true);
    assert.equal((await row("select count(*)::int n from form_registrations")).n, 2);
    const listed = (await rows<{ result: any[] }>("select dealer_admin_list($1) result", [good]))[0].result;
    assert.ok(listed.some(d => d.id === "266" && d.active === false));
    assert.equal((await save(good, null, null, "Another New Dealer")).rows[0].result.id, "267");
    await assert.rejects(db.exec("update form_dealers set id='renumbered' where id='266'"), /DEALER_ID_IMMUTABLE/);

    await db.exec(migration);
    assert.equal((await row("select name from form_dealers where id='266'")).name, "Renamed Dealer");
    assert.equal((await row("select active from form_dealers where id='266'")).active, false);
    assert.equal((await row("select count(*)::int n from form_registrations")).n, 2);
    // Table access and callable RPCs are unavailable to both public browser roles.
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.exec("select * from form_dealers"), /permission denied/);
      await assert.rejects(db.exec("select * from form_dealer_directory"), /permission denied/);
      await assert.rejects(db.query("select dealer_admin_list($1)", [good]), /permission denied/);
      await assert.rejects(save(good, null, null), /permission denied/);
      await assert.rejects(archive(good, "266", 5, false), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal((await rows<{ result: any[] }>("select dealer_admin_list($1) result", [good]))[0].result.length, 259);
    await assert.rejects(db.exec("delete from form_dealers where id='266'"), /permission denied/);
    await db.exec("reset role");
    await db.query("select dashboard_revoke_session($1)", [good]);
    await assert.rejects(archive(good, "266", 5, false), /DASHBOARD_UNAUTHORIZED/);
  } finally { await db.close(); }
});
