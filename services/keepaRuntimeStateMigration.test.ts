import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260829000000_create_keepa_runtime_state.sql"
);
const GRANT_HARDENING_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260829010000_harden_keepa_runtime_state_grants.sql"
);

function loadMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function loadGrantHardeningMigration(): string {
  return readFileSync(GRANT_HARDENING_MIGRATION_PATH, "utf8");
}

test("lo stato runtime contiene solo telemetria aggregata e i due contatori 429", () => {
  const sql = loadMigration();

  for (const column of [
    "observed_at timestamptz",
    "tokens_left integer",
    "tokens_consumed integer",
    "refill_rate integer",
    "refill_in_ms integer",
    "token_flow_reduction double precision",
    "interactive_429_count bigint",
    "last_interactive_429_at timestamptz",
    "background_429_count bigint",
    "last_background_429_at timestamptz",
  ]) {
    assert.match(sql, new RegExp(column));
  }

  assert.doesNotMatch(sql, /tokens_left\s*>?=\s*0/i);
  assert.doesNotMatch(
    sql,
    /\b(email|asin|api_key|user_query|search_query|ip_address|raw_payload)\b/i
  );
  assert.doesNotMatch(sql, /https?:\/\//i);
});

test("RLS e privilegi limitano tabella e RPC al service_role", () => {
  const sql = loadMigration();

  assert.match(sql, /keepa_runtime_state enable row level security/);
  assert.match(
    sql,
    /revoke all on table public\.keepa_runtime_state[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    sql,
    /grant select, insert, update on table public\.keepa_runtime_state[\s\S]*to service_role/
  );
  assert.equal((sql.match(/security invoker/g) ?? []).length, 3);
  assert.doesNotMatch(sql, /security definer/i);
  assert.equal((sql.match(/from public, anon, authenticated/g) ?? []).length, 4);
  assert.equal((sql.match(/to service_role/g) ?? []).length, 4);
});

test("i default grant Supabase sono ridotti ai soli permessi runtime", () => {
  const sql = loadGrantHardeningMigration();
  const revokeIndex = sql.indexOf(
    "revoke all on table public.keepa_runtime_state from service_role"
  );
  const grantIndex = sql.indexOf(
    "grant select, insert, update on table public.keepa_runtime_state"
  );

  assert.ok(revokeIndex >= 0);
  assert.ok(grantIndex > revokeIndex);
  assert.doesNotMatch(sql, /\b(delete|truncate|references|trigger)\b/i);
});

test("osservazioni vecchie non sovrascrivono il bucket ma i 429 restano atomici", () => {
  const sql = loadMigration();

  assert.match(
    sql,
    /excluded\.observed_at >= current_state\.observed_at/
  );
  assert.match(
    sql,
    /interactive_429_count =\s*current_state\.interactive_429_count \+ excluded\.interactive_429_count/
  );
  assert.match(
    sql,
    /background_429_count =\s*current_state\.background_429_count \+ excluded\.background_429_count/
  );
  assert.match(
    sql,
    /excluded\.last_interactive_429_at >[\s\S]*current_state\.last_interactive_429_at/
  );
  assert.match(
    sql,
    /excluded\.last_background_429_at >[\s\S]*current_state\.last_background_429_at/
  );
});

test("il guard serializza il background e recupera un bootstrap dopo crash", () => {
  const sql = loadMigration();

  assert.match(sql, /for update/);
  assert.match(sql, /background_lease_until > p_now/);
  assert.match(
    sql,
    /background_bootstrap_attempted_at is not null[\s\S]*and not \([\s\S]*background_lease_started_at is not null[\s\S]*background_lease_until is not null[\s\S]*background_lease_until <= p_now/
  );
  assert.match(sql, /background_bootstrap_attempted_at = p_now/);
  assert.match(
    sql,
    /estimated_tokens - p_estimated_cost < p_reserve/
  );
  assert.match(sql, /bucket_capacity := runtime_state\.refill_rate::bigint \* 60/);
  assert.match(sql, /runtime_state\.token_flow_reduction/);
  assert.match(sql, /'RESERVE'::text/);
  assert.match(sql, /'EXHAUSTED'::text/);
  assert.match(sql, /'UNKNOWN'::text/);
});

test("la stima segue refillIn e sottrae la riduzione Keepa arrotondata", () => {
  const sql = loadMigration();

  assert.match(
    sql,
    /runtime_state\.refill_rate::bigint\s*-\s*round\(runtime_state\.token_flow_reduction::numeric\)::bigint/
  );
  assert.doesNotMatch(
    sql,
    /floor\(runtime_state\.refill_rate\s*-\s*runtime_state\.token_flow_reduction\)/
  );
  assert.match(
    sql,
    /if elapsed_ms >= runtime_state\.refill_in_ms then[\s\S]*refill_events := 1 \+[\s\S]*elapsed_ms - runtime_state\.refill_in_ms[\s\S]*\/ 60000/
  );
  assert.match(
    sql,
    /estimated_tokens := least\([\s\S]*bucket_capacity[\s\S]*tokens_left::bigint \+ refill_events \* effective_refill/
  );
});
