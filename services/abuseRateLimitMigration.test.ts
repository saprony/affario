import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const RATE_LIMIT_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260902000000_create_abuse_rate_limits.sql"
);
const PRICE_ALERTS_HARDENING_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260902010000_harden_price_alerts_rls.sql"
);
const RATE_LIMIT_SERVICE_PATH = resolve(
  process.cwd(),
  "services/abuseRateLimit.ts"
);
const RATE_LIMIT_RESPONSE_PATH = resolve(
  process.cwd(),
  "lib/abuseRateLimitResponse.ts"
);
const PRICE_ALERTS_AUDIT_PATH = resolve(
  process.cwd(),
  "supabase/audits/price_alerts_read_only.sql"
);

function loadRateLimitMigration(): string {
  return readFileSync(RATE_LIMIT_MIGRATION_PATH, "utf8");
}

function loadPriceAlertsHardeningMigration(): string {
  return readFileSync(PRICE_ALERTS_HARDENING_MIGRATION_PATH, "utf8");
}

test("la tabella conserva una sola finestra aggregata per scope e digest", () => {
  const sql = loadRateLimitMigration();

  for (const column of [
    "scope text not null",
    "subject_hash text not null",
    "window_started_at timestamptz not null",
    "request_count integer not null",
    "request_limit integer not null",
    "window_seconds integer not null",
    "last_seen_at timestamptz not null",
  ]) {
    assert.match(sql, new RegExp(column));
  }

  assert.match(sql, /primary key \(scope, subject_hash\)/i);
  assert.ok(sql.includes("subject_hash ~ '^[a-f0-9]{64}$'"));
  assert.doesNotMatch(
    sql,
    /\b(ip_address|email_address|email|asin|user_agent|request_body|management_token|raw_provider)\b/i
  );
});

test("la RPC consuma un batch multi-quota in un solo UPSERT atomico", () => {
  const sql = loadRateLimitMigration();

  assert.match(
    sql,
    /affario_consume_abuse_rate_limit\(\s*p_checks jsonb\s*\)/i
  );
  assert.match(sql, /jsonb_to_recordset\(p_checks\)/i);
  assert.match(sql, /with requested_checks as materialized/i);
  assert.match(sql, /insert into public\.abuse_rate_limits as current_window/i);
  assert.match(sql, /on conflict \(scope, subject_hash\) do update/i);
  assert.match(sql, /current_window\.request_count \+ 1/i);
  assert.match(sql, /excluded\.request_limit \+ 1/i);
  assert.match(
    sql,
    /bool_and\(consumed\.request_count <= consumed\.request_limit\)/i
  );
  assert.match(sql, /max\([\s\S]*case[\s\S]*greatest\(/i);
  assert.match(sql, /clock_timestamp\(\)/i);
  assert.match(sql, /ceil\(\s*extract\(/i);
  assert.doesNotMatch(sql, /\bfor\b[\s\S]*\bloop\b/i);
});

test("il consumo usa PK scope+subject_hash senza query full-table o N+1", () => {
  const sql = loadRateLimitMigration();

  assert.match(sql, /primary key \(scope, subject_hash\)/i);
  assert.match(sql, /on conflict \(scope, subject_hash\) do update/i);
  assert.equal(
    (sql.match(/insert into public\.abuse_rate_limits/gi) ?? []).length,
    1
  );
  assert.doesNotMatch(sql, /from\s+public\.abuse_rate_limits/i);
  assert.doesNotMatch(sql, /update\s+public\.abuse_rate_limits/i);
});

test("il rate limiter e esplicitamente escluso dal bundle client", () => {
  const service = readFileSync(RATE_LIMIT_SERVICE_PATH, "utf8");
  const response = readFileSync(RATE_LIMIT_RESPONSE_PATH, "utf8");

  assert.match(service, /^import "server-only";/);
  assert.match(response, /^import "server-only";/);
  assert.doesNotMatch(service, /"use client"|'use client'/i);
  assert.doesNotMatch(response, /"use client"|'use client'/i);
});

test("rate-limit table e RPC sono server-only con SECURITY INVOKER", () => {
  const sql = loadRateLimitMigration();

  assert.match(sql, /abuse_rate_limits enable row level security/i);
  assert.match(
    sql,
    /revoke all on table public\.abuse_rate_limits[\s\S]*from public, anon, authenticated, service_role/i
  );
  assert.match(
    sql,
    /grant select, insert, update on table public\.abuse_rate_limits[\s\S]*to service_role/i
  );
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(
    sql,
    /revoke execute on function public\.affario_consume_abuse_rate_limit\([\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    sql,
    /grant execute on function public\.affario_consume_abuse_rate_limit\([\s\S]*to service_role/i
  );
  assert.doesNotMatch(sql, /create\s+policy/i);
  assert.doesNotMatch(
    sql,
    /grant\s+(?:all|delete|truncate|references|trigger|maintain)\b[\s\S]*?on table public\.abuse_rate_limits/i
  );
});

test("hardening price_alerts esplicita RLS e privilegi server minimi", () => {
  const sql = loadPriceAlertsHardeningMigration();

  assert.match(sql, /to_regclass\('public\.price_alerts'\)/i);
  assert.match(sql, /alter table public\.price_alerts enable row level security/i);
  assert.match(
    sql,
    /revoke all on table public\.price_alerts[\s\S]*from public, anon, authenticated, service_role/i
  );
  assert.match(
    sql,
    /grant select, insert, update, delete on table public\.price_alerts[\s\S]*to service_role/i
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(?:all|truncate|references|trigger|maintain)\b[\s\S]*?on table public\.price_alerts/i
  );
  assert.match(sql, /pg_catalog\.pg_attribute/i);
  assert.match(sql, /format_type\(id_column\.atttypid, id_column\.atttypmod\)/i);
  assert.match(sql, /id_column\.attidentity::text/i);
  assert.match(sql, /pg_get_expr\(id_default\.adbin, id_default\.adrelid\)/i);
  assert.match(sql, /pg_get_serial_sequence\('public\.price_alerts', 'id'\)/i);
  assert.match(sql, /grant usage on sequence %s to service_role/i);
  assert.doesNotMatch(
    sql,
    /grant\s+(?:all|select|update)\s+on sequence/i
  );
  assert.doesNotMatch(sql, /create\s+policy/i);
  assert.doesNotMatch(sql, /force row level security/i);
});

test("hardening verifica e preserva lo unique index esatto degli alert", () => {
  const sql = loadPriceAlertsHardeningMigration();

  assert.match(sql, /price_alerts_unique_exact_alert_idx/i);
  assert.match(sql, /index_definition\.indisunique/i);
  assert.match(sql, /index_definition\.indnkeyatts = 3/i);
  assert.match(sql, /index_definition\.indnatts = 3/i);
  assert.match(
    sql,
    /array\['product_id', 'email', 'target_price'\]::text\[\]/i
  );
  assert.doesNotMatch(
    sql,
    /\b(?:create|alter|drop|reindex)\s+(?:unique\s+)?index\b/i
  );
});

test("hardening price_alerts non modifica righe constraint indici o default ACL", () => {
  const sql = loadPriceAlertsHardeningMigration();

  assert.doesNotMatch(sql, /insert into public\.price_alerts/i);
  assert.doesNotMatch(sql, /update public\.price_alerts/i);
  assert.doesNotMatch(sql, /delete from public\.price_alerts/i);
  assert.doesNotMatch(sql, /drop\s+(constraint|index|table)/i);
  assert.doesNotMatch(sql, /alter\s+table[\s\S]*alter\s+column/i);
  assert.doesNotMatch(sql, /alter default privileges/i);
});

test("le migration B1 non cambiano globalmente i default privileges", () => {
  assert.doesNotMatch(loadRateLimitMigration(), /alter default privileges/i);
  assert.doesNotMatch(
    loadPriceAlertsHardeningMigration(),
    /alter default privileges/i
  );
});

test("la query audit price_alerts e un solo SELECT catalog-only", () => {
  const sql = readFileSync(PRICE_ALERTS_AUDIT_PATH, "utf8").trim();

  assert.match(sql, /^with\s+target_table\s+as/i);
  assert.match(sql, /select jsonb_build_object\(/i);
  assert.equal((sql.match(/;/g) ?? []).length, 1);
  assert.doesNotMatch(
    sql,
    /\b(insert|update|delete|alter|create|drop|grant|revoke|truncate|call|do|copy)\b/i
  );
  assert.doesNotMatch(sql, /from\s+(public\.)?price_alerts\b/i);
  assert.doesNotMatch(sql, /pg_get_functiondef\s*\(/i);
  assert.match(sql, /pg_catalog\.pg_class/i);
  assert.match(sql, /pg_catalog\.pg_default_acl/i);
});
