import assert from "node:assert/strict";
import test from "node:test";

import {
  getPriceAlertCheckIntervalMs,
  getPriceAlertGroupIntervalMs,
  isPriceAlertGroupDue,
  PRICE_ALERT_CHECK_INTERVAL_MS,
} from "./priceAlertMonitoring";

const HOUR = 60 * 60 * 1_000;

test("frequenze V1 e boundary deterministici", () => {
  assert.equal(getPriceAlertCheckIntervalMs(115.01, 100), 12 * HOUR);
  assert.equal(getPriceAlertCheckIntervalMs(115, 100), 6 * HOUR);
  assert.equal(getPriceAlertCheckIntervalMs(110, 100), 6 * HOUR);
  assert.equal(getPriceAlertCheckIntervalMs(108.01, 100), 6 * HOUR);
  assert.equal(getPriceAlertCheckIntervalMs(108, 100), 3 * HOUR);
  assert.equal(getPriceAlertCheckIntervalMs(105, 100), 3 * HOUR);
  assert.equal(getPriceAlertCheckIntervalMs(103.01, 100), 3 * HOUR);
  assert.equal(getPriceAlertCheckIntervalMs(103, 100), HOUR);
  assert.equal(getPriceAlertCheckIntervalMs(102, 100), HOUR);
  assert.equal(getPriceAlertCheckIntervalMs(100, 100), HOUR);
});

test("il gruppo usa l'intervallo più breve richiesto dai target", () => {
  assert.equal(
    getPriceAlertGroupIntervalMs(120, [
      { targetPrice: 100 },
      { targetPrice: 110 },
      { targetPrice: 117 },
    ]),
    PRICE_ALERT_CHECK_INTERVAL_MS.IMMINENT
  );
});

test("un prezzo locale mancante usa al massimo la frequenza di un'ora", () => {
  assert.equal(
    getPriceAlertGroupIntervalMs(null, [{ targetPrice: 100 }]),
    PRICE_ALERT_CHECK_INTERVAL_MS.IMMINENT
  );
});

test("snapshot recente non è due e snapshot scaduta è due", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");

  assert.equal(
    isPriceAlertGroupDue({
      requestedAt: "2026-08-28T11:00:00.001Z",
      intervalMs: HOUR,
      now,
    }),
    false
  );
  assert.equal(
    isPriceAlertGroupDue({
      requestedAt: "2026-08-28T11:00:00.000Z",
      intervalMs: HOUR,
      now,
    }),
    true
  );
});

test("ASIN senza snapshot è eleggibile per il controllo iniziale", () => {
  assert.equal(
    isPriceAlertGroupDue({
      requestedAt: null,
      intervalMs: 12 * HOUR,
      now: new Date("2026-08-28T12:00:00.000Z"),
    }),
    true
  );
});
