import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260906000000_harden_public_default_privileges.sql"
);

function loadMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
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
