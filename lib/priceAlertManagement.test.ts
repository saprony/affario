import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmPriceAlertByToken,
  readPriceAlertByToken,
  type AlertManagementTokenCodec,
  type ManagedPriceAlert,
  type PriceAlertManagementStore,
} from "./priceAlertManagement";

const validToken = "valid-token";
const validTokenHash = "hashed-valid-token";

const tokenCodec: AlertManagementTokenCodec = {
  isValid(token): token is string {
    return token === validToken;
  },
  hash(token) {
    assert.equal(token, validToken);
    return validTokenHash;
  },
};

function createInMemoryStore(initialStatus: string | null) {
  let alert: ManagedPriceAlert | null = initialStatus
    ? {
        product_title: "Variante esatta",
        current_price: 1_300,
        target_price: 1_150,
        status: initialStatus,
      }
    : null;
  const calls = { reads: 0, activations: 0 };

  const store: PriceAlertManagementStore = {
    async findByTokenHash(tokenHash) {
      assert.equal(tokenHash, validTokenHash);
      calls.reads += 1;
      return alert;
    },
    async activatePendingByTokenHash(tokenHash) {
      assert.equal(tokenHash, validTokenHash);

      if (alert?.status !== "pending_confirmation") {
        return false;
      }

      calls.activations += 1;
      alert = { ...alert, status: "active" };
      return true;
    },
  };

  return { store, calls, getAlert: () => alert };
}

test("la lettura GET del token pending è read-only", async () => {
  const state = createInMemoryStore("pending_confirmation");

  const alert = await readPriceAlertByToken(
    validToken,
    tokenCodec,
    state.store
  );

  assert.equal(alert?.status, "pending_confirmation");
  assert.deepEqual(state.calls, { reads: 1, activations: 0 });
});

test("la lettura GET gestisce in sola lettura un alert target_notified", async () => {
  const state = createInMemoryStore("target_notified");

  const alert = await readPriceAlertByToken(
    validToken,
    tokenCodec,
    state.store
  );

  assert.equal(alert?.status, "target_notified");
  assert.deepEqual(state.calls, { reads: 1, activations: 0 });
});

test("la conferma POST valida porta pending ad active ed è idempotente", async () => {
  const state = createInMemoryStore("pending_confirmation");

  const firstConfirmation = await confirmPriceAlertByToken(
    validToken,
    tokenCodec,
    state.store
  );
  const secondConfirmation = await confirmPriceAlertByToken(
    validToken,
    tokenCodec,
    state.store
  );

  assert.deepEqual(firstConfirmation, {
    status: "confirmed",
    alertStatus: "active",
  });
  assert.deepEqual(secondConfirmation, {
    status: "already-active",
    alertStatus: "active",
  });
  assert.equal(state.getAlert()?.status, "active");
  assert.equal(state.calls.activations, 1);
});

test("un token invalido non legge e non muta alcun alert", async () => {
  const state = createInMemoryStore("pending_confirmation");

  const result = await confirmPriceAlertByToken(
    "invalid-token",
    tokenCodec,
    state.store
  );

  assert.deepEqual(result, { status: "not-found" });
  assert.deepEqual(state.calls, { reads: 0, activations: 0 });
  assert.equal(state.getAlert()?.status, "pending_confirmation");
});
