import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Receipt, SheetJob, Verification } from "../src/lib/types";
const db = new PGlite();
const browserA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", browserB="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", browserC="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const hash="a".repeat(64);
let counter=0;
const phone=()=>`+9198${String(++counter).padStart(8,"0")}`;
async function call<T=any>(name:string,args:unknown[]):Promise<T>{return (await db.query<{result:T}>(`select public.form_${name}(${args.map((_,i)=>`$${i+1}`).join(",")}) as result`,args)).rows[0].result;}
async function attempt(user=browserA,mobile=phone()){
 const id=crypto.randomUUID(); await call("start_verification",[user,id,mobile,hash]); await call("mark_otp_delivery",[user,id,true]); return {id,mobile,user};
}
async function verified(user=browserA,mobile=phone()){
 const a=await attempt(user,mobile),token=crypto.randomUUID();
 const reserved=await call("reserve_otp_check",[user,a.id,hash,token]);assert.equal(reserved.providerCheck,true);
 await call("finish_otp_check",[user,a.id,token,true]);return a;
}
const details={dealer:"Motovolt Store",name:"Test Customer",email:"customer@example.com",age:30,product:"m7",battery:"",vin:"",payment:"upi"};
async function submit(a:{id:string;user:string},id=crypto.randomUUID(),override:Partial<typeof details>={}){
 const d={...details,...override};return call<Receipt>("submit",[a.user,a.id,id,d.name,d.email,d.age,d.product,d.battery,d.vin,d.payment,d.dealer]);
}
before(async()=>{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;");
 await db.exec(await readFile("supabase/migrations/202610130002_public_form.sql","utf8"));
});
after(()=>db.close());
test("the schema works without auth and contains the four products",async()=>{
 const products=(await db.query<{name:string}>("select name from public.form_products order by id")).rows.map(p=>p.name);
 assert.deepEqual(products,["Hum","Kivo","M7","URBN"]);
});
test("an unverified number and a provider check in progress cannot submit",async()=>{
 const a=await attempt();await assert.rejects(submit(a),/VERIFICATION_EXPIRED/);
 await call("reserve_otp_check",[browserA,a.id,hash,crypto.randomUUID()]);await assert.rejects(submit(a),/VERIFICATION_EXPIRED/);
});
test("five wrong codes commit attempt counts and permanently lock the challenge",async()=>{
 const a=await attempt();for(let i=1;i<=5;i++){
  const r=await call("reserve_otp_check",[browserA,a.id,"b".repeat(64),crypto.randomUUID()]);assert.equal(r.ok,false);assert.equal(r.code,i===5?"OTP_LOCKED":"OTP_INCORRECT");
 }
 assert.equal((await call("reserve_otp_check",[browserA,a.id,hash,crypto.randomUUID()])).ok,false);
 const row=(await db.query<any>("select tries,otp_hash from public.form_otp_attempts where id=$1",[a.id])).rows[0];assert.equal(row.tries,5);assert.equal(row.otp_hash,null);
});
test("MSG91 confirmation is required and cannot finish without the reserved token",async()=>{
 const a=await attempt(),token=crypto.randomUUID();await call("reserve_otp_check",[browserA,a.id,hash,token]);
 await assert.rejects(call("finish_otp_check",[browserA,a.id,crypto.randomUUID(),true]),/OTP_CHECK_EXPIRED/);
 assert.equal((await call("finish_otp_check",[browserA,a.id,token,false])).ok,false);
 assert.equal((await call<Verification>("load_verification",[browserA,a.id])).status,"sent");
 await assert.rejects(submit(a),/VERIFICATION_EXPIRED/);
});
test("concurrent verification is serialized and a timed-out lease is recoverable",async()=>{
 const a=await attempt(),first=crypto.randomUUID(),next=crypto.randomUUID();
 await call("reserve_otp_check",[browserA,a.id,hash,first]);
 assert.equal((await call("reserve_otp_check",[browserA,a.id,hash,next])).code,"OTP_PENDING");
 await db.query("update public.form_otp_attempts set check_until=now()-interval '1 second' where id=$1",[a.id]);
 assert.equal((await call("reserve_otp_check",[browserA,a.id,hash,next])).providerCheck,true);
 await assert.rejects(call("finish_otp_check",[browserA,a.id,first,true]),/OTP_CHECK_EXPIRED/);
 assert.equal((await call("finish_otp_check",[browserA,a.id,next,true])).ok,true);
});
test("expired codes and another browser's challenge cannot verify",async()=>{
 const a=await attempt();await assert.rejects(call("reserve_otp_check",[browserB,a.id,hash,crypto.randomUUID()]),/ATTEMPT_NOT_FOUND/);
 await db.query("update public.form_otp_attempts set otp_expires_at=now()-interval '1 second' where id=$1",[a.id]);
 assert.equal((await call("reserve_otp_check",[browserA,a.id,hash,crypto.randomUUID()])).code,"OTP_EXPIRED");
});
test("a resend supersedes earlier unverified codes across browsers",async()=>{
 const first=await attempt(),second=await attempt(browserB,first.mobile);
 assert.equal((await call<Verification>("load_verification",[browserA,first.id])).status,"superseded");
 assert.equal((await call("reserve_otp_check",[browserA,first.id,hash,crypto.randomUUID()])).ok,false);
 assert.equal((await call("reserve_otp_check",[browserB,second.id,hash,crypto.randomUUID()])).providerCheck,true);
});
test("submission, one-use verification and one Sheets job are committed together",async()=>{
 const a=await verified(),r=await submit(a);assert.equal(r.dealerName,"Motovolt Store");assert.equal(r.phone,a.mobile);
 assert.equal((await call<Verification>("load_verification",[browserA,a.id])).status,"consumed");
 assert.equal((await db.query("select * from public.form_sheet_jobs where submission_id=$1",[r.id])).rows.length,1);
});
test("lost-response retries return the same immutable receipt after expiry",async()=>{
 const a=await verified(),id=crypto.randomUUID(),r=await submit(a,id);
 await db.query("update public.form_otp_attempts set verification_expires_at=now()-interval '1 second' where id=$1",[a.id]);
 assert.equal((await submit(a,id)).id,r.id);assert.equal((await submit(a)).id,r.id);
 await assert.rejects(submit(a,id,{email:"changed@example.com"}),/IDEMPOTENCY_CONFLICT/);
 assert.equal((await db.query("select * from public.form_sheet_jobs where submission_id=$1",[id])).rows.length,1);
});
test("a retry cannot reuse a saved request ID for another phone",async()=>{
 const a=await verified(),id=crypto.randomUUID();await submit(a,id);
 const b=await verified();await assert.rejects(submit(b,id),/IDEMPOTENCY_CONFLICT/);
});
test("duplicate phone is blocked across browsers and dealer name changes",async()=>{
 const a=await verified();await submit(a);
 assert.equal((await call("check_existing",[browserB,a.mobile,"","",null])).phoneExists,true);
 await assert.rejects(call("start_verification",[browserB,crypto.randomUUID(),a.mobile,hash]),/DUPLICATE_PHONE/);
});
test("unique phone constraint also catches a competing previously verified submission",async()=>{
 const mobile=phone(),a=await verified(browserA,mobile),b=await verified(browserC,mobile);
 await submit(a);await assert.rejects(submit(b),/DUPLICATE_PHONE/);
});
test("VIN and Battery ID are normalized and unique globally",async()=>{
 await submit(await verified(),crypto.randomUUID(),{battery:" bat-001 ",vin:" vin-001 "});
 const a=await verified(browserB);const exists=await call("check_existing",[browserB,a.mobile,"bat-001","vin-001",a.id]);assert.equal(exists.batteryExists,true);assert.equal(exists.vinExists,true);
 await assert.rejects(submit(a,crypto.randomUUID(),{battery:"BAT-001"}),/DUPLICATE_BATTERY/);
 await assert.rejects(submit(a,crypto.randomUUID(),{vin:"VIN-001"}),/DUPLICATE_VIN/);
 const r=await submit(a,crypto.randomUUID(),{battery:"BAT-002",vin:"VIN-002"});assert.equal(r.vin,"VIN-002");
});
test("optional IDs are null, so different registrations can both omit them",async()=>{
 const a=await submit(await verified()),b=await submit(await verified());assert.equal(a.vin,null);assert.equal(b.batteryId,null);
});
test("asset existence checks require that browser's verified matching phone",async()=>{
 const a=await attempt();await assert.rejects(call("check_existing",[browserA,a.mobile,"BAT-001","",a.id]),/VERIFICATION_EXPIRED/);
});
test("SQL independently validates email, age, product and payment mode",async()=>{
 const a=await verified();
 for(const bad of [{email:"invalid"},{age:0},{age:121},{payment:"crypto"},{battery:"BAD SPACE"},{name:"A\nB"}])await assert.rejects(submit(a,crypto.randomUUID(),bad),/INVALID_INPUT/);
 await assert.rejects(submit(a,crypto.randomUUID(),{product:"mvs7"}),/INVALID_PRODUCT/);
 await db.query("update public.form_otp_attempts set verification_expires_at=now()-interval '1 second' where id=$1",[a.id]);await assert.rejects(submit(a),/VERIFICATION_EXPIRED/);
});
test("even privileged app writes cannot edit or delete a registration",async()=>{
 const r=await submit(await verified());await assert.rejects(db.query("update public.form_registrations set age=42 where id=$1",[r.id]),/SUBMISSION_IMMUTABLE/);await assert.rejects(db.query("delete from public.form_registrations where id=$1",[r.id]),/SUBMISSION_IMMUTABLE/);
});
test("authenticated clients cannot call any portal RPC, read hashes or insert records",async()=>{
 await db.exec("set role authenticated");
 try{
  await assert.rejects(call("get_submission",[browserA,crypto.randomUUID()]),/permission denied/);
  await assert.rejects(call("finish_otp_check",[browserA,crypto.randomUUID(),crypto.randomUUID(),true]),/permission denied/);
  await assert.rejects(db.query("select otp_hash from public.form_otp_attempts"),/permission denied/);
  await assert.rejects(db.query("insert into public.form_registrations(id) values($1)",[crypto.randomUUID()]),/permission denied/);
 }finally{await db.exec("reset role");}
});
test("anonymous clients cannot read any customer table or privileged RPC",async()=>{
 await db.exec("set role anon");
 try { await assert.rejects(db.query("select * from public.form_registrations"),/permission denied/);await assert.rejects(call("get_submission",[browserA,crypto.randomUUID()]),/permission denied/); }
 finally { await db.exec("reset role"); }
});
test("one Sheets writer, fourteen columns, fixed row and safe retries",async()=>{
 const w1=crypto.randomUUID(),w2=crypto.randomUUID(),jobs=await call<SheetJob[]>("claim_sheet_jobs",[w1,5]);assert.ok(jobs.length);assert.deepEqual(await call("claim_sheet_jobs",[w2,5]),[]);
 const job=jobs[0];assert.equal(job.values.length,14);assert.equal(job.values[0],job.submissionId);assert.equal(job.values[5],"");assert.equal(job.values[8],"");assert.ok(job.row>=2);
 await call("finish_sheet_job",[w2,job.submissionId,true,null]);
 assert.equal((await db.query<any>("select status from public.form_sheet_jobs where submission_id=$1",[job.submissionId])).rows[0].status,"processing");
 await call("finish_sheet_job",[w1,job.submissionId,false,"SHEETS_WRITE_503"]);
 await db.query("update public.form_sheet_jobs set available_at=now()-interval '1 second' where submission_id=$1",[job.submissionId]);await call("release_sheet_worker",[w1]);
 const next=await call<SheetJob[]>("claim_sheet_jobs",[w2,5]);assert.equal(next.find(j=>j.submissionId===job.submissionId)?.row,job.row);
 await call("finish_sheet_job",[w2,job.submissionId,true,null]);await call("release_sheet_worker",[w2]);
});
test("service_role can execute the browser-bound invoker RPCs",async()=>{
 const a=await verified();await db.exec("set role service_role");try{assert.equal((await call("load_verification",[browserA,a.id])).phone,a.mobile);}finally{await db.exec("reset role");}
});
test("receipts and verified drafts are private to the browser that created them",async()=>{
 const a=await verified();const r=await submit(a);
 assert.equal(await call("get_submission",[browserB,r.id]),null);
 assert.equal(await call("resume_verification",[browserB,a.mobile]),null);
});
