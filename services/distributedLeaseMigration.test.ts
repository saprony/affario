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
