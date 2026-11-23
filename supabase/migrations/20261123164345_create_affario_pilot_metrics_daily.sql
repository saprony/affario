begin;

create table public.affario_pilot_metrics_daily (
  metric_date date not null,
  metric_name text not null,
  metric_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (metric_date, metric_name),
  constraint affario_pilot_metrics_daily_name_check check (
    metric_name in ('search', 'analysis')
  ),
  constraint affario_pilot_metrics_daily_count_check check (
    metric_count >= 0
  )
);

alter table public.affario_pilot_metrics_daily enable row level security;

revoke all on table public.affario_pilot_metrics_daily
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.affario_pilot_metrics_daily
  to service_role;

create function public.increment_affario_pilot_metric(
  p_metric_name text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if p_metric_name is null
    or p_metric_name not in ('search', 'analysis') then
    raise exception 'Invalid AFFARIO pilot metric';
  end if;

  insert into public.affario_pilot_metrics_daily as daily_metric (
    metric_date,
    metric_name,
    metric_count,
    updated_at
  ) values (
    timezone('Europe/Rome', now())::date,
    p_metric_name,
    1,
    now()
  )
  on conflict (metric_date, metric_name) do update
  set
    metric_count = daily_metric.metric_count + 1,
    updated_at = excluded.updated_at;
end;
$function$;

revoke execute on function public.increment_affario_pilot_metric(text)
  from public, anon, authenticated, service_role;
grant execute on function public.increment_affario_pilot_metric(text)
  to service_role;

comment on table public.affario_pilot_metrics_daily is
  'Contatori giornalieri aggregati e anonimi del pilot pubblico AFFARIO.';

commit;
