begin;

create table public.product_search_query_cache (
  query_hash text primary key,
  payload_version smallint not null,
  candidates jsonb not null,
  result_count integer not null,
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  constraint product_search_query_cache_query_hash_check check (
    query_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint product_search_query_cache_payload_version_check check (
    payload_version > 0
  ),
  constraint product_search_query_cache_candidates_check check (
    jsonb_typeof(candidates) = 'array'
  ),
  constraint product_search_query_cache_result_count_check check (
    result_count >= 0
    and result_count = jsonb_array_length(candidates)
  ),
  constraint product_search_query_cache_expiry_check check (
    expires_at > fetched_at
  )
);

create index product_search_query_cache_expires_at_idx
  on public.product_search_query_cache (expires_at);

alter table public.product_search_query_cache enable row level security;

revoke all on table public.product_search_query_cache
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.product_search_query_cache
  to service_role;

comment on table public.product_search_query_cache is
  'Cache server-only dei candidati normalizzati della product search; conserva soltanto hash SHA-256 delle query.';

commit;
