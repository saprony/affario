import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260828120000_prepare_price_alert_monitoring_cron.sql"
);

function loadMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

test("la migration prepara un solo cron orario e lo lascia inattivo", () => {
  const sql = loadMigration();

  assert.equal((sql.match(/'0 \* \* \* \*'/g) ?? []).length, 1);
  assert.equal(
    (sql.match(/'affario-price-alert-monitoring-hourly'/g) ?? []).length,
    1
  );
  assert.match(sql, /cron\.schedule_in_database\([\s\S]*active := false/);
  assert.match(sql, /cron\.alter_job\([\s\S]*active := false/);
  assert.match(sql, /where jobid = scheduled_job_id[\s\S]*and active/);
});

test("la migration usa pg_net e soltanto i riferimenti nominali Vault", () => {
  const sql = loadMigration();

  assert.match(sql, /create extension if not exists pg_cron/);
  assert.match(sql, /create extension if not exists pg_net with schema extensions/);
  assert.match(sql, /net\.http_post\(/);
  assert.match(sql, /timeout_milliseconds := 290000/);
  assert.match(sql, /vault\.decrypted_secrets/);
  assert.match(sql, /name = 'affario_alert_monitoring_url'/);
  assert.match(sql, /name = 'affario_alert_monitoring_secret'/);
  assert.match(sql, /'Authorization'[\s\S]*'Bearer '/);
});

test("la migration non incorpora URL o credenziali", () => {
  const sql = loadMigration();

  assert.doesNotMatch(sql, /https?:\/\//i);
  assert.doesNotMatch(sql, /service[_-]?role/i);
  assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(sql, /(?:api[_-]?key|token|password)\s*[:=]/i);
});
