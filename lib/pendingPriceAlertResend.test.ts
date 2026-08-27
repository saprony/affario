import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAlertManagementToken,
  hashAlertManagementToken,
  isValidAlertManagementToken,
} from "./alertManagementToken";
import {
  preparePendingPriceAlertResend,
  PRICE_ALERT_RESEND_COOLDOWN_MS,
  type PendingPriceAlertResendStore,
} from "./pendingPriceAlertResend";
import {
  confirmPriceAlertByToken,
  type AlertManagementTokenCodec,
  type PriceAlertManagementStore,
} from "./priceAlertManagement";

function createPendingState(
  confirmationRequestedAt: string | null,
  rawToken: string
) {
  const state = {
    status: "pending_confirmation",
    createdAt: "2026-08-01T09:00:00.000Z",
    confirmationRequestedAt,
    manageTokenHash: hashAlertManagementToken(rawToken),
    records: 1,
    rotations: 0,
  };

  const store: PendingPriceAlertResendStore = {
    async rotatePendingToken(rotation) {
      if (
        state.status !== "pending_confirmation" ||
        state.manageTokenHash !== rotation.expectedTokenHash ||
        state.confirmationRequestedAt !==
          rotation.expectedConfirmationRequestedAt ||
        (state.confirmationRequestedAt !== null &&
          Date.parse(state.confirmationRequestedAt) >
            Date.parse(rotation.eligibleBefore))
      ) {
        return false;
      }

      state.manageTokenHash = rotation.newTokenHash;
      state.confirmationRequestedAt = rotation.requestedAt;
      state.rotations += 1;
      return true;
    },
  };

  return { state, store };
}

test("un pending duplicato nel cooldown non crea record e non abilita resend", async () => {
  const oldToken = generateAlertManagementToken();
  const newToken = generateAlertManagementToken();
  const pending = createPendingState("2026-08-27T12:00:00.000Z", oldToken);

  const result = await preparePendingPriceAlertResend({
    existingAlert: pending.state,
    newConfirmationToken: newToken,
    newTokenHash: hashAlertManagementToken(newToken),
    store: pending.store,
    now: new Date("2026-08-27T12:10:00.000Z"),
  });

  assert.deepEqual(result, { status: "cooldown", retryAfterSeconds: 300 });
  assert.equal(pending.state.records, 1);
  assert.equal(pending.state.rotations, 0);
  assert.equal(pending.state.createdAt, "2026-08-01T09:00:00.000Z");
  assert.equal(
    pending.state.confirmationRequestedAt,
    "2026-08-27T12:00:00.000Z"
  );
  assert.equal(
    pending.state.manageTokenHash,
    hashAlertManagementToken(oldToken)
  );
});

test("un pending legacy senza timestamp può iniziare il cooldown senza backfill", async () => {
  const oldToken = generateAlertManagementToken();
  const newToken = generateAlertManagementToken();
  const pending = createPendingState(null, oldToken);

  const result = await preparePendingPriceAlertResend({
    existingAlert: pending.state,
    newConfirmationToken: newToken,
    newTokenHash: hashAlertManagementToken(newToken),
    store: pending.store,
    now: new Date("2026-08-27T12:00:00.000Z"),
  });

  assert.deepEqual(result, { status: "resend", confirmationToken: newToken });
  assert.equal(pending.state.createdAt, "2026-08-01T09:00:00.000Z");
  assert.equal(
    pending.state.confirmationRequestedAt,
    "2026-08-27T12:00:00.000Z"
  );
});

test("il resend autorizzato ruota l'hash e invalida soltanto il vecchio link", async () => {
  const oldToken = generateAlertManagementToken();
  const newToken = generateAlertManagementToken();
  const pending = createPendingState("2026-08-27T11:00:00.000Z", oldToken);
  const originalCreatedAt = pending.state.createdAt;

  const result = await preparePendingPriceAlertResend({
    existingAlert: pending.state,
    newConfirmationToken: newToken,
    newTokenHash: hashAlertManagementToken(newToken),
    store: pending.store,
    now: new Date("2026-08-27T12:00:00.000Z"),
  });

  assert.deepEqual(result, { status: "resend", confirmationToken: newToken });
  assert.equal(pending.state.records, 1);
  assert.equal(pending.state.rotations, 1);
  assert.equal(pending.state.createdAt, originalCreatedAt);
  assert.equal(
    pending.state.confirmationRequestedAt,
    "2026-08-27T12:00:00.000Z"
  );
  assert.equal(isValidAlertManagementToken(newToken), true);
  assert.equal(
    pending.state.manageTokenHash === hashAlertManagementToken(oldToken),
    false
  );
  assert.equal(
    pending.state.manageTokenHash === hashAlertManagementToken(newToken),
    true
  );

  const confirmationStore: PriceAlertManagementStore = {
    async findByTokenHash(tokenHash) {
      return tokenHash === pending.state.manageTokenHash
        ? {
            product_title: "Variante esatta",
            current_price: 1_300,
            target_price: 1_150,
            status: pending.state.status,
          }
        : null;
    },
    async activatePendingByTokenHash(tokenHash) {
      if (
        tokenHash !== pending.state.manageTokenHash ||
        pending.state.status !== "pending_confirmation"
      ) {
        return false;
      }

      pending.state.status = "active";
      return true;
    },
  };
  const tokenCodec: AlertManagementTokenCodec = {
    isValid: isValidAlertManagementToken,
    hash: hashAlertManagementToken,
  };

  assert.deepEqual(
    await confirmPriceAlertByToken(oldToken, tokenCodec, confirmationStore),
    { status: "not-found" }
  );
  assert.deepEqual(
    await confirmPriceAlertByToken(newToken, tokenCodec, confirmationStore),
    { status: "confirmed", alertStatus: "active" }
  );
});

test("un duplicato active non ruota token e non abilita resend", async () => {
  const activeToken = generateAlertManagementToken();
  const newToken = generateAlertManagementToken();
  let rotations = 0;

  const result = await preparePendingPriceAlertResend({
    existingAlert: {
      status: "active",
      confirmationRequestedAt: "2026-08-27T11:00:00.000Z",
      manageTokenHash: hashAlertManagementToken(activeToken),
    },
    newConfirmationToken: newToken,
    newTokenHash: hashAlertManagementToken(newToken),
    store: {
      async rotatePendingToken() {
        rotations += 1;
        return true;
      },
    },
    now: new Date("2026-08-27T12:00:00.000Z"),
  });

  assert.deepEqual(result, { status: "active" });
  assert.equal(rotations, 0);
});

test("un errore email non causa dead-end ma il cooldown impedisce resend incontrollati", async () => {
  const firstToken = generateAlertManagementToken();
  const secondToken = generateAlertManagementToken();
  const thirdToken = generateAlertManagementToken();
  const pending = createPendingState("2026-08-27T11:00:00.000Z", firstToken);

  const firstResend = await preparePendingPriceAlertResend({
    existingAlert: pending.state,
    newConfirmationToken: secondToken,
    newTokenHash: hashAlertManagementToken(secondToken),
    store: pending.store,
    now: new Date("2026-08-27T12:00:00.000Z"),
  });
  const immediateRetry = await preparePendingPriceAlertResend({
    existingAlert: pending.state,
    newConfirmationToken: thirdToken,
    newTokenHash: hashAlertManagementToken(thirdToken),
    store: pending.store,
    now: new Date("2026-08-27T12:00:01.000Z"),
  });

  assert.equal(firstResend.status, "resend");
  assert.equal(immediateRetry.status, "cooldown");
  assert.equal(pending.state.rotations, 1);

  const retryAfterCooldown = await preparePendingPriceAlertResend({
    existingAlert: pending.state,
    newConfirmationToken: thirdToken,
    newTokenHash: hashAlertManagementToken(thirdToken),
    store: pending.store,
    now: new Date(
      Date.parse(pending.state.confirmationRequestedAt ?? "") +
        PRICE_ALERT_RESEND_COOLDOWN_MS
    ),
  });

  assert.equal(retryAfterCooldown.status, "resend");
  assert.equal(pending.state.records, 1);
  assert.equal(pending.state.rotations, 2);
});
