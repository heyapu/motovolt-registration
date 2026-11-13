import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import dealerFixture from "./fixtures/dealers.json";
const getDealer = (id: string) => dealerFixture.find(dealer => dealer.id === id);
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
const details={dealer:"1",gender:"male",proof:"",name:"Test Customer",email:"customer@example.com",age:30,product:"m7",battery:"",vin:"",payment:"upi",colour:"Yellow",connectivity:"",range:"",charger:""};
const proofIds=new Map<string,string>();
async function createProof(a:{id:string;user:string},payment="upi",digest?:string) {
 const id=crypto.randomUUID(),lease=crypto.randomUUID();
 await call("reserve_proof",[a.user,a.id,id,digest||createHash("sha256").update(id).digest("hex"),payment,lease]);
 await call("finish_proof",[a.user,id,lease,id,`https://unit.ufs.sh/f/${id}`,`https://example.com/api/proofs/view?id=${id}`,500,300,1234]);
 return id;
}
async function submit(a:{id:string;user:string},id=crypto.randomUUID(),override:Partial<typeof details>={}){
 const d={...details,battery:`BAT-${a.id}`,vin:`VIN-${a.id}`,...override};
 let proof=d.proof || proofIds.get(a.id);
 if(!proof){
  const status=await call<Verification>("load_verification",[a.user,a.id]);
  proof=status.status==="verified" && Date.parse(status.verificationExpiresAt||"")>Date.now()?await createProof(a,d.payment):crypto.randomUUID();
  proofIds.set(a.id,proof);
 }
 return call<Receipt>("submit",[a.user,a.id,id,d.name,d.email,d.age,d.product,d.battery,d.vin,d.payment,d.dealer,d.gender,proof,getDealer(d.dealer)?.name||"",d.colour,d.connectivity,d.range,d.charger]);
}
before(async()=>{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;");
 await db.exec(await readFile("supabase/migrations/202610130002_public_form.sql","utf8"));
 await db.exec(await readFile("supabase/migrations/202610140001_registration_proofs.sql","utf8"));
 await db.exec(await readFile("supabase/migrations/202610300001_proof_images_1080.sql","utf8"));
 await db.exec(await readFile("supabase/migrations/202610300002_product_variants_repeat_purchases.sql","utf8"));
});
after(()=>db.close());
test("the schema works without auth and contains all eight products",async()=>{
 const products=(await db.query<{name:string}>("select name from public.form_products order by id")).rows.map(p=>p.name);
 assert.deepEqual(products,["HUM","KIVO","KIVO 24","KIVO Easy","M7","M7L","MVS7","URBN"]);
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
test("submission, reusable verification and one Sheets job are committed together",async()=>{
 const a=await verified(),r=await submit(a);assert.equal(r.dealerName,"Motovolt- Authorised | VIRUKSHAM INDUSTRIAL INNOVATORS");assert.equal(r.phone,a.mobile);
 assert.equal((await call<Verification>("load_verification",[browserA,a.id])).status,"verified");
 assert.equal((await db.query("select * from public.form_sheet_jobs where submission_id=$1",[r.id])).rows.length,1);
});
test("lost-response retries return the same immutable receipt after expiry",async()=>{
 const a=await verified(),id=crypto.randomUUID(),r=await submit(a,id);
 await db.query("update public.form_otp_attempts set verification_expires_at=now()-interval '1 second' where id=$1",[a.id]);
 assert.equal((await submit(a,id)).id,r.id);await assert.rejects(submit(a),/VERIFICATION_EXPIRED/);
 await assert.rejects(submit(a,id,{email:"changed@example.com"}),/IDEMPOTENCY_CONFLICT/);
 assert.equal((await db.query("select * from public.form_sheet_jobs where submission_id=$1",[id])).rows.length,1);
});
test("a retry cannot reuse a saved request ID for another phone",async()=>{
 const a=await verified(),id=crypto.randomUUID();await submit(a,id);
 const b=await verified();await assert.rejects(submit(b,id),/IDEMPOTENCY_CONFLICT/);
});
test("same phone may buy again from a different verified browser",async()=>{
 const mobile=phone(),a=await verified(browserA,mobile),b=await verified(browserC,mobile);
 await submit(a);const second=await submit(b);
 assert.equal(second.purchaseStatus.count,2);
 assert.equal((await call("resume_verification",[browserA,mobile])).id,a.id);
 await assert.rejects(call("check_existing",[browserB,mobile,"","",null]),/VERIFICATION_EXPIRED/);
});
test("one OTP supports five purchases; retries do not count twice and the sixth is rejected",async()=>{
 const a=await verified();const proofs=[];for(let i=0;i<6;i++)proofs.push(await createProof(a));
 let fifth:any, fifthId='';
 for(let i=0;i<5;i++) {
  const id=crypto.randomUUID();const r=await submit(a,id,{battery:`CAP-B-${a.id}-${i}`,vin:`CAP-V-${a.id}-${i}`,proof:proofs[i]});
  assert.equal(r.purchaseStatus.count,i+1);assert.equal(r.purchaseStatus.remaining,4-i);
  if(i===4){fifth=r;fifthId=id;}
 }
 assert.equal((await submit(a,fifthId,{battery:`CAP-B-${a.id}-4`,vin:`CAP-V-${a.id}-4`,proof:proofs[4]})).id,fifth.id);
 await assert.rejects(submit(a,crypto.randomUUID(),{battery:`CAP-B-${a.id}-5`,vin:`CAP-V-${a.id}-5`,proof:proofs[5]}),/MONTHLY_PURCHASE_LIMIT/);
 assert.equal((await call("monthly_purchase_status",[a.mobile])).count,5);
});
test("VIN and Battery ID are normalized and unique globally",async()=>{
 await submit(await verified(),crypto.randomUUID(),{battery:" bat-001 ",vin:" vin-001 "});
 const a=await verified(browserB);const exists=await call("check_existing",[browserB,a.mobile,"bat-001","vin-001",a.id]);assert.equal(exists.batteryExists,true);assert.equal(exists.vinExists,true);
 await assert.rejects(submit(a,crypto.randomUUID(),{battery:"BAT-001"}),/DUPLICATE_BATTERY/);
 await assert.rejects(submit(a,crypto.randomUUID(),{vin:"VIN-001"}),/DUPLICATE_VIN/);
 const r=await submit(a,crypto.randomUUID(),{battery:"BAT-002",vin:"VIN-002"});assert.equal(r.vin,"VIN-002");
});
test("both vehicle IDs are required for new registrations",async()=>{
 const a=await verified();await assert.rejects(submit(a,crypto.randomUUID(),{battery:""}),/INVALID_INPUT/);await assert.rejects(submit(a,crypto.randomUUID(),{vin:""}),/INVALID_INPUT/);
});
test("asset existence checks require that browser's verified matching phone",async()=>{
 const a=await attempt();await assert.rejects(call("check_existing",[browserA,a.mobile,"BAT-001","",a.id]),/VERIFICATION_EXPIRED/);
});
test("SQL independently validates email, age, product and payment mode",async()=>{
 const a=await verified();
 for(const bad of [{email:"invalid"},{age:0},{age:121},{payment:"crypto"},{battery:"BAD SPACE"},{name:"A\nB"}])await assert.rejects(submit(a,crypto.randomUUID(),bad),/INVALID_INPUT/);
 await assert.rejects(submit(a,crypto.randomUUID(),{product:"unknown"}),/INVALID_PRODUCT/);
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
test("one Sheets writer, twenty-one columns, fixed row and safe retries",async()=>{
 const w1=crypto.randomUUID(),w2=crypto.randomUUID(),jobs=await call<SheetJob[]>("claim_sheet_jobs",[w1,5]);assert.ok(jobs.length);assert.deepEqual(await call("claim_sheet_jobs",[w2,5]),[]);
 const job=jobs[0];assert.equal(job.values.length,21);assert.equal(job.values[0],job.submissionId);assert.equal(job.values[5],"");assert.equal(job.values[8],"");assert.ok(job.row>=2);
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
test("all 250 dealers are seeded and the backend must supply a canonical dealer name",async()=>{
 assert.equal((await db.query<{n:number}>("select count(*)::int n from public.form_dealers")).rows[0].n,250);
 await assert.rejects(submit(await verified(),crypto.randomUUID(),{dealer:"fake-store"}),/INVALID_DEALER/);
});
test("proof requires verified phone, current lease, matching owner/payment and valid dimensions",async()=>{
 const pending=await attempt();
 await assert.rejects(call("reserve_proof",[pending.user,pending.id,crypto.randomUUID(),hash,"cash",crypto.randomUUID()]),/VERIFICATION_EXPIRED/);
 const a=await verified(),pid=crypto.randomUUID(),lease=crypto.randomUUID(),digest=createHash("sha256").update(pid).digest("hex");
 await call("reserve_proof",[a.user,a.id,pid,digest,"cash",lease]);
 await assert.rejects(call("finish_proof",[browserB,pid,lease,"key-test","https://app.ufs.sh/f/key","https://example.com/proof",500,300,100]),/PROOF_LEASE_EXPIRED/);
 await assert.rejects(call("finish_proof",[a.user,pid,lease,"key-test","https://app.ufs.sh/f/key","https://example.com/proof",1081,300,100]),/INVALID_INPUT/);
 await call("finish_proof",[a.user,pid,lease,"key-test","https://app.ufs.sh/f/key","https://example.com/proof",500,300,100]);
 await assert.rejects(submit(a,crypto.randomUUID(),{proof:pid,payment:"upi"}),/PROOF_MISMATCH/);
 await assert.rejects(submit(await verified(browserB),crypto.randomUUID(),{proof:pid,payment:"cash"}),/PROOF_MISMATCH/);
 const r=await submit(a,crypto.randomUUID(),{proof:pid,payment:"cash"});assert.equal(r.gender,"male");assert.equal(r.dealerId,"1");assert.equal(r.paymentProofUrl,"https://example.com/proof");
 await assert.rejects(db.query("update public.form_payment_proofs set file_key='changed' where id=$1",[pid]),/PROOF_IMMUTABLE/);
});
test("duplicate image bytes cannot be claimed by another entry, and lost upload responses are idempotent",async()=>{
 const a=await verified(),pid=await createProof(a);
 const row=(await db.query<any>("select digest from public.form_payment_proofs where id=$1",[pid])).rows[0];
 const resumed=await call("reserve_proof",[a.user,a.id,pid,row.digest,"upi",crypto.randomUUID()]);assert.equal(resumed.ready,true);assert.equal(resumed.proof.id,pid);
 await assert.rejects(call("reserve_proof",[browserB,(await verified(browserB)).id,crypto.randomUUID(),row.digest,"upi",crypto.randomUUID()]),/DUPLICATE_PROOF/);
});
test("the legacy submit signature is removed and anonymous clients cannot reach proof RPCs",async()=>{
 await assert.rejects(call("submit",[browserA,crypto.randomUUID(),crypto.randomUUID(),"Name","a@b.com",30,"m7","BAT","VIN","upi","Fake Dealer"]),/does not exist/);
 await db.exec("set role anon");
 try{await assert.rejects(call("get_proof",[crypto.randomUUID()]),/permission denied/);await assert.rejects(db.query("select * from public.form_payment_proofs"),/permission denied/);}finally{await db.exec("reset role");}
});
test("cleanup leases only abandoned proof and never the submitted image",async()=>{
 const a=await verified(),unused=await createProof(a),saved=await submit(await verified());
 await db.query("update public.form_payment_proofs set created_at=now()-interval '25 hours' where id=$1",[unused]);
 const worker=crypto.randomUUID(),jobs=await call("claim_orphan_proofs",[worker]);assert.ok(jobs.some((x:any)=>x.id===unused));
 const savedProof=(await db.query<any>("select payment_proof_id from public.form_registrations where id=$1",[saved.id])).rows[0].payment_proof_id;
 assert.equal(jobs.some((x:any)=>x.id===savedProof),false);
 await call("finish_orphan_proof",[worker,unused,true]);assert.equal(await call("get_proof",[unused]),null);
 assert.ok(await call("get_proof",[savedProof]));
});
