import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260904000000_create_distributed_leases.sql"
);
const LEASE_SERVICE_PATH = resolve(
  process.cwd(),
  "services/distributedLease.ts"
);
const REFRESH_COORDINATOR_PATH = resolve(
  process.cwd(),
  "services/exactAsinRefreshLease.ts"
);
const PRODUCT_SEARCH_CACHE_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260908000000_create_product_search_query_cache.sql"
);
const PRODUCT_SEARCH_CACHE_PATH = resolve(
  process.cwd(),
  "services/productSearchQueryCache.ts"
);
const PRODUCT_SEARCH_CACHE_STORE_PATH = resolve(
  process.cwd(),
  "services/productSearchQueryCacheStore.ts"
);
const PRODUCT_SEARCH_ORCHESTRATOR_PATH = resolve(
  process.cwd(),
  "services/affarioProductSearchWithFallback.ts"
);
const PRODUCT_SEARCH_TYPES_PATH = resolve(
  process.cwd(),
  "types/productSearch.ts"
);
const PRODUCT_SEARCH_ROUTE_PATH = resolve(
  process.cwd(),
  "app/api/search/products/route.ts"
);

function loadMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

test("schema lease usa PK resource type/key e non conserva identificatori raw", () => {
  const sql = loadMigration();

  assert.match(sql, /resource_type text not null/i);
  assert.match(sql, /resource_key text not null/i);
  assert.match(sql, /owner_token text not null/i);
  assert.match(sql, /claimed_at timestamptz not null/i);
  assert.match(sql, /expires_at timestamptz not null/i);
  assert.match(sql, /primary key \(resource_type, resource_key\)/i);
  assert.match(sql, /resource_key ~ '\^\[a-f0-9\]\{64\}\$'/i);
  assert.doesNotMatch(
    sql,
    /\b(email|asin|ip_address|api_key|management_token|raw_payload)\b/i
  );
});

test("RLS, zero policy e privilegi minimi rendono lo store server-only", () => {
  const sql = loadMigration();

  assert.match(sql, /distributed_leases enable row level security/i);
  assert.doesNotMatch(sql, /create\s+policy/i);
  assert.match(
    sql,
    /revoke all on table public\.distributed_leases[\s\S]*from public, anon, authenticated, service_role/i
  );
  assert.match(
    sql,
    /grant select, insert, update, delete on table public\.distributed_leases[\s\S]*to service_role/i
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(?:all|truncate|references|trigger|maintain)\b[\s\S]*on table public\.distributed_leases/i
  );
  assert.equal((sql.match(/security invoker/gi) ?? []).length, 2);
  assert.doesNotMatch(sql, /security definer/i);
  assert.equal((sql.match(/grant execute on function/gi) ?? []).length, 2);
});

test("claim/reclaim è atomica sulla PK e release richiede l'owner", () => {
  const sql = loadMigration();

  assert.match(
    sql,
    /insert into public\.distributed_leases as current_lease/i
  );
  assert.match(
    sql,
    /on conflict \(resource_type, resource_key\) do update/i
  );
  assert.match(sql, /where current_lease\.expires_at <= claim_time/i);
  assert.match(sql, /returning 1/i);
  assert.match(
    sql,
    /delete from public\.distributed_leases[\s\S]*resource_type = p_resource_type[\s\S]*resource_key = p_resource_key[\s\S]*owner_token = p_owner_token/i
  );
  assert.doesNotMatch(sql, /\bfor\s+(?:update|share)\b/i);
  assert.doesNotMatch(sql, /pg_advisory/i);
});

test("implementazione resta server-only e non mantiene lock DB durante il refresh", () => {
  const leaseService = readFileSync(LEASE_SERVICE_PATH, "utf8");
  const coordinator = readFileSync(REFRESH_COORDINATOR_PATH, "utf8");
  const cacheReadIndex = coordinator.indexOf(
    'input.readFreshCache("initial")'
  );
  const claimIndex = coordinator.indexOf(
    "claim = await dependencies.tryClaim"
  );
  const refreshIndex = coordinator.indexOf("return await input.refresh()");

  assert.match(leaseService, /^import "server-only";/);
  assert.match(coordinator, /^import "server-only";/);
  assert.doesNotMatch(
    `${leaseService}\n${coordinator}`,
    /"use client"|'use client'|pg_advisory|redis/i
  );
  assert.ok(cacheReadIndex >= 0);
  assert.ok(claimIndex > cacheReadIndex);
  assert.ok(claimIndex >= 0);
  assert.ok(refreshIndex > claimIndex);
  assert.doesNotMatch(leaseService, /\b(begin|commit|rollback)\b/i);
});

test("migration query cache applica schema, TTL fields e coerenza del payload", () => {
  const sql = readFileSync(PRODUCT_SEARCH_CACHE_MIGRATION_PATH, "utf8");

  assert.match(sql, /create table public\.product_search_query_cache/i);
  assert.match(sql, /query_hash text primary key/i);
  assert.match(sql, /query_hash ~ '\^\[a-f0-9\]\{64\}\$'/i);
  assert.match(sql, /payload_version smallint not null/i);
  assert.match(sql, /payload_version > 0/i);
  assert.match(sql, /candidates jsonb not null/i);
  assert.match(sql, /jsonb_typeof\(candidates\) = 'array'/i);
  assert.match(sql, /result_count integer not null/i);
  assert.match(sql, /result_count >= 0/i);
  assert.match(sql, /result_count = jsonb_array_length\(candidates\)/i);
  assert.match(sql, /fetched_at timestamptz not null/i);
  assert.match(sql, /expires_at timestamptz not null/i);
  assert.match(sql, /expires_at > fetched_at/i);
  assert.match(
    sql,
    /create index product_search_query_cache_expires_at_idx[\s\S]*\(expires_at\)/i
  );
});

test("query cache DB resta server-only con grant service_role minimi", () => {
  const sql = readFileSync(PRODUCT_SEARCH_CACHE_MIGRATION_PATH, "utf8");

  assert.match(
    sql,
    /product_search_query_cache enable row level security/i
  );
  assert.doesNotMatch(sql, /create\s+policy/i);
  assert.match(
    sql,
    /revoke all on table public\.product_search_query_cache[\s\S]*from public, anon, authenticated, service_role/i
  );
  assert.match(
    sql,
    /grant select, insert, update on table public\.product_search_query_cache[\s\S]*to service_role/i
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(?:all|delete|truncate|references|trigger|maintain)\b[\s\S]*on table public\.product_search_query_cache/i
  );
  assert.doesNotMatch(sql, /security\s+definer/i);
  assert.doesNotMatch(sql, /default privileges/i);
});

test("query cache non definisce colonne raw query, prezzo o payload Keepa", () => {
  const sql = readFileSync(PRODUCT_SEARCH_CACHE_MIGRATION_PATH, "utf8");

  assert.doesNotMatch(
    sql,
    /\b(raw_query|normalized_query|query_text|email|ip_address|account_id|token_balance|server_report|raw_keepa|price_history|current_price)\b/i
  );
});

test("product search riusa le lease esistenti senza Product lookup", () => {
  const cache = readFileSync(PRODUCT_SEARCH_CACHE_PATH, "utf8");
  const store = readFileSync(PRODUCT_SEARCH_CACHE_STORE_PATH, "utf8");
  const orchestrator = readFileSync(PRODUCT_SEARCH_ORCHESTRATOR_PATH, "utf8");

  assert.match(cache, /^import "server-only";/);
  assert.match(store, /^import "server-only";/);
  assert.match(cache, /tryClaimDistributedLease/);
  assert.match(cache, /releaseDistributedLease/);
  assert.match(cache, /resourceKey: `search:\$\{queryHash\}`/);
  assert.match(cache, /PRODUCT_SEARCH_QUERY_CACHE_LEASE_SECONDS = 60/);
  assert.match(cache, /PRODUCT_SEARCH_QUERY_CACHE_CONTENTION_WAIT_MS = 250/);
  assert.match(orchestrator, /searchKeepaProductCandidatesWithCache/);
  assert.doesNotMatch(
    `${cache}\n${store}\n${orchestrator}`,
    /getAffarioProductByAsin|\/api\/products\/|persistKeepaProduct/
  );
  assert.doesNotMatch(`${cache}\n${store}`, /redis|pg_advisory/i);
});

test("source pubblico resta il contratto C1 senza HIT o MISS", () => {
  const types = readFileSync(PRODUCT_SEARCH_TYPES_PATH, "utf8");
  const route = readFileSync(PRODUCT_SEARCH_ROUTE_PATH, "utf8");

  assert.match(
    types,
    /source: "AFFARIO_CATALOG" \| "KEEPA" \| "HYBRID"/
  );
  assert.doesNotMatch(
    types,
    /KEEPA_CACHE|CACHE_HIT|CACHE_MISS|\bHIT\b|\bMISS\b/
  );
  assert.match(route, /const \{ data \} = await searchAffarioProductsWithFallback/);
  assert.doesNotMatch(route, /serverReport\s*[,}]/);
});
