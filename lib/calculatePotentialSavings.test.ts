import assert from "node:assert/strict";
import test from "node:test";

import {
  AFFARIO_SAVINGS_POTENTIAL_MESSAGE,
  calculatePotentialSavings,
  roundAffarioAmountToNearestFive,
  type TimeWeightedBuyBoxPoint,
} from "./calculatePotentialSavings";

const WINDOW_START = "2026-01-01T00:00:00.000Z";
const WINDOW_END = "2026-04-01T00:00:00.000Z";
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

function atDay(day: number): string {
  return new Date(
    Date.parse(WINDOW_START) + day * DAY_IN_MILLISECONDS
  ).toISOString();
}

function analyze(
  currentPrice: number | null,
  observations: readonly TimeWeightedBuyBoxPoint[],
  isTruncated = false
) {
  return calculatePotentialSavings({
    currentPrice,
    observations,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    isTruncated,
  });
}

function constantPriceHistory(price: number): TimeWeightedBuyBoxPoint[] {
  return [
    { price, observedAt: atDay(-1) },
    { price, observedAt: atDay(10) },
    { price, observedAt: atDay(30) },
    { price, observedAt: atDay(60) },
    { price, observedAt: atDay(80) },
  ];
}

test("un minimo estremo breve non diventa automaticamente il Q25", () => {
  const result = analyze(600, [
    { price: 520, observedAt: atDay(-1) },
    { price: 480, observedAt: atDay(30) },
    { price: 450, observedAt: atDay(55) },
    { price: 420, observedAt: atDay(75) },
    { price: 300, observedAt: atDay(89) },
  ]);

  assert.equal(result.weightedPercentile25, 450);
  assert.equal(result.targetPrice, 450);
  assert.equal(result.potentialSavings, 150);
  assert.deepEqual(result.savingsPotential, {
    status: "AVAILABLE",
    amount: 150,
    targetPrice: 450,
    message: AFFARIO_SAVINGS_POTENTIAL_MESSAGE,
  });
});

test("un prezzo basso che raggiunge esattamente il 25% della durata valida diventa Q25", () => {
  const result = analyze(110, [
    { price: 80, observedAt: atDay(-1) },
    { price: 100, observedAt: atDay(22.5) },
    { price: 100, observedAt: atDay(30) },
    { price: 100, observedAt: atDay(60) },
    { price: 100, observedAt: atDay(80) },
  ]);

  assert.equal(result.weightedPercentile25, 80);
  assert.equal(result.savingsPotential.status, "AVAILABLE");

  const justBelowThreshold = analyze(110, [
    { price: 80, observedAt: atDay(-1) },
    { price: 100, observedAt: atDay(22.5 - 1 / 86_400) },
    { price: 100, observedAt: atDay(30) },
    { price: 100, observedAt: atDay(60) },
    { price: 100, observedAt: atDay(80) },
  ]);

  assert.equal(justBelowThreshold.weightedPercentile25, 100);
});

test("record intermedi equivalenti non cambiano il target time-weighted", () => {
  const compactHistory = [
    { price: 100, observedAt: atDay(-1) },
    { price: 80, observedAt: atDay(10) },
    { price: 100, observedAt: atDay(35) },
    { price: 80, observedAt: atDay(60) },
    { price: 100, observedAt: atDay(70) },
  ];
  const verboseHistory = [
    { price: 100, observedAt: atDay(-1) },
    { price: 100, observedAt: atDay(5) },
    { price: 80, observedAt: atDay(10) },
    { price: 80, observedAt: atDay(20) },
    { price: 100, observedAt: atDay(35) },
    { price: 100, observedAt: atDay(45) },
    { price: 80, observedAt: atDay(60) },
    { price: 80, observedAt: atDay(65) },
    { price: 100, observedAt: atDay(70) },
  ];

  const compact = analyze(120, compactHistory);
  const verbose = analyze(120, verboseHistory);

  assert.equal(compact.weightedPercentile25, 80);
  assert.equal(verbose.weightedPercentile25, 80);
  assert.equal(compact.targetPrice, verbose.targetPrice);
  assert.equal(compact.potentialSavings, verbose.potentialSavings);
});

test("lo stato precedente al cutoff contribuisce soltanto dentro la finestra", () => {
  const result = analyze(220, [
    { price: 100, observedAt: "2025-01-01T00:00:00.000Z" },
    { price: 200, observedAt: atDay(10) },
    { price: 200, observedAt: atDay(30) },
    { price: 200, observedAt: atDay(60) },
    { price: 200, observedAt: atDay(80) },
  ]);

  assert.equal(result.calendarCoverageDays, 90);
  assert.equal(result.validPriceDurationDays, 90);
  assert.equal(result.weightedPercentile25, 200);
});

test("i periodi Buy Box unavailable non sono zero e non entrano nel percentile", () => {
  const result = analyze(110, [
    { price: 100, observedAt: atDay(-1) },
    { price: null, observedAt: atDay(20) },
    { price: 80, observedAt: atDay(40) },
    { price: 100, observedAt: atDay(60) },
    { price: 100, observedAt: atDay(70) },
    { price: 100, observedAt: atDay(80) },
  ]);

  assert.equal(result.validPriceDurationDays, 70);
  assert.equal(result.weightedPercentile25, 80);
  assert.notEqual(result.weightedPercentile25, 0);
});

test("arrotonda importi positivi ai 5 euro con il punto medio verso l'alto", () => {
  assert.equal(roundAffarioAmountToNearestFive(1_147), 1_145);
  assert.equal(roundAffarioAmountToNearestFive(1_148), 1_150);
  assert.equal(roundAffarioAmountToNearestFive(1_147.49), 1_145);
  assert.equal(roundAffarioAmountToNearestFive(1_147.5), 1_150);
  assert.equal(roundAffarioAmountToNearestFive(0), null);
});

test("calcola target e risparmio consumer senza arrotondare prima il Q25", () => {
  const result = analyze(1_296, constantPriceHistory(1_147));

  assert.equal(result.weightedPercentile25, 1_147);
  assert.equal(result.targetPrice, 1_145);
  assert.equal(result.potentialSavings, 150);
  assert.equal(result.savingsPotential.status, "AVAILABLE");
  assert.equal(result.savingsPotential.amount, 150);
  assert.equal(result.savingsPotential.targetPrice, 1_145);
});

test("current non superiore al target produce NOT_APPLICABLE senza target consumer", () => {
  const atTarget = analyze(100, constantPriceHistory(100));
  const positiveButRoundedToZero = analyze(101, constantPriceHistory(100));

  for (const result of [atTarget, positiveButRoundedToZero]) {
    assert.equal(result.savingsPotential.status, "NOT_APPLICABLE");
    assert.equal(result.savingsPotential.amount, null);
    assert.equal(result.savingsPotential.targetPrice, null);
    assert.equal(result.savingsPotential.message, null);
  }
});

test("storico incompleto o qualità insufficiente non produce target consumer", () => {
  const missingStartState = analyze(120, [
    { price: 100, observedAt: atDay(10) },
    { price: 90, observedAt: atDay(30) },
    { price: 80, observedAt: atDay(60) },
    { price: 70, observedAt: atDay(80) },
  ]);
  const tooFewObservations = analyze(120, [
    { price: 100, observedAt: atDay(-1) },
    { price: 90, observedAt: atDay(20) },
    { price: 80, observedAt: atDay(40) },
    { price: 70, observedAt: atDay(60) },
  ]);
  const truncated = analyze(120, constantPriceHistory(100), true);
  const insufficientValidDuration = analyze(120, [
    { price: null, observedAt: atDay(-1) },
    { price: 100, observedAt: atDay(10) },
    { price: null, observedAt: atDay(11) },
    { price: 90, observedAt: atDay(30) },
    { price: null, observedAt: atDay(31) },
    { price: 80, observedAt: atDay(50) },
    { price: null, observedAt: atDay(51) },
    { price: 70, observedAt: atDay(70) },
    { price: null, observedAt: atDay(71) },
  ]);

  for (const result of [
    missingStartState,
    tooFewObservations,
    truncated,
    insufficientValidDuration,
  ]) {
    assert.equal(result.savingsPotential.status, "INSUFFICIENT_DATA");
    assert.equal(result.weightedPercentile25, null);
    assert.equal(result.targetPrice, null);
    assert.equal(result.potentialSavings, null);
  }
});

test("null, zero, NaN e Infinity non producono un target", () => {
  for (const currentPrice of [
    null,
    0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.equal(
      analyze(currentPrice, constantPriceHistory(100)).savingsPotential
        .status,
      "INSUFFICIENT_DATA"
    );
  }

  for (const invalidPrice of [
    0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    const history = constantPriceHistory(100);
    history[2] = { price: invalidPrice, observedAt: atDay(30) };

    assert.equal(
      analyze(120, history).savingsPotential.status,
      "INSUFFICIENT_DATA"
    );
  }
});
