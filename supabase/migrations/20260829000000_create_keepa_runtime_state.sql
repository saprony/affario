begin;

create table public.keepa_runtime_state (
  singleton boolean primary key default true,
  observed_at timestamptz,
  tokens_left integer,
  tokens_consumed integer,
  refill_rate integer,
  refill_in_ms integer,
  token_flow_reduction double precision,
  interactive_429_count bigint not null default 0,
  last_interactive_429_at timestamptz,
  background_429_count bigint not null default 0,
  last_background_429_at timestamptz,
  background_bootstrap_attempted_at timestamptz,
  background_lease_started_at timestamptz,
  background_lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint keepa_runtime_state_singleton_check check (singleton),
  constraint keepa_runtime_state_observation_check check (
    (
      observed_at is null
      and tokens_left is null
      and tokens_consumed is null
      and refill_rate is null
      and refill_in_ms is null
      and token_flow_reduction is null
    )
    or
    (
      observed_at is not null
      and tokens_left is not null
      and tokens_consumed is not null
      and tokens_consumed >= 0
      and refill_rate is not null
      and refill_rate >= 0
      and refill_in_ms is not null
      and refill_in_ms >= 0
      and token_flow_reduction is not null
      and token_flow_reduction >= 0
    )
  ),
  constraint keepa_runtime_state_429_counts_check check (
    interactive_429_count >= 0
    and background_429_count >= 0
  ),
  constraint keepa_runtime_state_lease_check check (
    (
      background_lease_started_at is null
      and background_lease_until is null
    )
    or
    (
      background_lease_started_at is not null
      and background_lease_until > background_lease_started_at
    )
  )
);

alter table public.keepa_runtime_state enable row level security;

revoke all on table public.keepa_runtime_state
  from public, anon, authenticated;
grant select, insert, update on table public.keepa_runtime_state
  to service_role;

create function public.affario_keepa_record_runtime_observation(
  p_observed_at timestamptz,
  p_has_observation boolean,
  p_tokens_left integer,
  p_tokens_consumed integer,
  p_refill_rate integer,
  p_refill_in_ms integer,
  p_token_flow_reduction double precision,
  p_context text,
  p_rate_limited boolean,
  p_background_lease_started_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if p_observed_at is null
    or p_has_observation is null
    or p_context is null
    or p_rate_limited is null then
    raise exception 'Missing Keepa runtime observation input';
  end if;

  if p_context not in ('interactive', 'background_alert') then
    raise exception 'Invalid Keepa request context';
  end if;

  if p_has_observation and (
    p_tokens_left is null
    or p_tokens_consumed is null
    or p_tokens_consumed < 0
    or p_refill_rate is null
    or p_refill_rate < 0
    or p_refill_in_ms is null
    or p_refill_in_ms < 0
    or p_token_flow_reduction is null
    or p_token_flow_reduction < 0
  ) then
    raise exception 'Invalid Keepa runtime observation';
  end if;

  if not p_has_observation and (
    p_tokens_left is not null
    or p_tokens_consumed is not null
    or p_refill_rate is not null
    or p_refill_in_ms is not null
    or p_token_flow_reduction is not null
  ) then
    raise exception 'Unexpected partial Keepa runtime observation';
  end if;

  if p_context = 'interactive'
    and p_background_lease_started_at is not null then
    raise exception 'Interactive requests cannot release background leases';
  end if;

  if p_context = 'background_alert'
    and p_background_lease_started_at is null then
    raise exception 'Background requests require their lease marker';
  end if;

  insert into public.keepa_runtime_state as current_state (
    singleton,
    observed_at,
    tokens_left,
    tokens_consumed,
    refill_rate,
    refill_in_ms,
    token_flow_reduction,
    interactive_429_count,
    last_interactive_429_at,
    background_429_count,
    last_background_429_at,
    updated_at
  )
  values (
    true,
    case when p_has_observation then p_observed_at end,
    case when p_has_observation then p_tokens_left end,
    case when p_has_observation then p_tokens_consumed end,
    case when p_has_observation then p_refill_rate end,
    case when p_has_observation then p_refill_in_ms end,
    case when p_has_observation then p_token_flow_reduction end,
    case when p_rate_limited and p_context = 'interactive' then 1 else 0 end,
    case
      when p_rate_limited and p_context = 'interactive'
        then p_observed_at
    end,
    case
      when p_rate_limited and p_context = 'background_alert' then 1
      else 0
    end,
    case
      when p_rate_limited and p_context = 'background_alert'
        then p_observed_at
    end,
    clock_timestamp()
  )
  on conflict (singleton) do update
  set
    observed_at = case
      when excluded.observed_at is not null
        and (
          current_state.observed_at is null
          or excluded.observed_at >= current_state.observed_at
        )
        then excluded.observed_at
      else current_state.observed_at
    end,
    tokens_left = case
      when excluded.observed_at is not null
        and (
          current_state.observed_at is null
          or excluded.observed_at >= current_state.observed_at
        )
        then excluded.tokens_left
      else current_state.tokens_left
    end,
    tokens_consumed = case
      when excluded.observed_at is not null
        and (
          current_state.observed_at is null
          or excluded.observed_at >= current_state.observed_at
        )
        then excluded.tokens_consumed
      else current_state.tokens_consumed
    end,
    refill_rate = case
      when excluded.observed_at is not null
        and (
          current_state.observed_at is null
          or excluded.observed_at >= current_state.observed_at
        )
        then excluded.refill_rate
      else current_state.refill_rate
    end,
    refill_in_ms = case
      when excluded.observed_at is not null
        and (
          current_state.observed_at is null
          or excluded.observed_at >= current_state.observed_at
        )
        then excluded.refill_in_ms
      else current_state.refill_in_ms
    end,
    token_flow_reduction = case
      when excluded.observed_at is not null
        and (
          current_state.observed_at is null
          or excluded.observed_at >= current_state.observed_at
        )
        then excluded.token_flow_reduction
      else current_state.token_flow_reduction
    end,
    interactive_429_count =
      current_state.interactive_429_count + excluded.interactive_429_count,
    last_interactive_429_at = case
      when excluded.last_interactive_429_at is not null
        and (
          current_state.last_interactive_429_at is null
          or excluded.last_interactive_429_at >
            current_state.last_interactive_429_at
        )
        then excluded.last_interactive_429_at
      else current_state.last_interactive_429_at
    end,
    background_429_count =
      current_state.background_429_count + excluded.background_429_count,
    last_background_429_at = case
      when excluded.last_background_429_at is not null
        and (
          current_state.last_background_429_at is null
          or excluded.last_background_429_at >
            current_state.last_background_429_at
        )
        then excluded.last_background_429_at
      else current_state.last_background_429_at
    end,
    background_lease_started_at = case
      when p_context = 'background_alert'
        and current_state.background_lease_started_at
          is not distinct from p_background_lease_started_at
        then null
      else current_state.background_lease_started_at
    end,
    background_lease_until = case
      when p_context = 'background_alert'
        and current_state.background_lease_started_at
          is not distinct from p_background_lease_started_at
        then null
      else current_state.background_lease_until
    end,
    updated_at = clock_timestamp();
end;
$function$;

create function public.affario_keepa_try_acquire_background_request(
  p_estimated_cost integer,
  p_reserve integer,
  p_now timestamptz,
  p_lease_duration_ms integer
)
returns table (
  allowed boolean,
  budget_status text,
  lease_started_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  runtime_state public.keepa_runtime_state%rowtype;
  lease_marker timestamptz;
  effective_refill bigint;
  bucket_capacity bigint;
  elapsed_ms bigint;
  refill_events bigint := 0;
  estimated_tokens bigint;
begin
  if p_estimated_cost is null
    or p_reserve is null
    or p_now is null
    or p_lease_duration_ms is null
    or p_estimated_cost <= 0
    or p_reserve < 0
    or p_lease_duration_ms < 1000
    or p_lease_duration_ms > 300000 then
    raise exception 'Invalid Keepa background budget input';
  end if;

  insert into public.keepa_runtime_state (singleton)
  values (true)
  on conflict (singleton) do nothing;

  select *
  into runtime_state
  from public.keepa_runtime_state
  where singleton
  for update;

  if runtime_state.background_lease_until is not null
    and runtime_state.background_lease_until > p_now then
    return query select false, 'UNKNOWN'::text, null::timestamptz;
    return;
  end if;

  if runtime_state.observed_at is null then
    if runtime_state.background_bootstrap_attempted_at is not null
      and not (
        runtime_state.background_lease_started_at is not null
        and runtime_state.background_lease_until is not null
        and runtime_state.background_lease_until <= p_now
      ) then
      return query select false, 'UNKNOWN'::text, null::timestamptz;
      return;
    end if;

    lease_marker := clock_timestamp();

    update public.keepa_runtime_state
    set
      background_bootstrap_attempted_at = p_now,
      background_lease_started_at = lease_marker,
      background_lease_until =
        lease_marker + make_interval(secs => p_lease_duration_ms / 1000.0),
      updated_at = lease_marker
    where singleton;

    return query select true, 'UNKNOWN'::text, lease_marker;
    return;
  end if;

  effective_refill := greatest(
    0,
    runtime_state.refill_rate::bigint
      - round(runtime_state.token_flow_reduction::numeric)::bigint
  );
  bucket_capacity := runtime_state.refill_rate::bigint * 60;
  elapsed_ms := greatest(
    0,
    floor(extract(epoch from (p_now - runtime_state.observed_at)) * 1000)
  )::bigint;

  if elapsed_ms >= runtime_state.refill_in_ms then
    refill_events := 1 +
      ((elapsed_ms - runtime_state.refill_in_ms) / 60000);
  end if;

  estimated_tokens := least(
    bucket_capacity,
    runtime_state.tokens_left::bigint + refill_events * effective_refill
  );

  if estimated_tokens - p_estimated_cost < p_reserve then
    return query select
      false,
      case
        when estimated_tokens < p_estimated_cost then 'EXHAUSTED'::text
        else 'RESERVE'::text
      end,
      null::timestamptz;
    return;
  end if;

  lease_marker := clock_timestamp();

  update public.keepa_runtime_state
  set
    background_lease_started_at = lease_marker,
    background_lease_until =
      lease_marker + make_interval(secs => p_lease_duration_ms / 1000.0),
    updated_at = lease_marker
  where singleton;

  return query select true, 'OK'::text, lease_marker;
end;
$function$;

create function public.affario_keepa_release_background_request(
  p_lease_started_at timestamptz
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $function$
  update public.keepa_runtime_state
  set
    background_lease_started_at = null,
    background_lease_until = null,
    updated_at = clock_timestamp()
  where singleton
    and background_lease_started_at = p_lease_started_at;
$function$;

revoke execute on function public.affario_keepa_record_runtime_observation(
  timestamptz,
  boolean,
  integer,
  integer,
  integer,
  integer,
  double precision,
  text,
  boolean,
  timestamptz
) from public, anon, authenticated;
revoke execute on function public.affario_keepa_try_acquire_background_request(
  integer,
  integer,
  timestamptz,
  integer
) from public, anon, authenticated;
revoke execute on function public.affario_keepa_release_background_request(
  timestamptz
) from public, anon, authenticated;

grant execute on function public.affario_keepa_record_runtime_observation(
  timestamptz,
  boolean,
  integer,
  integer,
  integer,
  integer,
  double precision,
  text,
  boolean,
  timestamptz
) to service_role;
grant execute on function public.affario_keepa_try_acquire_background_request(
  integer,
  integer,
  timestamptz,
  integer
) to service_role;
grant execute on function public.affario_keepa_release_background_request(
  timestamptz
) to service_role;

comment on table public.keepa_runtime_state is
  'Stato operativo aggregato del bucket Keepa, senza PII o payload provider.';
comment on column public.keepa_runtime_state.background_bootstrap_attempted_at is
  'Impedisce batch background ciechi prima della prima telemetria valida.';

commit;
