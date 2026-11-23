import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260906000000_harden_public_default_privileges.sql"
);
const PILOT_METRICS_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20261123164345_create_affario_pilot_metrics_daily.sql"
);

function loadMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function loadPilotMetricsMigration(): string {
  return readFileSync(PILOT_METRICS_MIGRATION_PATH, "utf8");
}

test("revoca i default privilege public per gli oggetti futuri creati da postgres", () => {
  const sql = loadMigration();

  assert.match(
    sql,
    /alter default privileges for role postgres in schema public\s+revoke all privileges on tables from anon, authenticated/i
  );
  assert.match(
    sql,
    /alter default privileges for role postgres in schema public\s+revoke all privileges on sequences from anon, authenticated/i
  );
  assert.match(
    sql,
    /alter default privileges for role postgres in schema public\s+revoke all privileges on functions from public, anon, authenticated/i
  );
  assert.doesNotMatch(sql, /for role supabase_admin/i);
  assert.equal((sql.match(/alter default privileges/gi) ?? []).length, 3);
});

test("la migration e solo revoca, transazionale e non tocca oggetti esistenti", () => {
  const sql = loadMigration();
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  assert.match(sql, /^begin;/i);
  assert.match(sql, /commit;\s*$/i);
  assert.doesNotMatch(sql, /\bgrant\b/i);
  assert.doesNotMatch(sql, /\balter\s+(?:table|sequence|function)\b/i);
  assert.doesNotMatch(sql, /\b(?:create|drop|insert|update|delete|truncate)\b/i);
  assert.equal(statements.length, 5);
  assert.equal(statements[0].toLowerCase(), "begin");
  assert.equal(statements.at(-1)?.toLowerCase(), "commit");
  for (const statement of statements.slice(1, -1)) {
    assert.match(
      statement,
      /^alter default privileges for role postgres in schema public\s+revoke all privileges on (?:tables|sequences|functions) from /i
    );
  }
});

test("le metriche pilot conservano soltanto giorno tipo e conteggio aggregato", () => {
  const sql = loadPilotMetricsMigration();

  for (const column of [
    "metric_date date not null",
    "metric_name text not null",
    "metric_count bigint not null default 0",
    "updated_at timestamptz not null default now()",
  ]) {
    assert.match(sql, new RegExp(column.replace(/[()]/g, "\\$&"), "i"));
  }

  assert.match(sql, /primary key \(metric_date, metric_name\)/i);
  assert.match(sql, /metric_name in \('search', 'analysis'\)/i);
  assert.match(sql, /metric_count >= 0/i);
  assert.doesNotMatch(
    sql,
    /\b(query|asin|email|ip_address|user_agent|user_id|session_id)\b/i
  );
});

test("la RPC incrementa atomicamente il contatore del giorno Europe Rome", () => {
  const sql = loadPilotMetricsMigration();

  assert.match(
    sql,
    /increment_affario_pilot_metric\(\s*p_metric_name text\s*\)/i
  );
  assert.match(sql, /p_metric_name not in \('search', 'analysis'\)/i);
  assert.match(sql, /timezone\('Europe\/Rome', now\(\)\)::date/i);
  assert.match(
    sql,
    /on conflict \(metric_date, metric_name\) do update/i
  );
  assert.match(
    sql,
    /metric_count = daily_metric\.metric_count \+ 1/i
  );
  assert.match(sql, /updated_at = excluded\.updated_at/i);
  assert.equal(
    (sql.match(/insert into public\.affario_pilot_metrics_daily/gi) ?? [])
      .length,
    1
  );
});

test("tabella e RPC delle metriche pilot sono accessibili solo server-side", () => {
  const sql = loadPilotMetricsMigration();

  assert.match(
    sql,
    /affario_pilot_metrics_daily enable row level security/i
  );
  assert.match(
    sql,
    /revoke all on table public\.affario_pilot_metrics_daily[\s\S]*from public, anon, authenticated, service_role/i
  );
  assert.match(
    sql,
    /grant select, insert, update on table public\.affario_pilot_metrics_daily[\s\S]*to service_role/i
  );
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(
    sql,
    /revoke execute on function public\.increment_affario_pilot_metric\(text\)[\s\S]*from public, anon, authenticated, service_role/i
  );
  assert.match(
    sql,
    /grant execute on function public\.increment_affario_pilot_metric\(text\)[\s\S]*to service_role/i
  );
  assert.doesNotMatch(sql, /create\s+policy/i);
});
