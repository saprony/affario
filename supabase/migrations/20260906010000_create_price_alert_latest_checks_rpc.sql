begin;

create function public.affario_price_alert_latest_product_checks(
  p_asins text[]
)
returns table (
  asin text,
  requested_at timestamptz,
  buybox_current_cents integer
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select distinct on (snapshot.asin)
    snapshot.asin,
    snapshot.requested_at,
    snapshot.buybox_current_cents
  from public.keepa_snapshots as snapshot
  where snapshot.asin = any (coalesce(p_asins, '{}'::text[]))
  order by snapshot.asin, snapshot.requested_at desc;
$function$;

revoke execute on function public.affario_price_alert_latest_product_checks(
  text[]
) from public, anon, authenticated;
revoke execute on function public.affario_price_alert_latest_product_checks(
  text[]
) from service_role;
grant execute on function public.affario_price_alert_latest_product_checks(
  text[]
) to service_role;

commit;
