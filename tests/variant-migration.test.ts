import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {PRODUCT_CATALOG} from '../src/lib/product-catalog';

test('additive upgrade preserves historical rows, fills the catalog and enforces every product combination in SQL',async()=>{
 const db=new PGlite();
 const call=async(name:string,args:any[]=[])=>(await db.query<any>(`select public.form_${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 async function proof(browser:string,attempt:string) {
  const id=crypto.randomUUID(),lease=crypto.randomUUID();
  await call('reserve_proof',[browser,attempt,id,createHash('sha256').update(id).digest('hex'),'cash',lease]);
  await call('finish_proof',[browser,id,lease,id,'https://unit.ufs.sh/f/'+id,'https://example.com/proof/'+id,1080,810,1000]);return id;
 }
 async function verified(phone:string) {
  const browser=crypto.randomUUID(),attempt=crypto.randomUUID(),token=crypto.randomUUID(),hash='a'.repeat(64);
  await call('start_verification',[browser,attempt,phone,hash]);await call('mark_otp_delivery',[browser,attempt,true]);
  await call('reserve_otp_check',[browser,attempt,hash,token]);await call('finish_otp_check',[browser,attempt,token,true]);
  return {browser,attempt};
 }
 try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;');
  for(const file of ['202610130002_public_form.sql','202610140001_registration_proofs.sql','202610300001_proof_images_1080.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const legacy=await verified('+919111111111'),pid=await proof(legacy.browser,legacy.attempt),rid=crypto.randomUUID();
  await call('submit',[legacy.browser,legacy.attempt,rid,'Historical Customer','history@example.com',30,'m7','HIST-BAT','HIST-VIN','cash','1','female',pid]);
  const before=(await db.query<any>('select * from public.form_registrations where id=$1',[rid])).rows[0];
  // Model the later dealer-constant overload alongside the original version.
  await db.exec("create function public.form_submit(p_browser_id uuid,p_attempt_id uuid,p_request_id uuid,p_customer_name text,p_email text,p_age integer,p_product_id text,p_battery_id text,p_vin text,p_payment_mode text,p_dealer_id text,p_gender text,p_proof_id uuid,p_dealer_name text) returns jsonb language sql as $$select null::jsonb$$;");
  const migration=await readFile('supabase/migrations/202610300002_product_variants_repeat_purchases.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  const after=(await db.query<any>('select * from public.form_registrations where id=$1',[rid])).rows[0];
  for(const key of Object.keys(before))assert.deepEqual(after[key],before[key],key);
  for(const key of ['product_colour','connectivity','range_variant','charger_type'])assert.equal(after[key],null);
  const resumed=await call('resume_verification',[legacy.browser,'+919111111111']);assert.equal(resumed.id,legacy.attempt);
  assert.equal(Date.parse(resumed.verificationExpiresAt)-Date.parse(resumed.verifiedAt),30*86400000);
  assert.equal(await call('resume_verification',[crypto.randomUUID(),'+919111111111']),null);
  const dbProducts=(await db.query<any>('select * from public.form_products')).rows;
  for(const product of PRODUCT_CATALOG){const p=dbProducts.find((v:any)=>v.id===product.id);assert.deepEqual(p.colour_options,product.colours.map(c=>c.name));}
  for(let i=0;i<PRODUCT_CATALOG.length;i++){
   const p=PRODUCT_CATALOG[i],a=await verified('+9192222222'+String(i).padStart(2,'0')),proofId=await proof(a.browser,a.attempt),record=crypto.randomUUID();
   const args=[a.browser,a.attempt,record,'Variant Customer','',25,p.id,'VAR-B-'+i,'VAR-V-'+i,'cash','1','male',proofId,'Canonical Dealer',p.colours[0].name,p.connectivity?'smart_plus':'',p.range?'long':'',p.longRangeCharger?'fast':''];
   await assert.rejects(call('submit',[...args.slice(0,14),'Invented colour',...args.slice(15)]),/INVALID_PRODUCT_OPTIONS/);
   if(p.longRangeCharger)await assert.rejects(call('submit',[...args.slice(0,17),'']),/INVALID_PRODUCT_OPTIONS/);
   if(!p.connectivity)await assert.rejects(call('submit',[...args.slice(0,15),'standard',...args.slice(16)]),/INVALID_PRODUCT_OPTIONS/);
   if(p.range && !p.longRangeCharger)await assert.rejects(call('submit',[...args.slice(0,17),'fast']),/INVALID_PRODUCT_OPTIONS/);
   const saved=await call('submit',args);assert.equal(saved.email,null);assert.equal(saved.colour,p.colours[0].name);
   assert.equal(saved.chargerType,p.longRangeCharger?'fast':null);
   const worker=crypto.randomUUID(),jobs=await call('claim_sheet_jobs',[worker,1,record]);assert.equal(jobs[0].values.length,21);
   assert.equal(jobs[0].values[9],'');assert.equal(jobs[0].values[17],p.colours[0].name);assert.equal(jobs[0].values[20],p.longRangeCharger?'Fast Charger':'');await call('release_sheet_worker',[worker]);
  }
  await assert.rejects(call('submit',[legacy.browser,legacy.attempt,crypto.randomUUID(),'Old app','a@b.com',30,'m7','BAT','VIN','cash','1','female',pid,'Dealer']),/does not exist/);
  await db.exec('set role anon');await assert.rejects(call('monthly_purchase_status',['+919111111111']),/permission denied/);await db.exec('reset role');
  // Cleanup must not erase an unsubmitted verification that is still remembered.
  const idle=await verified('+919333333333');await db.query("update public.form_otp_attempts set created_at=now()-interval '2 days',verified_at=now()-interval '2 days',verification_expires_at=now()+interval '28 days' where id=$1",[idle.attempt]);
  await call('cleanup_verification_state');assert.equal((await call('resume_verification',[idle.browser,'+919333333333'])).id,idle.attempt);
  await db.query("update public.form_otp_attempts set verification_expires_at=now()-interval '1 second' where id=$1",[idle.attempt]);
  assert.equal(await call('resume_verification',[idle.browser,'+919333333333']),null);
  // Calendar-month boundaries use India time, not UTC midnight.
  // Use a separate phone so this fixture does not count the record saved at now().
  const dates=['2026-10-31T18:29:59Z','2026-10-31T18:30:00Z'];
  for(let i=0;i<dates.length;i++)await db.query("insert into public.form_registrations(id,attempt_id,browser_id,dealer_name,phone,customer_name,email,age,product_id,product_name,payment_mode,verified_at,consent_at,submitted_at) values($1,$2,$3,'History','+919444444444','Historic',null,30,'m7','M7','cash',now(),now(),$4)",[crypto.randomUUID(),legacy.attempt,legacy.browser,dates[i]]);
  assert.equal((await call('monthly_purchase_status',['+919444444444','2026-11-15T00:00:00Z'])).count,1);
 }finally{await db.close();}
});
