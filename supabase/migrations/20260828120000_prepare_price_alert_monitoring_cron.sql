begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $migration$
declare
  scheduled_job_id bigint;
  scheduled_command text := $command$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'affario_alert_monitoring_url'
      ),
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type',
        'application/json',
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'affario_alert_monitoring_secret'
        )
      ),
      timeout_milliseconds := 290000
    );
  $command$;
begin
  scheduled_job_id := cron.schedule_in_database(
    job_name := 'affario-price-alert-monitoring-hourly',
    schedule := '0 * * * *',
    command := scheduled_command,
    database := current_database(),
    active := false
  );

  perform cron.alter_job(
    job_id := scheduled_job_id,
    active := false
  );

  if exists (
    select 1
    from cron.job
    where jobid = scheduled_job_id
      and active
  ) then
    raise exception 'The price alert monitoring cron job must remain inactive';
  end if;
end;
$migration$;

commit;
