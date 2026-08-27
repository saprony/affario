import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAlertManagementToken,
  hashAlertManagementToken,
  isValidAlertManagementToken,
} from "./alertManagementToken";

test("il token raw resta distinto dall'hash SHA-256 canonico", () => {
  const rawToken = generateAlertManagementToken();
  const tokenHash = hashAlertManagementToken(rawToken);

  assert.equal(isValidAlertManagementToken(rawToken), true);
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(tokenHash, rawToken);
  assert.equal(hashAlertManagementToken(rawToken), tokenHash);
});

test("la validazione continua a rifiutare token non canonici", () => {
  assert.equal(isValidAlertManagementToken(""), false);
  assert.equal(isValidAlertManagementToken("a".repeat(42)), false);
  assert.equal(isValidAlertManagementToken("a".repeat(44)), false);
  assert.equal(isValidAlertManagementToken("!".repeat(43)), false);
});
