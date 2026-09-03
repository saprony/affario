begin;

create table public.abuse_rate_limits (
  scope text not null,
  subject_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  request_limit integer not null,
  window_seconds integer not null,
  last_seen_at timestamptz not null,
  primary key (scope, subject_hash),
  constraint abuse_rate_limits_scope_check check (
    scope ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint abuse_rate_limits_subject_hash_check check (
    subject_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint abuse_rate_limits_request_count_check check (
    request_count > 0
  ),
  constraint abuse_rate_limits_request_limit_check check (
    request_limit between 1 and 10000
  ),
  constraint abuse_rate_limits_window_seconds_check check (
    window_seconds between 1 and 86400
  )
);

alter table public.abuse_rate_limits enable row level security;

revoke all on table public.abuse_rate_limits
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.abuse_rate_limits
  to service_role;

create function public.affario_consume_abuse_rate_limit(
  p_checks jsonb
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_checks is null
    or jsonb_typeof(p_checks) <> 'array'
    or jsonb_array_length(p_checks) not between 1 and 8 then
    raise exception 'Invalid abuse rate limit input';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_checks) as requested_check(
      scope text,
      subject_hash text,
      request_limit integer,
      window_seconds integer
    )
    where requested_check.scope is null
      or requested_check.scope !~ '^[a-z][a-z0-9_]{0,63}$'
      or requested_check.subject_hash is null
      or requested_check.subject_hash !~ '^[a-f0-9]{64}$'
      or requested_check.request_limit is null
      or requested_check.request_limit not between 1 and 10000
      or requested_check.window_seconds is null
      or requested_check.window_seconds not between 1 and 86400
  ) then
    raise exception 'Invalid abuse rate limit input';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_checks) as requested_check(
      scope text,
      subject_hash text,
      request_limit integer,
      window_seconds integer
    )
    group by requested_check.scope, requested_check.subject_hash
    having count(*) > 1
  ) then
    raise exception 'Duplicate abuse rate limit input';
  end if;

  return query
  with requested_checks as materialized (
    select
      requested_check.scope,
      requested_check.subject_hash,
      requested_check.request_limit,
      requested_check.window_seconds
    from jsonb_to_recordset(p_checks) as requested_check(
      scope text,
      subject_hash text,
      request_limit integer,
      window_seconds integer
    )
  ),
  consumed as (
    insert into public.abuse_rate_limits as current_window (
      scope,
      subject_hash,
      window_started_at,
      request_count,
      request_limit,
      window_seconds,
      last_seen_at
    )
    select
      requested_checks.scope,
      requested_checks.subject_hash,
      v_now,
      1,
      requested_checks.request_limit,
      requested_checks.window_seconds,
      v_now
    from requested_checks
    order by requested_checks.scope, requested_checks.subject_hash
    on conflict (scope, subject_hash) do update
    set
      window_started_at = case
        when current_window.window_started_at
          + make_interval(secs => excluded.window_seconds) <= v_now
          then v_now
        else current_window.window_started_at
      end,
      request_count = case
        when current_window.window_started_at
          + make_interval(secs => excluded.window_seconds) <= v_now
          then 1
        else least(
          current_window.request_count + 1,
          excluded.request_limit + 1
        )
      end,
      request_limit = excluded.request_limit,
      window_seconds = excluded.window_seconds,
      last_seen_at = v_now
    returning
      request_count,
      request_limit,
      window_started_at,
      window_seconds
  )
  select
    coalesce(
      bool_and(consumed.request_count <= consumed.request_limit),
      false
    ),
    case
      when coalesce(
        bool_and(consumed.request_count <= consumed.request_limit),
        false
      ) then 0
      else coalesce(
        max(
          case
            when consumed.request_count < consumed.request_limit then 0
            else greatest(
              1,
              ceil(
                extract(
                  epoch from (
                    consumed.window_started_at
                    + make_interval(secs => consumed.window_seconds)
                    - v_now
                  )
                )
              )::integer
            )
          end
        ),
        1
      )::integer
    end
  from consumed;
end;
$function$;

revoke execute on function public.affario_consume_abuse_rate_limit(
  jsonb
) from public, anon, authenticated;
revoke execute on function public.affario_consume_abuse_rate_limit(
  jsonb
) from service_role;
grant execute on function public.affario_consume_abuse_rate_limit(
  jsonb
) to service_role;

comment on table public.abuse_rate_limits is
  'Finestre rate limit aggregate per scope e digest HMAC pseudonimizzato.';

commit;
