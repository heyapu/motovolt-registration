import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { hashResetAccessCode } from '../src/lib/server/reset-crypto';
import { verifyDashboardCode } from '../src/lib/server/dashboard-crypto';
test('reset code uses the existing scrypt format', async () => {
 const hash=await hashResetAccessCode('Secure-Test-Code-2026');
 assert.equal(await verifyDashboardCode('Secure-Test-Code-2026',hash),true);
 assert.equal(await verifyDashboardCode('Other-Test-Code-2026',hash),false);
 await assert.rejects(hashResetAccessCode('short'));
});
test('reset expires, consumes atomically, revokes sessions and preserves business data', async () => {
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create table dashboard_access(id boolean primary key,hash text,version integer default 1,updated_at timestamptz default now());
 create table dashboard_sessions(hash text primary key);
 create table business_data(id integer primary key); insert into business_data values(1);
 insert into dashboard_access values(true,'old',1,now()); insert into dashboard_sessions values('old-session');`);
 const migration=readFileSync('supabase/migrations/202611130002_dashboard_reset.sql','utf8');
 await db.exec(migration);
 const token='a'.repeat(64), second='b'.repeat(64), hash=await hashResetAccessCode('Secure-Test-Code-2026');
 await db.query('select dashboard_issue_reset($1)',[token]);
 await db.query('select dashboard_issue_reset($1)',[second]);
 await db.query("update dashboard_reset_tokens set expires_at=now()-interval '1 minute' where hash=$1",[second]);
 const complete=async(t:string)=>(await db.query<{ok:boolean}>('select dashboard_complete_reset($1,$2) ok',[t,hash])).rows[0].ok;
 assert.equal(await complete(second),false);
 assert.equal(await complete('c'.repeat(64)),false);
 assert.equal(await complete(token),true);
 assert.equal(await complete(token),false);
 assert.equal((await db.query('select * from dashboard_sessions')).rows.length,0);
 assert.equal((await db.query<{version:number}>('select version from dashboard_access')).rows[0].version,2);
 assert.equal((await db.query('select * from business_data')).rows.length,1);
 await db.query('select dashboard_issue_reset($1)',[token]);
 await db.exec('update dashboard_access set version=version+1 where id=true');
 assert.equal(await complete(token),false);
 assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege('anon','dashboard_complete_reset(text,text)','execute') allowed")).rows[0].allowed,false);
 await db.exec(migration); // rerun preserves the active passcode
 assert.equal((await db.query<{hash:string}>('select hash from dashboard_access')).rows[0].hash,hash);
 } finally {await db.close();}
});
