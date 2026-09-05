begin;

create table public.distributed_leases (
  resource_type text not null,
  resource_key text not null,
  owner_token text not null,
  claimed_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (resource_type, resource_key),
  constraint distributed_leases_resource_type_check check (
    resource_type ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint distributed_leases_resource_key_check check (
    resource_key ~ '^[a-f0-9]{64}$'
  ),
  constraint distributed_leases_owner_token_check check (
    owner_token ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint distributed_leases_expiry_check check (
    expires_at > claimed_at
  )
);

alter table public.distributed_leases enable row level security;

revoke all on table public.distributed_leases
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.distributed_leases
  to service_role;

create function public.affario_try_claim_distributed_lease(
  p_resource_type text,
  p_resource_key text,
  p_owner_token text,
  p_lease_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  claim_time timestamptz := clock_timestamp();
  claimed boolean;
begin
  if p_resource_type is null
    or p_resource_type !~ '^[a-z][a-z0-9_]{0,63}$'
    or p_resource_key is null
    or p_resource_key !~ '^[a-f0-9]{64}$'
    or p_owner_token is null
    or p_owner_token !~ '^[A-Za-z0-9_-]{43}$'
    or p_lease_seconds is null
    or p_lease_seconds < 1
    or p_lease_seconds > 3600 then
    raise exception 'Invalid distributed lease claim input';
  end if;

  with claimed_lease as (
    insert into public.distributed_leases as current_lease (
      resource_type,
      resource_key,
      owner_token,
      claimed_at,
      expires_at
    )
    values (
      p_resource_type,
      p_resource_key,
      p_owner_token,
      claim_time,
      claim_time + make_interval(secs => p_lease_seconds)
    )
    on conflict (resource_type, resource_key) do update
    set
      owner_token = excluded.owner_token,
      claimed_at = excluded.claimed_at,
      expires_at = excluded.expires_at
    where current_lease.expires_at <= claim_time
    returning 1
  )
  select exists(select 1 from claimed_lease) into claimed;

  return claimed;
end;
$function$;

create function public.affario_release_distributed_lease(
  p_resource_type text,
  p_resource_key text,
  p_owner_token text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  released_rows integer;
begin
  if p_resource_type is null
    or p_resource_type !~ '^[a-z][a-z0-9_]{0,63}$'
    or p_resource_key is null
    or p_resource_key !~ '^[a-f0-9]{64}$'
    or p_owner_token is null
    or p_owner_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid distributed lease release input';
  end if;

  delete from public.distributed_leases
  where resource_type = p_resource_type
    and resource_key = p_resource_key
    and owner_token = p_owner_token;

  get diagnostics released_rows = row_count;
  return released_rows = 1;
end;
$function$;

revoke execute on function public.affario_try_claim_distributed_lease(
  text,
  text,
  text,
  integer
) from public, anon, authenticated, service_role;
revoke execute on function public.affario_release_distributed_lease(
  text,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.affario_try_claim_distributed_lease(
  text,
  text,
  text,
  integer
) to service_role;
grant execute on function public.affario_release_distributed_lease(
  text,
  text,
  text
) to service_role;

comment on table public.distributed_leases is
  'Lease tecniche recuperabili; le resource key sono digest senza PII o identificatori raw.';

commit;
