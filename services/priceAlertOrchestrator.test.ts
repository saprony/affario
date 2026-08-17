import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePriceAlert } from "@/lib/evaluatePriceAlert";
import {
  createPriceAlertActionResolver,
  type PriceAlertNotificationStateReaders,
} from "@/services/priceAlertOrchestrator";

type NotificationState =
  | { status: "pending" }
  | { status: "sent"; notifiedAt: string }
  | { status: "not-found" };

const sentState: NotificationState = {
  status: "sent",
  notifiedAt: "2026-08-17T10:00:00.000Z",
};

function createReaders({
  target = { status: "pending" },
  intermediate = { status: "pending" },
}: {
  target?: NotificationState;
  intermediate?: NotificationState;
} = {}) {
  const calls = { target: 0, intermediate: 0 };
  const readers: PriceAlertNotificationStateReaders = {
    async getTargetNotificationState() {
      calls.target += 1;
      return target;
    },
    async getIntermediateNotificationState() {
      calls.intermediate += 1;
      return intermediate;
    },
  };

  return { calls, resolve: createPriceAlertActionResolver(readers) };
}

test("A - no-action non legge gli stati persistenti", async () => {
  const { calls, resolve } = createReaders();

  const result = await resolve(1, 100, 80, 98);

  assert.equal(result.action, "no-action");
  assert.deepEqual(calls, { target: 0, intermediate: 0 });
});

test("B - propone la notifica intermedia quando entrambi gli stati sono pending", async () => {
  const { calls, resolve } = createReaders();

  const result = await resolve(1, 100, 80, 90);

  assert.equal(result.action, "send-intermediate");
  assert.deepEqual(calls, { target: 1, intermediate: 1 });
});

test("C - riconosce una notifica intermedia gia inviata", async () => {
  const { resolve } = createReaders({ intermediate: sentState });

  const result = await resolve(1, 100, 80, 90);

  assert.equal(result.action, "already-handled");
  if (result.action === "already-handled") {
    assert.equal(result.reason, "intermediate-already-sent");
  }
});

test("D - il target gia notificato blocca l'intermedio senza leggerne lo stato", async () => {
  const { calls, resolve } = createReaders({ target: sentState });

  const result = await resolve(1, 100, 80, 90);

  assert.equal(result.action, "already-handled");
  if (result.action === "already-handled") {
    assert.equal(result.reason, "target-already-sent");
  }
  assert.deepEqual(calls, { target: 1, intermediate: 0 });
});

test("E - propone la notifica target senza leggere lo stato intermedio", async () => {
  const { calls, resolve } = createReaders();

  const result = await resolve(1, 100, 80, 80);

  assert.equal(result.action, "send-target");
  assert.deepEqual(calls, { target: 1, intermediate: 0 });
});

test("F - riconosce una notifica target gia inviata", async () => {
  const { calls, resolve } = createReaders({ target: sentState });

  const result = await resolve(1, 100, 80, 80);

  assert.equal(result.action, "already-handled");
  if (result.action === "already-handled") {
    assert.equal(result.reason, "target-already-sent");
  }
  assert.deepEqual(calls, { target: 1, intermediate: 0 });
});

test("G - restituisce not-found se manca l'alert durante il controllo target", async () => {
  const { calls, resolve } = createReaders({
    target: { status: "not-found" },
  });

  const result = await resolve(1, 100, 80, 80);

  assert.equal(result.action, "not-found");
  assert.deepEqual(calls, { target: 1, intermediate: 0 });
});

test("H - restituisce not-found se manca l'alert durante il controllo intermedio", async () => {
  const { calls, resolve } = createReaders({
    intermediate: { status: "not-found" },
  });

  const result = await resolve(1, 100, 80, 90);

  assert.equal(result.action, "not-found");
  assert.deepEqual(calls, { target: 1, intermediate: 1 });
});

test("I - espone senza modifiche l'evaluation e le metriche della Funzione 017", async () => {
  const { resolve } = createReaders();
  const expectedEvaluation = evaluatePriceAlert(200, 100, 150);

  const result = await resolve(1, 200, 100, 150);

  assert.deepEqual(result.evaluation, expectedEvaluation);
  assert.deepEqual(result.evaluation, {
    status: "intermediate",
    initialPrice: 200,
    targetPrice: 100,
    currentPrice: 150,
    priceDrop: 50,
    dropPercent: 25,
    totalDistance: 100,
    progressToTargetPercent: 50,
    remainingToTarget: 50,
  });
});
