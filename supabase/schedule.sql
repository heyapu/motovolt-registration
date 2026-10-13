-- Run separately AFTER setting the two Vault secrets described in README.md.
-- Never put actual credentials in this file or a git commit.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove previously installed jobs before re-running this setup.
select cron.unschedule(jobid) from cron.job where jobname in ('motovolt-public-sheets-sync','motovolt-public-otp-cleanup');
select cron.schedule('motovolt-public-sheets-sync','* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'motovolt_public_app_origin') || '/api/jobs/sheets',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'motovolt_public_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
select cron.schedule('motovolt-public-otp-cleanup','0 * * * *', 'select public.form_cleanup_verification_state();');
