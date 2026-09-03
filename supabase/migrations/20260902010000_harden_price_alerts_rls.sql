begin;

do $migration$
declare
  id_type text;
  id_identity text;
  id_default_expression text;
  id_sequence_name text;
begin
  if to_regclass('public.price_alerts') is null then
    raise exception 'public.price_alerts does not exist';
  end if;

  select
    format_type(id_column.atttypid, id_column.atttypmod),
    id_column.attidentity::text,
    pg_get_expr(id_default.adbin, id_default.adrelid),
    pg_get_serial_sequence('public.price_alerts', 'id')
  into
    id_type,
    id_identity,
    id_default_expression,
    id_sequence_name
  from pg_catalog.pg_attribute as id_column
  left join pg_catalog.pg_attrdef as id_default
    on id_default.adrelid = id_column.attrelid
    and id_default.adnum = id_column.attnum
  where id_column.attrelid = 'public.price_alerts'::regclass
    and id_column.attname = 'id'
    and id_column.attnum > 0
    and not id_column.attisdropped;

  if not found then
    raise exception 'public.price_alerts.id does not exist';
  end if;

  if id_identity in ('a', 'd') and id_sequence_name is null then
    raise exception 'Unable to resolve identity sequence for public.price_alerts.id';
  end if;

  if id_identity not in ('a', 'd') and id_default_expression is null then
    raise exception 'public.price_alerts.id has no server-side generation';
  end if;

  if id_sequence_name is null
    and id_default_expression ~* '^nextval\(' then
    raise exception 'Unable to resolve sequence default for public.price_alerts.id';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as index_definition
    join pg_catalog.pg_class as index_relation
      on index_relation.oid = index_definition.indexrelid
    join pg_catalog.pg_namespace as index_namespace
      on index_namespace.oid = index_relation.relnamespace
    where index_definition.indrelid = 'public.price_alerts'::regclass
      and index_namespace.nspname = 'public'
      and index_relation.relname = 'price_alerts_unique_exact_alert_idx'
      and index_definition.indisunique
      and index_definition.indexprs is null
      and index_definition.indpred is null
      and index_definition.indnkeyatts = 3
      and index_definition.indnatts = 3
      and (
        select array_agg(
          indexed_column.attname::text
          order by index_key.ordinality
        )
        from unnest(index_definition.indkey) with ordinality
          as index_key(attnum, ordinality)
        join pg_catalog.pg_attribute as indexed_column
          on indexed_column.attrelid = index_definition.indrelid
          and indexed_column.attnum = index_key.attnum
        where index_key.ordinality <= index_definition.indnkeyatts
      ) = array['product_id', 'email', 'target_price']::text[]
  ) then
    raise exception 'Expected exact unique index on public.price_alerts is missing';
  end if;

  raise notice
    'Verified public.price_alerts.id: type=%, identity=%, default=%, sequence=%',
    id_type,
    nullif(id_identity, ''),
    id_default_expression,
    id_sequence_name;
end;
$migration$;

alter table public.price_alerts enable row level security;

revoke all on table public.price_alerts
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.price_alerts
  to service_role;

do $migration$
declare
  id_sequence_name text;
begin
  id_sequence_name := pg_get_serial_sequence('public.price_alerts', 'id');

  if id_sequence_name is not null then
    execute format(
      'revoke all on sequence %s from public, anon, authenticated, service_role',
      id_sequence_name::regclass
    );
    execute format(
      'grant usage on sequence %s to service_role',
      id_sequence_name::regclass
    );
  end if;
end;
$migration$;

commit;
