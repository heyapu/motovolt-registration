import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  verifyDashboardCode,
  tokenHash,
  createSessionToken,
  DASHBOARD_TTL,
} from "../src/lib/server/dashboard-crypto";
import {
  parseFilters,
  offsetDate,
  indiaDate,
} from "../src/lib/dashboard/filters";
import type { DashboardData } from "../src/lib/dashboard/types";
const migration = readFileSync(
  new URL("../supabase/migrations/202611090001_dashboard.sql", import.meta.url),
  "utf8",
);
test("code hashing, tampering and fixed 15-day token lifetime", async () => {
  const code = "strong-dashboard-test-code",
    salt = randomBytes(16);
  const hash = scryptSync(code, salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const encoded = `scrypt$32768$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
  assert.equal(await verifyDashboardCode(code, encoded), true);
  assert.equal(
    await verifyDashboardCode("wrong-dashboard-code", encoded),
    false,
  );
  assert.equal(await verifyDashboardCode(code, "invalid"), false);
  assert.equal(await verifyDashboardCode("x".repeat(65), encoded), false);
  assert.equal(DASHBOARD_TTL, 1296000);
  const token = createSessionToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(tokenHash(token), token);
});
test("filters use IST calendar dates and validate invalid ranges", () => {
  assert.equal(indiaDate(new Date("2026-11-08T19:00:00Z")), "2026-11-09");
  assert.equal(offsetDate("2026-03-01", -1), "2026-02-28");
  assert.throws(() =>
    parseFilters(new URLSearchParams({ from: "2026-02-30", to: "2026-03-01" })),
  );
  assert.throws(() =>
    parseFilters(new URLSearchParams({ from: "2026-03-02", to: "2026-03-01" })),
  );
  assert.throws(() => parseFilters(new URLSearchParams({ to: "2099-01-01" })));
});
test("additive SQL, authorization, cache, IST filtering, customers and session revocation", async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table form_products(id text primary key,name text,active boolean);
 insert into form_products values('m7','M7',true),('hum','HUM',true);
 create table form_registrations(id uuid primary key,phone text,submitted_at timestamptz,age integer,email text,payment_mode text,product_id text,product_name text,dealer_name text,dealer_id text,gender text,product_colour text,connectivity text,range_variant text,charger_type text,financer_name text);
 create table form_sheet_jobs(submission_id uuid primary key,status text);
 grant select on form_products,form_registrations,form_sheet_jobs to service_role;
 insert into form_registrations values
 ('00000000-0000-4000-8000-000000000001','+919999999991','2026-11-01T00:00Z',25,'a@example.test','cash','m7','M7','Dealer','1','male','Yellow',null,null,null,null),
 ('00000000-0000-4000-8000-000000000002','+919999999991','2026-11-02T00:00Z',26,null,'finance','m7','M7','Dealer','1','male','Yellow',null,null,null,'Test Bank'),
 ('00000000-0000-4000-8000-000000000003','+919999999992','2026-11-01T18:29Z',35,'b@example.test','upi','hum','HUM','Unmatched','no-match','female',null,null,null,null,null),
 ('00000000-0000-4000-8000-000000000004','+919999999993','2026-11-01T18:30Z',45,null,'card','hum','HUM','Dealer','2','non_binary',null,'standard','long','fast',null),
 ('00000000-0000-4000-8000-000000000005','+919999999994','2026-10-31T10:00Z',55,null,'cash','m7','M7','Dealer','1','female','Red',null,null,null,null);
 insert into form_sheet_jobs values('00000000-0000-4000-8000-000000000001','done'),('00000000-0000-4000-8000-000000000002','pending'),('00000000-0000-4000-8000-000000000004','needs_attention');`);
  await db.exec(migration);
  const query = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<T>(sql, args)).rows;
  assert.equal(
    (
      await query<{ n: number }>(
        "select count(*)::int n from form_registrations",
      )
    )[0].n,
    5,
  );
  assert.equal(
    (
      await query<{ n: number }>(
        "select count(*)::int n from dashboard_dealer_locations",
      )
    )[0].n,
    250,
  );
  // Migration reruns retain access, sessions and all customer rows.
  const encoded = "scrypt$32768$8$1$" + "a".repeat(32) + "$" + "b".repeat(64);
  await db.query("select dashboard_set_access_hash($1)", [encoded]);
  const hash = tokenHash("session-test");
  const session = (
    await query<{ s: { expiresAt: string } }>(
      "select dashboard_create_session($1,1) s",
      [hash],
    )
  )[0].s;
  assert.ok(
    Math.abs(
      Date.parse(session.expiresAt) - Date.now() - DASHBOARD_TTL * 1000,
    ) < 10000,
  );
  await db.exec(migration);
  await assert.rejects(
    db.query("select dashboard_analytics('bad','2026-11-01','2026-11-02')"),
    /DASHBOARD_UNAUTHORIZED/,
  );
  await db.exec("set role anon");
  await assert.rejects(
    db.query("select * from dashboard_access"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select dashboard_validate_session('bad')"),
    /permission denied/,
  );
  await db.exec("reset role;set role service_role");
  await assert.rejects(
    db.query("select dashboard_set_access_hash($1)", [encoded]),
    /permission denied/,
  );
  const result = (
    await query<{ d: DashboardData }>(
      "select dashboard_analytics($1,'2026-11-01','2026-11-02') d",
      [hash],
    )
  )[0].d;
  assert.equal(result.summary.purchases, 4);
  assert.equal(result.summary.customers, 3);
  assert.equal(result.summary.repeatCustomers, 1);
  assert.equal(result.summary.averageAge, 35.3);
  assert.equal(result.summary.emailCoverage, 1);
  assert.equal(result.summary.previousPurchases, 1);
  assert.equal(result.summary.unknownLocations, 1);
  assert.equal(result.trend.length, 2);
  assert.equal(
    result.states.reduce((a, v) => a + v.count, 0),
    4,
  );
  assert.equal(
    result.gender.reduce((a, v) => a + v.count, 0),
    3,
  );
  assert.ok(result.dealers.find((v) => v.id === "1")?.city === "Coimbatore");
  assert.equal(result.financers[0].label, "Test Bank");
  assert.equal(result.sync.find((v) => v.label === "Missing job")?.count, 1);
  const narrow = (
    await query<{ d: DashboardData }>(
      "select dashboard_analytics($1,'2026-11-01','2026-11-01') d",
      [hash],
    )
  )[0].d;
  assert.equal(narrow.summary.purchases, 2);
  const filtered = (
    await query<{ d: DashboardData }>(
      "select dashboard_analytics($1,'2026-11-01','2026-11-02','m7','Tamil Nadu','Coimbatore','1') d",
      [hash],
    )
  )[0].d;
  assert.equal(filtered.summary.purchases, 2);
  // Cached requests keep a stable generatedAt; new data appears after expiry.
  await db.exec("reset role");
  await db.exec(
    "delete from form_registrations where id='00000000-0000-4000-8000-000000000003'",
  );
  const cached = (
    await query<{ d: DashboardData }>(
      "select dashboard_analytics($1,'2026-11-01','2026-11-02') d",
      [hash],
    )
  )[0].d;
  assert.equal(cached.summary.purchases, 4);
  assert.equal(cached.generatedAt, result.generatedAt);
  await db.exec(
    "update dashboard_cache set generated_at=now()-interval '3 minutes'",
  );
  const fresh = (
    await query<{ d: DashboardData }>(
      "select dashboard_analytics($1,'2026-11-01','2026-11-02') d",
      [hash],
    )
  )[0].d;
  assert.equal(fresh.summary.purchases, 3);
  const empty = (
    await query<{ d: DashboardData }>(
      "select dashboard_analytics($1,'2020-01-01','2020-01-02') d",
      [hash],
    )
  )[0].d;
  assert.equal(empty.summary.purchases, 0);
  assert.equal(empty.trend.length, 2);
  assert.deepEqual(empty.gender, []);
  await db.query("select dashboard_revoke_session($1)", [hash]);
  assert.equal(
    (
      await query<{ s: unknown }>("select dashboard_validate_session($1) s", [
        hash,
      ])
    )[0].s,
    null,
  );
  await db.query("select dashboard_create_session($1,1)", [hash]);
  await db.query("select dashboard_set_access_hash($1)", [encoded]);
  assert.equal(
    (
      await query<{ s: unknown }>("select dashboard_validate_session($1) s", [
        hash,
      ])
    )[0].s,
    null,
  );
  await assert.rejects(
    db.query("select dashboard_create_session($1,1)", [hash]),
    /DASHBOARD_UNAUTHORIZED/,
  );
  await db.query("select dashboard_create_session($1,2)", [hash]);
  await db.exec(
    "update dashboard_sessions set expires_at=now()-interval '1 second'",
  );
  await assert.rejects(
    db.query("select dashboard_analytics($1,'2026-11-01','2026-11-02')", [
      hash,
    ]),
    /DASHBOARD_UNAUTHORIZED/,
  );
  await db.close();
});
