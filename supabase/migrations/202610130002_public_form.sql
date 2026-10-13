-- Run ONCE as database owner. No staff accounts or auth schema are required.
begin;
create table public.form_products (
  id text primary key check(id in ('urbn','hum','kivo','m7')), name text not null, active boolean not null default true
);
insert into public.form_products(id,name) values ('urbn','URBN'),('hum','Hum'),('kivo','Kivo'),('m7','M7');
create table public.form_otp_attempts (
  id uuid primary key, browser_id uuid not null,
  phone text not null check(phone ~ '^\+91[6-9][0-9]{9}$'),
  otp_hash text check(otp_hash is null or otp_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check(status in ('pending','sent','checking','verified','failed','locked','superseded','consumed')),
  tries integer not null default 0 check(tries between 0 and 5),
  otp_expires_at timestamptz not null default now()+interval '10 minutes',
  check_token uuid, check_until timestamptz,
  verified_at timestamptz, verification_expires_at timestamptz,
  consent_at timestamptz not null default now(), created_at timestamptz not null default now(),
  check(status not in ('verified','consumed') or (verified_at is not null and verification_expires_at is not null))
);
create index form_otp_resume on public.form_otp_attempts(browser_id,phone,created_at desc);
create unique index form_one_verified_per_browser_phone on public.form_otp_attempts(browser_id,phone) where status='verified';
create unique index form_one_active_per_phone on public.form_otp_attempts(phone) where status in ('pending','sent','checking');
create sequence public.form_sheet_row_sequence start 2;
create table public.form_registrations (
  id uuid primary key, attempt_id uuid not null unique references public.form_otp_attempts(id),
  browser_id uuid not null,
  dealer_name text not null check(char_length(dealer_name) between 2 and 120 and dealer_name !~ '[[:cntrl:]]'),
  phone text not null check(phone ~ '^\+91[6-9][0-9]{9}$'),
  customer_name text not null check(char_length(customer_name) between 2 and 100 and customer_name !~ '[[:cntrl:]]'),
  email text not null check(char_length(email)<=254 and email=lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  age integer not null check(age between 1 and 120),
  product_id text not null references public.form_products(id), product_name text not null,
  battery_id text check(battery_id is null or battery_id ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  vin text check(vin is null or vin ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  payment_mode text not null check(payment_mode in ('cash','upi','card','finance')),
  verified_at timestamptz not null, consent_at timestamptz not null, submitted_at timestamptz not null default now(),
  sheet_row bigint not null unique default nextval('public.form_sheet_row_sequence'),
  constraint form_unique_phone unique(phone),
  constraint form_unique_battery unique(battery_id), constraint form_unique_vin unique(vin)
);
create index form_browser_date on public.form_registrations(browser_id,submitted_at desc);
create table public.form_sheet_jobs (
  submission_id uuid primary key references public.form_registrations(id) on delete restrict,
  status text not null default 'pending' check(status in ('pending','processing','done','needs_attention')),
  attempts integer not null default 0, available_at timestamptz not null default now(),
  lease_owner uuid, lease_until timestamptz, last_error text, synced_at timestamptz
);
create index form_sheet_jobs_ready on public.form_sheet_jobs(status,available_at);
create table public.form_worker_leases(id text primary key,owner uuid,expires_at timestamptz not null default '-infinity');
insert into public.form_worker_leases(id) values ('sheets');
create table public.form_audit_events (
  id bigint generated always as identity primary key, browser_id uuid, attempt_id uuid, submission_id uuid,
  event text not null, created_at timestamptz not null default now()
);

-- No anonymous/public browser role can read or mutate customer data or OTP state.
alter table public.form_products enable row level security;
revoke all on public.form_products from public,anon,authenticated;
grant all on public.form_products to service_role;
alter table public.form_otp_attempts enable row level security;
revoke all on public.form_otp_attempts from public,anon,authenticated;
grant all on public.form_otp_attempts to service_role;
alter table public.form_registrations enable row level security;
revoke all on public.form_registrations from public,anon,authenticated;
grant all on public.form_registrations to service_role;
alter table public.form_sheet_jobs enable row level security;
revoke all on public.form_sheet_jobs from public,anon,authenticated;
grant all on public.form_sheet_jobs to service_role;
alter table public.form_worker_leases enable row level security;
revoke all on public.form_worker_leases from public,anon,authenticated;
grant all on public.form_worker_leases to service_role;
alter table public.form_audit_events enable row level security;
revoke all on public.form_audit_events from public,anon,authenticated;
grant all on public.form_audit_events to service_role;
revoke all on sequence public.form_sheet_row_sequence,public.form_audit_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.form_sheet_row_sequence,public.form_audit_events_id_seq to service_role;
create function public.form_attempt_json(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('id',id,'phone',phone,'status',status,'otpExpiresAt',otp_expires_at,
  'verificationExpiresAt',verification_expires_at,'verifiedAt',verified_at,'attemptsRemaining',greatest(0,5-tries)) from public.form_otp_attempts where id=p_id;
$$;
create function public.form_receipt(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('id',id,'dealerName',dealer_name,'phone',phone,'customerName',customer_name,
 'email',email,'age',age,'productName',product_name,'batteryId',battery_id,'vin',vin,'paymentMode',payment_mode,
 'submittedAt',submitted_at,'sheetStatus',coalesce((select j.status from public.form_sheet_jobs j where j.submission_id=public.form_registrations.id),'pending')) from public.form_registrations where id=p_id;
$$;
create function public.form_load_verification(p_browser_id uuid,p_attempt_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin

 if not exists(select 1 from public.form_otp_attempts where id=p_attempt_id and browser_id=p_browser_id) then raise exception 'ATTEMPT_NOT_FOUND'; end if;
 return public.form_attempt_json(p_attempt_id);
end $$;
create function public.form_resume_verification(p_browser_id uuid,p_phone text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a uuid;
begin

 select id into a from public.form_otp_attempts where browser_id=p_browser_id and phone=p_phone and status='verified' and verification_expires_at>now() order by created_at desc limit 1;
 return public.form_attempt_json(a);
end $$;
create function public.form_check_existing(p_browser_id uuid,p_phone text,p_battery_id text,p_vin text,p_attempt_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin

 if p_phone is null or p_phone !~ '^\+91[6-9][0-9]{9}$' then raise exception 'INVALID_INPUT'; end if;
 p_battery_id:=nullif(upper(btrim(p_battery_id)),''); p_vin:=nullif(upper(btrim(p_vin)),'');
 if p_battery_id is not null or p_vin is not null then
  if not exists(select 1 from public.form_otp_attempts where id=p_attempt_id and browser_id=p_browser_id and phone=p_phone and status='verified' and verification_expires_at>now()) then raise exception 'VERIFICATION_EXPIRED'; end if;
 end if;
 return jsonb_build_object('phoneExists',exists(select 1 from public.form_registrations where phone=p_phone),
 'batteryExists',p_battery_id is not null and exists(select 1 from public.form_registrations where battery_id=p_battery_id),
 'vinExists',p_vin is not null and exists(select 1 from public.form_registrations where vin=p_vin));
end $$;
create function public.form_start_verification(p_browser_id uuid,p_attempt_id uuid,p_phone text,p_otp_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.form_otp_attempts; a uuid;
begin

 if p_phone is null or p_phone !~ '^\+91[6-9][0-9]{9}$' or p_otp_hash is null or p_otp_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT'; end if;
 -- SendOTP verification is per mobile: serialize all portal sends for this phone.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,13));
 select * into old from public.form_otp_attempts where id=p_attempt_id;
 if found then
  if old.browser_id<>p_browser_id or old.phone<>p_phone then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('created',false,'verification',public.form_attempt_json(old.id));
 end if;
 if exists(select 1 from public.form_registrations where phone=p_phone) then raise exception 'DUPLICATE_PHONE'; end if;
 select id into a from public.form_otp_attempts where browser_id=p_browser_id and phone=p_phone and status='verified' and verification_expires_at>now() limit 1;
 if a is not null then return jsonb_build_object('created',false,'verification',public.form_attempt_json(a)); end if;
 if exists(select 1 from public.form_otp_attempts where phone=p_phone and
    ((status='pending' and created_at>now()-interval '45 seconds') or (status='checking' and check_until>now()))) then raise exception 'OTP_PENDING'; end if;
 update public.form_otp_attempts set status='superseded',otp_hash=null,check_token=null,check_until=null
  where (phone=p_phone and status in ('pending','sent','checking')) or (browser_id=p_browser_id and phone=p_phone and status='verified');
 insert into public.form_otp_attempts(id,browser_id,phone,otp_hash) values(p_attempt_id,p_browser_id,p_phone,p_otp_hash);
 insert into public.form_audit_events(browser_id,attempt_id,event) values(p_browser_id,p_attempt_id,'otp_requested');
 return jsonb_build_object('created',true,'verification',public.form_attempt_json(p_attempt_id));
end $$;
create function public.form_mark_otp_delivery(p_browser_id uuid,p_attempt_id uuid,p_success boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform public.form_load_verification(p_browser_id,p_attempt_id);
 update public.form_otp_attempts set status=case when p_success then 'sent' else 'failed' end,
 otp_hash=case when p_success then otp_hash else null end where id=p_attempt_id and status='pending';
 insert into public.form_audit_events(browser_id,attempt_id,event) values(p_browser_id,p_attempt_id,case when p_success then 'otp_sent' else 'otp_delivery_failed' end);
 return public.form_attempt_json(p_attempt_id);
end $$;
-- A correct local digest binds the submitted code to this exact browser/challenge.
-- Verification is granted only AFTER the backend also confirms MSG91 verification.
create function public.form_reserve_otp_check(p_browser_id uuid,p_attempt_id uuid,p_otp_hash text,p_check_token uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.form_otp_attempts;
begin

 select * into a from public.form_otp_attempts where id=p_attempt_id and browser_id=p_browser_id for update;
 if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
 if a.status='verified' and a.verification_expires_at>now() then return jsonb_build_object('ok',true,'providerCheck',false,'verification',public.form_attempt_json(a.id)); end if;
 if a.status='checking' and a.check_until>now() then return jsonb_build_object('ok',false,'code','OTP_PENDING'); end if;
 if a.status='locked' or a.tries>=5 then return jsonb_build_object('ok',false,'code','OTP_LOCKED'); end if;
 if a.status not in ('sent','checking') or a.otp_expires_at<=now() then return jsonb_build_object('ok',false,'code','OTP_EXPIRED'); end if;
 update public.form_otp_attempts set tries=tries+1 where id=a.id;
 if a.otp_hash is distinct from p_otp_hash then
  update public.form_otp_attempts set status=case when a.tries+1>=5 then 'locked' else 'sent' end,
   otp_hash=case when a.tries+1>=5 then null else otp_hash end,check_token=null,check_until=null where id=a.id;
  insert into public.form_audit_events(browser_id,attempt_id,event) values(p_browser_id,a.id,'otp_incorrect');
  return jsonb_build_object('ok',false,'code',case when a.tries+1>=5 then 'OTP_LOCKED' else 'OTP_INCORRECT' end,'attemptsRemaining',4-a.tries);
 end if;
 update public.form_otp_attempts set status='checking',check_token=p_check_token,check_until=now()+interval '45 seconds' where id=a.id;
 return jsonb_build_object('ok',true,'providerCheck',true);
end $$;
create function public.form_finish_otp_check(p_browser_id uuid,p_attempt_id uuid,p_check_token uuid,p_success boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.form_otp_attempts;
begin

 select * into a from public.form_otp_attempts where id=p_attempt_id and browser_id=p_browser_id for update;
 if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
 if a.status='verified' and a.verification_expires_at>now() then return jsonb_build_object('ok',true,'verification',public.form_attempt_json(a.id)); end if;
 if a.status<>'checking' or a.check_token is distinct from p_check_token or a.check_until<=now() then raise exception 'OTP_CHECK_EXPIRED'; end if;
 if a.otp_expires_at<=now() then
  update public.form_otp_attempts set status='failed',otp_hash=null,check_token=null,check_until=null where id=a.id;
  return jsonb_build_object('ok',false,'code','OTP_EXPIRED');
 end if;
 if p_success is not true then
  update public.form_otp_attempts set status=case when a.tries>=5 then 'locked' else 'sent' end,
   otp_hash=case when a.tries>=5 then null else otp_hash end,check_token=null,check_until=null where id=a.id;
  return jsonb_build_object('ok',false,'code','OTP_PROVIDER_FAILED');
 end if;
 update public.form_otp_attempts set status='verified',verified_at=now(),verification_expires_at=now()+interval '60 minutes',
 otp_hash=null,check_token=null,check_until=null where id=a.id;
 insert into public.form_audit_events(browser_id,attempt_id,event) values(p_browser_id,a.id,'phone_verified');
 return jsonb_build_object('ok',true,'verification',public.form_attempt_json(a.id));
end $$;
create function public.form_submit(p_browser_id uuid,p_attempt_id uuid,p_request_id uuid,p_customer_name text,p_email text,p_age integer,p_product_id text,p_battery_id text,p_vin text,p_payment_mode text,p_dealer_name text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.form_otp_attempts; existing public.form_registrations; prod text; dealer_label text; violated text;
begin

 p_dealer_name:=btrim(p_dealer_name);
 p_customer_name:=btrim(p_customer_name); p_email:=lower(btrim(p_email));
 p_battery_id:=nullif(upper(btrim(p_battery_id)),''); p_vin:=nullif(upper(btrim(p_vin)),'');
 if p_dealer_name is null or char_length(p_dealer_name) not between 2 and 120 or p_dealer_name ~ '[[:cntrl:]]'
 or p_customer_name is null or char_length(p_customer_name) not between 2 and 100 or p_customer_name ~ '[[:cntrl:]]'
 or p_email is null or char_length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or p_age is null or p_age not between 1 and 120 or p_payment_mode is null or p_payment_mode not in ('cash','upi','card','finance')
 or (p_battery_id is not null and p_battery_id !~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$')
 or (p_vin is not null and p_vin !~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$') then raise exception 'INVALID_INPUT'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,14));
 select * into existing from public.form_registrations where id=p_request_id;
 if found then
  if existing.browser_id<>p_browser_id or existing.dealer_name<>p_dealer_name or existing.customer_name<>p_customer_name or existing.email<>p_email
   or existing.age<>p_age or existing.product_id is distinct from p_product_id or existing.battery_id is distinct from p_battery_id
   or existing.vin is distinct from p_vin or existing.payment_mode<>p_payment_mode then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  -- Retrying with a new challenge cannot silently return a different phone's record.
  if p_attempt_id is distinct from existing.attempt_id and not exists(select 1 from public.form_otp_attempts
    where id=p_attempt_id and browser_id=p_browser_id and phone=existing.phone) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return public.form_receipt(existing.id);
 end if;
 select * into a from public.form_otp_attempts where id=p_attempt_id and browser_id=p_browser_id for update;
 if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
 select * into existing from public.form_registrations where attempt_id=p_attempt_id;
 if found then
  if existing.dealer_name<>p_dealer_name or existing.customer_name<>p_customer_name or existing.email<>p_email or existing.age<>p_age or existing.product_id is distinct from p_product_id
   or existing.battery_id is distinct from p_battery_id or existing.vin is distinct from p_vin or existing.payment_mode<>p_payment_mode then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return public.form_receipt(existing.id);
 end if;
 if a.status<>'verified' or a.verification_expires_at<=now() then raise exception 'VERIFICATION_EXPIRED'; end if;
 select name into prod from public.form_products where id=p_product_id and active;
 if prod is null then raise exception 'INVALID_PRODUCT'; end if;
 dealer_label:=p_dealer_name;
 begin
  insert into public.form_registrations(id,attempt_id,browser_id,dealer_name,phone,customer_name,email,age,product_id,product_name,battery_id,vin,payment_mode,verified_at,consent_at)
  values(p_request_id,a.id,p_browser_id,dealer_label,a.phone,p_customer_name,p_email,p_age,p_product_id,prod,p_battery_id,p_vin,p_payment_mode,a.verified_at,a.consent_at);
 exception when unique_violation then
  get stacked diagnostics violated=CONSTRAINT_NAME;
  if violated='form_unique_battery' then raise exception 'DUPLICATE_BATTERY';
  elsif violated='form_unique_vin' then raise exception 'DUPLICATE_VIN';
  elsif violated='form_unique_phone' then raise exception 'DUPLICATE_PHONE';
  else raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 end;
 update public.form_otp_attempts set status='consumed',otp_hash=null where id=a.id;
 insert into public.form_sheet_jobs(submission_id) values(p_request_id);
 insert into public.form_audit_events(browser_id,attempt_id,submission_id,event) values(p_browser_id,a.id,p_request_id,'registration_submitted');
 return public.form_receipt(p_request_id);
end $$;
create function public.form_get_submission(p_browser_id uuid,p_request_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin

 if not exists(select 1 from public.form_registrations where id=p_request_id and browser_id=p_browser_id) then return null; end if;
 return public.form_receipt(p_request_id);
end $$;
create function public.form_reject_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'SUBMISSION_IMMUTABLE'; end $$;
create trigger form_immutable before update or delete on public.form_registrations for each row execute function public.form_reject_mutation();

create function public.form_claim_sheet_jobs(p_worker_id uuid, p_limit integer default 5, p_submission_id uuid default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_lease public.form_worker_leases; v_jobs jsonb;
begin
  select * into v_lease from public.form_worker_leases where id = 'sheets' for update;
  if v_lease.expires_at > now() then return '[]'::jsonb; end if;
  update public.form_worker_leases set owner = p_worker_id, expires_at = now() + interval '120 seconds' where id = 'sheets';
  update public.form_sheet_jobs set status = 'needs_attention', lease_owner = null, lease_until = null
    where status in ('pending','processing') and attempts >= 12 and (lease_until is null or lease_until <= now());
  with ready as (
    select submission_id from public.form_sheet_jobs where attempts < 12 and (p_submission_id is null or submission_id=p_submission_id) and
      ((status = 'pending' and available_at <= now()) or (status = 'processing' and lease_until <= now()))
      order by available_at limit least(greatest(p_limit,1),5) for update skip locked
  ), claimed as (
    update public.form_sheet_jobs j set status = 'processing', lease_owner = p_worker_id, lease_until = now() + interval '120 seconds', attempts = attempts + 1
      from ready where j.submission_id = ready.submission_id returning j.submission_id
  ) select coalesce(jsonb_agg(jsonb_build_object('submissionId',r.id,'row',r.sheet_row,
      'values',jsonb_build_array(r.id::text,r.dealer_name,r.phone,r.customer_name,r.product_name,'',r.verified_at::text,r.submitted_at::text,'',r.email,r.age::text,coalesce(r.battery_id,''),coalesce(r.vin,''),case r.payment_mode when 'cash' then 'Cash' when 'upi' then 'UPI' when 'card' then 'Credit Card / Debit Card' else 'Finance' end)) order by r.sheet_row), '[]'::jsonb)
    into v_jobs from claimed c join public.form_registrations r on r.id = c.submission_id;
  return v_jobs;
end $$;

create function public.form_finish_sheet_job(p_worker_id uuid, p_submission_id uuid, p_success boolean, p_error text default null) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.form_sheet_jobs set status = case when p_success then 'done' when attempts >= 12 then 'needs_attention' else 'pending' end,
    synced_at = case when p_success then now() else null end,
    last_error = case when p_success then null else left(coalesce(p_error,'SHEETS_UNAVAILABLE'),80) end,
    available_at = now() + make_interval(secs => least(3600, (power(2, least(attempts,10))*15)::integer)),
    lease_owner = null, lease_until = null
    where submission_id = p_submission_id and status = 'processing' and lease_owner = p_worker_id and lease_until > now();
end $$;
create function public.form_release_sheet_worker(p_worker_id uuid) returns void
language sql security invoker set search_path = '' as $$
  update public.form_worker_leases set owner = null, expires_at = '-infinity' where id = 'sheets' and owner = p_worker_id;
$$;
create function public.form_cleanup_verification_state() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.form_otp_attempts set otp_hash = null, status = 'failed' where status in ('pending','sent','checking') and otp_expires_at < now();
  update public.form_otp_attempts set otp_hash = null, status = 'superseded' where status = 'verified' and verification_expires_at < now();
  delete from public.form_otp_attempts a where created_at < now() - interval '24 hours'
    and not exists(select 1 from public.form_registrations r where r.attempt_id = a.id);
end $$;



revoke execute on function public.form_attempt_json(uuid),
 public.form_receipt(uuid),
 public.form_load_verification(uuid,uuid),
 public.form_resume_verification(uuid,text),
 public.form_check_existing(uuid,text,text,text,uuid),
 public.form_start_verification(uuid,uuid,text,text),
 public.form_mark_otp_delivery(uuid,uuid,boolean),
 public.form_reserve_otp_check(uuid,uuid,text,uuid),
 public.form_finish_otp_check(uuid,uuid,uuid,boolean),
 public.form_submit(uuid,uuid,uuid,text,text,integer,text,text,text,text,text),
 public.form_get_submission(uuid,uuid),
 public.form_reject_mutation(),
 public.form_claim_sheet_jobs(uuid,integer,uuid),
 public.form_finish_sheet_job(uuid,uuid,boolean,text),
 public.form_release_sheet_worker(uuid),
 public.form_cleanup_verification_state() from public,anon,authenticated;
grant execute on function public.form_attempt_json(uuid),
 public.form_receipt(uuid),
 public.form_load_verification(uuid,uuid),
 public.form_resume_verification(uuid,text),
 public.form_check_existing(uuid,text,text,text,uuid),
 public.form_start_verification(uuid,uuid,text,text),
 public.form_mark_otp_delivery(uuid,uuid,boolean),
 public.form_reserve_otp_check(uuid,uuid,text,uuid),
 public.form_finish_otp_check(uuid,uuid,uuid,boolean),
 public.form_submit(uuid,uuid,uuid,text,text,integer,text,text,text,text,text),
 public.form_get_submission(uuid,uuid),
 public.form_reject_mutation(),
 public.form_claim_sheet_jobs(uuid,integer,uuid),
 public.form_finish_sheet_job(uuid,uuid,boolean,text),
 public.form_release_sheet_worker(uuid),
 public.form_cleanup_verification_state() to service_role;
commit;
