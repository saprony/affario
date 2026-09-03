with target_table as (
  select
    relation.oid,
    relation.relowner,
    relation.relacl,
    pg_get_userbyid(relation.relowner) as owner,
    relation.relrowsecurity as rls_enabled,
    relation.relforcerowsecurity as force_rls
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'price_alerts'
    and relation.relkind in ('r', 'p')
),
wanted_grantees(grantee) as (
  values
    ('PUBLIC'::text),
    ('anon'::text),
    ('authenticated'::text),
    ('service_role'::text)
),
table_acl_entries as (
  select
    case
      when acl.grantee = 0 then 'PUBLIC'
      else pg_get_userbyid(acl.grantee)
    end as grantee,
    acl.privilege_type,
    acl.is_grantable
  from target_table
  cross join lateral aclexplode(
    coalesce(
      target_table.relacl,
      acldefault('r', target_table.relowner)
    )
  ) as acl
),
table_grants as (
  select
    wanted_grantees.grantee,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'privilege', table_acl_entries.privilege_type,
          'is_grantable', table_acl_entries.is_grantable
        )
        order by table_acl_entries.privilege_type
      ) filter (where table_acl_entries.privilege_type is not null),
      '[]'::jsonb
    ) as privileges
  from wanted_grantees
  left join table_acl_entries
    on table_acl_entries.grantee = wanted_grantees.grantee
  group by wanted_grantees.grantee
),
policy_rows as (
  select
    policy.policyname as name,
    policy.permissive,
    policy.roles,
    policy.cmd as command,
    policy.qual as using_expression,
    policy.with_check as check_expression
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'public'
    and policy.tablename = 'price_alerts'
),
index_rows as (
  select
    index.indexname as name,
    index.indexdef as definition
  from pg_catalog.pg_indexes as index
  where index.schemaname = 'public'
    and index.tablename = 'price_alerts'
),
constraint_rows as (
  select
    constraint_definition.conname as name,
    case constraint_definition.contype
      when 'p' then 'PRIMARY KEY'
      when 'u' then 'UNIQUE'
    end as type,
    pg_get_constraintdef(constraint_definition.oid, true) as definition
  from pg_catalog.pg_constraint as constraint_definition
  join target_table
    on target_table.oid = constraint_definition.conrelid
  where constraint_definition.contype in ('p', 'u')
),
trigger_rows as (
  select
    trigger.tgname as name,
    trigger.tgenabled as enabled_mode,
    pg_get_triggerdef(trigger.oid, true) as definition
  from pg_catalog.pg_trigger as trigger
  join target_table
    on target_table.oid = trigger.tgrelid
  where not trigger.tgisinternal
),
dependent_view_rows as (
  select distinct
    view_namespace.nspname as schema,
    view_relation.relname as name,
    case view_relation.relkind
      when 'v' then 'VIEW'
      when 'm' then 'MATERIALIZED VIEW'
    end as type
  from target_table
  join pg_catalog.pg_depend as dependency
    on dependency.refclassid = 'pg_catalog.pg_class'::regclass
    and dependency.refobjid = target_table.oid
    and dependency.classid = 'pg_catalog.pg_rewrite'::regclass
  join pg_catalog.pg_rewrite as rewrite_rule
    on rewrite_rule.oid = dependency.objid
  join pg_catalog.pg_class as view_relation
    on view_relation.oid = rewrite_rule.ev_class
  join pg_catalog.pg_namespace as view_namespace
    on view_namespace.oid = view_relation.relnamespace
  where view_relation.relkind in ('v', 'm')
),
function_rows as (
  select distinct
    function_namespace.nspname as schema,
    function_definition.proname as name,
    pg_get_function_identity_arguments(function_definition.oid) as arguments,
    language.lanname as language,
    case
      when exists (
        select 1
        from pg_catalog.pg_depend as dependency
        join target_table
          on dependency.refclassid = 'pg_catalog.pg_class'::regclass
          and dependency.refobjid = target_table.oid
        where dependency.classid = 'pg_catalog.pg_proc'::regclass
          and dependency.objid = function_definition.oid
      ) then 'catalog dependency'
      else 'function body name match'
    end as detected_by
  from pg_catalog.pg_proc as function_definition
  join pg_catalog.pg_namespace as function_namespace
    on function_namespace.oid = function_definition.pronamespace
  join pg_catalog.pg_language as language
    on language.oid = function_definition.prolang
  where function_namespace.nspname not in (
    'pg_catalog',
    'information_schema'
  )
    and (
      exists (
        select 1
        from pg_catalog.pg_depend as dependency
        join target_table
          on dependency.refclassid = 'pg_catalog.pg_class'::regclass
          and dependency.refobjid = target_table.oid
        where dependency.classid = 'pg_catalog.pg_proc'::regclass
          and dependency.objid = function_definition.oid
      )
      or strpos(lower(function_definition.prosrc), 'price_alerts') > 0
    )
),
default_acl_rows as (
  select
    pg_get_userbyid(default_acl.defaclrole) as owner,
    case
      when default_acl.defaclnamespace = 0 then 'ALL SCHEMAS'
      else default_namespace.nspname
    end as schema_scope,
    case default_acl.defaclobjtype
      when 'r' then 'TABLES'
      when 'S' then 'SEQUENCES'
      when 'f' then 'FUNCTIONS'
      when 'T' then 'TYPES'
      when 'n' then 'SCHEMAS'
    end as object_type,
    case
      when acl.grantee = 0 then 'PUBLIC'
      else pg_get_userbyid(acl.grantee)
    end as grantee,
    acl.privilege_type,
    acl.is_grantable
  from pg_catalog.pg_default_acl as default_acl
  left join pg_catalog.pg_namespace as default_namespace
    on default_namespace.oid = default_acl.defaclnamespace
  cross join lateral aclexplode(default_acl.defaclacl) as acl
  where (
      default_acl.defaclnamespace = 0
      or default_namespace.nspname = 'public'
    )
    and case
      when acl.grantee = 0 then 'PUBLIC'
      else pg_get_userbyid(acl.grantee)
    end in ('PUBLIC', 'anon', 'authenticated', 'service_role')
)
select jsonb_build_object(
  'relation', coalesce(
    (
      select jsonb_build_object(
        'schema', 'public',
        'name', 'price_alerts',
        'owner', target_table.owner,
        'rls_enabled', target_table.rls_enabled,
        'force_rls', target_table.force_rls
      )
      from target_table
    ),
    jsonb_build_object(
      'schema', 'public',
      'name', 'price_alerts',
      'exists', false
    )
  ),
  'grants', coalesce(
    (
      select jsonb_agg(to_jsonb(table_grants) order by table_grants.grantee)
      from table_grants
    ),
    '[]'::jsonb
  ),
  'policies', coalesce(
    (
      select jsonb_agg(to_jsonb(policy_rows) order by policy_rows.name)
      from policy_rows
    ),
    '[]'::jsonb
  ),
  'indexes', coalesce(
    (
      select jsonb_agg(to_jsonb(index_rows) order by index_rows.name)
      from index_rows
    ),
    '[]'::jsonb
  ),
  'primary_and_unique_constraints', coalesce(
    (
      select jsonb_agg(
        to_jsonb(constraint_rows)
        order by constraint_rows.type, constraint_rows.name
      )
      from constraint_rows
    ),
    '[]'::jsonb
  ),
  'triggers', coalesce(
    (
      select jsonb_agg(to_jsonb(trigger_rows) order by trigger_rows.name)
      from trigger_rows
    ),
    '[]'::jsonb
  ),
  'dependent_views', coalesce(
    (
      select jsonb_agg(
        to_jsonb(dependent_view_rows)
        order by dependent_view_rows.schema, dependent_view_rows.name
      )
      from dependent_view_rows
    ),
    '[]'::jsonb
  ),
  'relevant_functions', coalesce(
    (
      select jsonb_agg(
        to_jsonb(function_rows)
        order by function_rows.schema, function_rows.name,
          function_rows.arguments
      )
      from function_rows
    ),
    '[]'::jsonb
  ),
  'explicit_default_privileges', coalesce(
    (
      select jsonb_agg(
        to_jsonb(default_acl_rows)
        order by default_acl_rows.owner, default_acl_rows.schema_scope,
          default_acl_rows.object_type, default_acl_rows.grantee,
          default_acl_rows.privilege_type
      )
      from default_acl_rows
    ),
    '[]'::jsonb
  ),
  'default_privileges_note',
    'Only explicit pg_default_acl entries are listed. An empty array means PostgreSQL built-in defaults still require review.'
) as price_alerts_security_audit;
