import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzePriceHistoryQuality,
  analyzePriceHistorySinceAvailableMinimum,
  analyzePriceHistoryWindowMinimum,
} from "./analyzePriceHistory";
import {
  AFFARIO_LOWEST_12_MONTHS_LABEL,
  AFFARIO_LOWEST_SINCE_AVAILABLE_LABEL,
  calculateAffarioScore,
  createAffarioAdvice,
  getAffarioAdviceBand,
  getAffarioPriceHighlight,
  getAffarioAdviceRecommendation,
} from "./affarioAdvice";

const RELIABLE_HISTORY = {
  observationCount: 4,
  coverageDays: 7,
  minimumPrice365Days: null,
  hasReliable365DayCoverage: false,
  minimumPriceSinceAvailable: null,
  hasReliableSinceAvailableCoverage: false,
};

test("prezzo attuale uguale al minimo produce score 100", () => {
  const advice = createAffarioAdvice({
    currentPrice: 80,
    minimumPrice90Days: 80,
    averagePrice90Days: 100,
    ...RELIABLE_HISTORY,
  });

  assert.equal(advice.score, 100);
  assert.equal(advice.label, "Ottimo momento");
  assert.equal(
    advice.message,
    "Il prezzo attuale è al minimo degli ultimi 90 giorni."
  );
});

test("prezzo a metà tra minimo e media produce score 75", () => {
  assert.equal(calculateAffarioScore(90, 80, 100), 75);
});

test("prezzo uguale alla media produce score 50", () => {
  assert.equal(calculateAffarioScore(100, 80, 100), 50);
});

test("prezzo dieci per cento sopra la media produce score 25", () => {
  assert.equal(calculateAffarioScore(110, 80, 100), 25);
});

test("prezzo almeno venti per cento sopra la media produce score zero", () => {
  assert.equal(calculateAffarioScore(120, 80, 100), 0);
  assert.equal(calculateAffarioScore(140, 80, 100), 0);
});

test("media uguale al minimo non causa divisioni non finite", () => {
  assert.equal(calculateAffarioScore(100, 100, 100), 100);
  assert.equal(calculateAffarioScore(105, 100, 100), 38);
});

test("valori nulli o non validi non producono uno score", () => {
  const invalidValues = [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY];

  for (const invalidValue of invalidValues) {
    assert.equal(calculateAffarioScore(invalidValue, 80, 100), null);
    assert.equal(calculateAffarioScore(90, invalidValue, 100), null);
    assert.equal(calculateAffarioScore(90, 80, invalidValue), null);
  }

  assert.equal(calculateAffarioScore(90, 110, 100), null);
});

test("storico insufficiente non espone score o verdetto forte", () => {
  for (const historyQuality of [
    { observationCount: 3, coverageDays: 7 },
    { observationCount: 4, coverageDays: 6.99 },
  ]) {
    const advice = createAffarioAdvice({
      currentPrice: 80,
      minimumPrice90Days: 80,
      averagePrice90Days: 100,
      minimumPrice365Days: null,
      hasReliable365DayCoverage: false,
      minimumPriceSinceAvailable: null,
      hasReliableSinceAvailableCoverage: false,
      ...historyQuality,
    });

    assert.deepEqual(advice, {
      status: "INSUFFICIENT_DATA",
      score: null,
      label: "Dati insufficienti",
      message:
        "AFFARIO non ha ancora abbastanza storico per esprimere un consiglio affidabile.",
      tone: "MUTED",
      recommendation: "NONE",
      priceHighlight: null,
    });
  }
});

test("Buy Box assente non produce score anche con storico sufficiente", () => {
  const advice = createAffarioAdvice({
    currentPrice: null,
    minimumPrice90Days: 80,
    averagePrice90Days: 100,
    ...RELIABLE_HISTORY,
  });

  assert.equal(advice.status, "INSUFFICIENT_DATA");
  assert.equal(advice.score, null);
});

test("il riconoscimento annuale non introduce una raccomandazione con Score insufficiente", () => {
  const advice = createAffarioAdvice({
    currentPrice: 80,
    minimumPrice90Days: 80,
    averagePrice90Days: 100,
    observationCount: 1,
    coverageDays: 0,
    minimumPrice365Days: 80,
    hasReliable365DayCoverage: true,
    minimumPriceSinceAvailable: null,
    hasReliableSinceAvailableCoverage: false,
  });

  assert.equal(advice.status, "INSUFFICIENT_DATA");
  assert.equal(advice.recommendation, "NONE");
  assert.equal(advice.priceHighlight, "LOWEST_12_MONTHS");
});

test("mapping delle fasce conserva tutte le soglie canoniche", () => {
  assert.equal(getAffarioAdviceBand(80)?.label, "Ottimo momento");
  assert.equal(getAffarioAdviceBand(79)?.label, "Buon prezzo");
  assert.equal(getAffarioAdviceBand(65)?.label, "Buon prezzo");
  assert.equal(getAffarioAdviceBand(64)?.label, "Prezzo nella media");
  assert.equal(getAffarioAdviceBand(50)?.label, "Prezzo nella media");
  assert.equal(getAffarioAdviceBand(49)?.label, "Conviene aspettare");
});

test("mapping raccomandazioni conserva tutte le soglie operative", () => {
  assert.equal(getAffarioAdviceRecommendation(100), "BUY_NOW");
  assert.equal(getAffarioAdviceRecommendation(80), "BUY_NOW");
  assert.equal(getAffarioAdviceRecommendation(79), "BUY");
  assert.equal(getAffarioAdviceRecommendation(65), "BUY");
  assert.equal(getAffarioAdviceRecommendation(64), "NEUTRAL");
  assert.equal(getAffarioAdviceRecommendation(50), "NEUTRAL");
  assert.equal(getAffarioAdviceRecommendation(49), "WAIT");
  assert.equal(getAffarioAdviceRecommendation(null), "NONE");
});

test("riconosce il minimo annuale solo con copertura affidabile", () => {
  assert.equal(
    AFFARIO_LOWEST_12_MONTHS_LABEL,
    "🏆 PREZZO PIÙ BASSO DEGLI ULTIMI 12 MESI"
  );
  assert.equal(
    getAffarioPriceHighlight({
      currentPrice: 80,
      minimumPrice365Days: 80,
      hasReliable365DayCoverage: true,
      minimumPriceSinceAvailable: null,
      hasReliableSinceAvailableCoverage: false,
    }),
    "LOWEST_12_MONTHS"
  );
  assert.equal(
    getAffarioPriceHighlight({
      currentPrice: 79,
      minimumPrice365Days: 80,
      hasReliable365DayCoverage: true,
      minimumPriceSinceAvailable: null,
      hasReliableSinceAvailableCoverage: false,
    }),
    "LOWEST_12_MONTHS"
  );
  assert.equal(
    getAffarioPriceHighlight({
      currentPrice: 80,
      minimumPrice365Days: 70,
      hasReliable365DayCoverage: true,
      minimumPriceSinceAvailable: null,
      hasReliableSinceAvailableCoverage: false,
    }),
    null
  );
  assert.equal(
    getAffarioPriceHighlight({
      currentPrice: 80,
      minimumPrice365Days: 80,
      hasReliable365DayCoverage: false,
      minimumPriceSinceAvailable: null,
      hasReliableSinceAvailableCoverage: false,
    }),
    null
  );
});

test("riconosce il minimo da quando disponibile solo con inizio e serie certificati", () => {
  const minimum = analyzePriceHistorySinceAvailableMinimum({
    observations: [
      { price: null, observedAt: "2026-01-01T00:00:00.000Z" },
      { price: 100, observedAt: "2026-01-10T00:00:00.000Z" },
      { price: 95, observedAt: "2026-02-01T00:00:00.000Z" },
      { price: 90, observedAt: "2026-03-01T00:00:00.000Z" },
      { price: 80, observedAt: "2026-03-31T00:00:00.000Z" },
    ],
    trackingStartedAt: "2025-12-31T12:00:00.000Z",
    listedAt: "2026-01-01T00:00:00.000Z",
    windowEnd: "2026-04-01T00:00:00.000Z",
    isCompleteSeries: true,
    isTruncated: false,
  });

  assert.deepEqual(minimum, {
    minimumPrice: 80,
    hasReliableCoverage: true,
    observationCount: 4,
    coverageDays: 90,
  });
  assert.equal(
    AFFARIO_LOWEST_SINCE_AVAILABLE_LABEL,
    "🏆 PREZZO PIÙ BASSO DI SEMPRE"
  );
  assert.equal(
    getAffarioPriceHighlight({
      currentPrice: 80,
      minimumPrice365Days: null,
      hasReliable365DayCoverage: false,
      minimumPriceSinceAvailable: minimum.minimumPrice,
      hasReliableSinceAvailableCoverage:
        minimum.hasReliableCoverage,
    }),
    "LOWEST_SINCE_AVAILABLE"
  );
});

test("non certifica un intervallo breve senza prova dell'inizio della serie", () => {
  const minimum = analyzePriceHistorySinceAvailableMinimum({
    observations: [
      { price: 100, observedAt: "2026-01-10T00:00:00.000Z" },
      { price: 95, observedAt: "2026-02-01T00:00:00.000Z" },
      { price: 90, observedAt: "2026-03-01T00:00:00.000Z" },
      { price: 80, observedAt: "2026-03-31T00:00:00.000Z" },
    ],
    trackingStartedAt: null,
    listedAt: "2026-01-01T00:00:00.000Z",
    windowEnd: "2026-04-01T00:00:00.000Z",
    isCompleteSeries: true,
    isTruncated: false,
  });

  assert.equal(minimum.hasReliableCoverage, false);
  assert.equal(minimum.minimumPrice, null);
  assert.equal(
    getAffarioPriceHighlight({
      currentPrice: 80,
      minimumPrice365Days: null,
      hasReliable365DayCoverage: false,
      minimumPriceSinceAvailable: minimum.minimumPrice,
      hasReliableSinceAvailableCoverage:
        minimum.hasReliableCoverage,
    }),
    null
  );
});

test("dati da disponibilità invalidi o insufficienti non sono affidabili", () => {
  const baseInput = {
    observations: [
      { price: 100, observedAt: "2026-01-10T00:00:00.000Z" },
      { price: 90, observedAt: "2026-02-01T00:00:00.000Z" },
      { price: 80, observedAt: "2026-03-01T00:00:00.000Z" },
    ],
    trackingStartedAt: "2025-12-31T00:00:00.000Z",
    listedAt: "2026-01-01T00:00:00.000Z",
    windowEnd: "2026-04-01T00:00:00.000Z",
    isCompleteSeries: true,
    isTruncated: false,
  } as const;

  assert.equal(
    analyzePriceHistorySinceAvailableMinimum(baseInput)
      .hasReliableCoverage,
    false
  );
  assert.equal(
    analyzePriceHistorySinceAvailableMinimum({
      ...baseInput,
      trackingStartedAt: "non-una-data",
    }).hasReliableCoverage,
    false
  );
  assert.equal(
    analyzePriceHistorySinceAvailableMinimum({
      ...baseInput,
      observations: [
        ...baseInput.observations,
        { price: 70, observedAt: "2026-03-15T00:00:00.000Z" },
      ],
      isCompleteSeries: false,
    }).hasReliableCoverage,
    false
  );
});

test("il prezzo non al minimo non riceve highlight e i 12 mesi hanno precedenza", () => {
  assert.equal(
    getAffarioPriceHighlight({
      currentPrice: 80,
      minimumPrice365Days: null,
      hasReliable365DayCoverage: false,
      minimumPriceSinceAvailable: 70,
      hasReliableSinceAvailableCoverage: true,
    }),
    null
  );
  assert.equal(
    getAffarioPriceHighlight({
      currentPrice: 80,
      minimumPrice365Days: 80,
      hasReliable365DayCoverage: true,
      minimumPriceSinceAvailable: 80,
      hasReliableSinceAvailableCoverage: true,
    }),
    "LOWEST_12_MONTHS"
  );
});

test("il nuovo fatto sul prezzo non modifica Score o raccomandazione", () => {
  const withoutHighlight = createAffarioAdvice({
    currentPrice: 80,
    minimumPrice90Days: 80,
    averagePrice90Days: 100,
    ...RELIABLE_HISTORY,
  });
  const withHighlight = createAffarioAdvice({
    currentPrice: 80,
    minimumPrice90Days: 80,
    averagePrice90Days: 100,
    ...RELIABLE_HISTORY,
    minimumPriceSinceAvailable: 80,
    hasReliableSinceAvailableCoverage: true,
  });

  assert.equal(withHighlight.priceHighlight, "LOWEST_SINCE_AVAILABLE");
  assert.equal(withHighlight.score, withoutHighlight.score);
  assert.equal(withHighlight.recommendation, withoutHighlight.recommendation);
  assert.equal(withHighlight.label, withoutHighlight.label);
  assert.equal(withHighlight.message, withoutHighlight.message);
  assert.equal(withHighlight.tone, withoutHighlight.tone);
});

test("il minimo annuale richiede lo stato al cutoff e una lettura completa", () => {
  const reliableMinimum = analyzePriceHistoryWindowMinimum({
    observations: [
      { price: 120, observedAt: "2025-08-20T00:00:00.000Z" },
      { price: 105, observedAt: "2025-10-01T00:00:00.000Z" },
      { price: null, observedAt: "2026-01-01T00:00:00.000Z" },
      { price: 80, observedAt: "2026-08-20T00:00:00.000Z" },
    ],
    windowStart: "2025-08-25T00:00:00.000Z",
    windowEnd: "2026-08-25T00:00:00.000Z",
    isTruncated: false,
  });

  assert.deepEqual(reliableMinimum, {
    minimumPrice: 80,
    hasReliableCoverage: true,
  });
  assert.deepEqual(
    analyzePriceHistoryWindowMinimum({
      observations: [
        { price: 105, observedAt: "2025-10-01T00:00:00.000Z" },
        { price: 80, observedAt: "2026-08-20T00:00:00.000Z" },
      ],
      windowStart: "2025-08-25T00:00:00.000Z",
      windowEnd: "2026-08-25T00:00:00.000Z",
      isTruncated: false,
    }),
    { minimumPrice: null, hasReliableCoverage: false }
  );
  assert.deepEqual(
    analyzePriceHistoryWindowMinimum({
      observations: [
        { price: 120, observedAt: "2025-08-20T00:00:00.000Z" },
        { price: 80, observedAt: "2026-08-20T00:00:00.000Z" },
      ],
      windowStart: "2025-08-25T00:00:00.000Z",
      windowEnd: "2026-08-25T00:00:00.000Z",
      isTruncated: true,
    }),
    { minimumPrice: null, hasReliableCoverage: false }
  );
});

test("il minimo 90 giorni resta la motivazione quando quello annuale non ricorre", () => {
  const advice = createAffarioAdvice({
    currentPrice: 80,
    minimumPrice90Days: 80,
    averagePrice90Days: 100,
    ...RELIABLE_HISTORY,
    minimumPrice365Days: 70,
    hasReliable365DayCoverage: true,
  });

  assert.equal(advice.priceHighlight, null);
  assert.equal(
    advice.message,
    "Il prezzo attuale è al minimo degli ultimi 90 giorni."
  );
});

test("qualità storico conta solo osservazioni valide e misura la copertura", () => {
  const quality = analyzePriceHistoryQuality([
    { price: 100, observedAt: "2026-08-01T00:00:00.000Z" },
    { price: 99, observedAt: "2026-08-03T00:00:00.000Z" },
    { price: 98, observedAt: "2026-08-05T00:00:00.000Z" },
    { price: 97, observedAt: "2026-08-08T00:00:00.000Z" },
    { price: 0, observedAt: "2026-08-09T00:00:00.000Z" },
    { price: 96, observedAt: "non-una-data" },
  ]);

  assert.deepEqual(quality, { observationCount: 4, coverageDays: 7 });
});
