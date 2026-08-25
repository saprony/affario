import assert from "node:assert/strict";
import test from "node:test";

import {
  ProductAnalysisRequestError,
  formatEuroPrice,
  formatLastBuyBoxUpdate,
  getProductAnalysisPresentation,
  requestProductAnalysisOnce,
  type ProductAnalysisRequester,
} from "./productAnalysis";
import type { AffarioAdvice } from "../types/affarioAdvice";
import type {
  AffarioProductAnalysisData,
  AffarioSavingsPotential,
} from "../types/productAnalysis";

function createPayload(overrides?: {
  status?: "AVAILABLE" | "UNAVAILABLE";
  currentPrice?: number | null;
  priceHighlight?: AffarioAdvice["priceHighlight"];
  savingsPotential?: AffarioSavingsPotential;
}) {
  return {
    data: {
      asin: "B0FQGPJCJK",
      title: "Titolo marketplace interno",
      buyBox: {
        status: overrides?.status ?? "AVAILABLE",
        currentPrice: overrides?.currentPrice ?? 1169,
        price: 999,
        currency: "EUR",
      },
      lastBuyBoxUpdate: "2026-08-24T08:05:00.000Z",
      lastKeepaCheckAt: "2026-08-24T09:05:00.000Z",
      priceHistory90Days: {
        averageBuyBoxPrice: 1210.5,
        minimumBuyBoxPrice: 1099,
        currency: "EUR",
      },
      advice: {
        status: "AVAILABLE",
        score: 84,
        label: "Ottimo momento",
        message:
          "Il prezzo attuale è molto vicino ai minimi recenti e sotto la media degli ultimi 90 giorni.",
        tone: "POSITIVE",
        recommendation: "BUY_NOW",
        priceHighlight:
          overrides?.priceHighlight ?? "LOWEST_12_MONTHS",
      },
      savingsPotential:
        overrides?.savingsPotential ??
        ({
          status: "AVAILABLE",
          amount: 150,
          targetPrice: 1_150,
          message:
            "Stima basata sui prezzi favorevoli realmente osservati negli ultimi 90 giorni.",
        } as const),
      source: "DATABASE_CACHE",
      cacheHit: true,
    },
  };
}

test("una doppia azione durante il loading produce una sola richiesta", async () => {
  let requests = 0;
  let resolveRequest!: (value: ReturnType<typeof createPayload>) => void;
  const payloadPromise = new Promise<ReturnType<typeof createPayload>>(
    (resolve) => {
      resolveRequest = resolve;
    }
  );
  const requester: ProductAnalysisRequester = async (input) => {
    requests += 1;
    assert.equal(input, "/api/products/B0FQGPJCJK");

    return {
      ok: true,
      json: () => payloadPromise,
    };
  };
  const gate = { inFlight: false };
  const firstRequest = requestProductAnalysisOnce(
    "B0FQGPJCJK",
    gate,
    requester
  );
  const duplicateRequest = requestProductAnalysisOnce(
    "B0FQGPJCJK",
    gate,
    requester
  );

  assert.ok(firstRequest);
  assert.equal(duplicateRequest, null);
  assert.equal(requests, 1);

  resolveRequest(createPayload());
  const result = await firstRequest;

  assert.equal(result.asin, "B0FQGPJCJK");
  assert.equal(gate.inFlight, false);
});

test("mantiene il riconoscimento da quando disponibile nella presentazione", async () => {
  const requester: ProductAnalysisRequester = async () => ({
    ok: true,
    json: async () =>
      createPayload({ priceHighlight: "LOWEST_SINCE_AVAILABLE" }),
  });
  const result = await requestProductAnalysisOnce(
    "B0FQGPJCJK",
    { inFlight: false },
    requester
  );

  assert.ok(result);
  assert.equal(
    result.advice.priceHighlight,
    "LOWEST_SINCE_AVAILABLE"
  );
  assert.equal(
    getProductAnalysisPresentation(result).advice.priceHighlight,
    "LOWEST_SINCE_AVAILABLE"
  );
});

test("espone al client soltanto i dati necessari alla presentazione", async () => {
  const requester: ProductAnalysisRequester = async () => ({
    ok: true,
    json: async () => createPayload(),
  });
  const result = await requestProductAnalysisOnce(
    "B0FQGPJCJK",
    { inFlight: false },
    requester
  );

  assert.ok(result);
  assert.deepEqual(Object.keys(result).sort(), [
    "advice",
    "asin",
    "buyBox",
    "lastBuyBoxUpdate",
    "priceHistory90Days",
    "savingsPotential",
  ]);
  assert.equal("lastKeepaCheckAt" in result, false);
  assert.equal("source" in result, false);
  assert.equal("cacheHit" in result, false);

  const presentation = getProductAnalysisPresentation(result);

  assert.equal(
    presentation.amazonCta?.url,
    "https://www.amazon.it/dp/B0FQGPJCJK?tag=affario-21"
  );
  assert.equal(presentation.amazonCta?.label, "Compra ora su Amazon");
  assert.equal(
    presentation.advice.priceHighlight,
    "LOWEST_12_MONTHS"
  );
  assert.deepEqual(presentation.savingsPotential, {
    amount: "150,00 €",
    targetPrice: "1.150,00 €",
    message:
      "Stima basata sui prezzi favorevoli realmente osservati negli ultimi 90 giorni.",
    prominence: "SUBTLE",
  });
  assert.equal(
    presentation.amazonCta?.label.includes(result.asin),
    false
  );
});

test("la CTA Amazon segue la raccomandazione senza mostrare l'ASIN", () => {
  const baseData = {
    asin: "B0FQGPJCJK",
    buyBox: { status: "AVAILABLE" as const, currentPrice: 1169 },
    lastBuyBoxUpdate: "2026-08-24T08:05:00.000Z",
    priceHistory90Days: {
      averageBuyBoxPrice: 1242.53,
      minimumBuyBoxPrice: 1169,
    },
    savingsPotential: {
      status: "AVAILABLE" as const,
      amount: 150,
      targetPrice: 1_150,
      message:
        "Stima basata sui prezzi favorevoli realmente osservati negli ultimi 90 giorni.",
    },
  };
  const cases: Array<{
    advice: AffarioAdvice;
    expectedPriority: "PRIMARY" | "SUPPORTING" | "NEUTRAL" | null;
    expectedSavingsProminence:
      | "SUBTLE"
      | "STANDARD"
      | "PROMINENT"
      | null;
  }> = [
    {
      advice: {
        status: "AVAILABLE",
        score: 100,
        label: "Ottimo momento",
        message: "Prezzo al minimo.",
        tone: "POSITIVE",
        recommendation: "BUY_NOW",
        priceHighlight: null,
      },
      expectedPriority: "PRIMARY",
      expectedSavingsProminence: "SUBTLE",
    },
    {
      advice: {
        status: "AVAILABLE",
        score: 79,
        label: "Buon prezzo",
        message: "Prezzo sotto la media.",
        tone: "POSITIVE",
        recommendation: "BUY",
        priceHighlight: null,
      },
      expectedPriority: "SUPPORTING",
      expectedSavingsProminence: "SUBTLE",
    },
    {
      advice: {
        status: "AVAILABLE",
        score: 50,
        label: "Prezzo nella media",
        message: "Prezzo in linea con la media.",
        tone: "NEUTRAL",
        recommendation: "NEUTRAL",
        priceHighlight: null,
      },
      expectedPriority: "NEUTRAL",
      expectedSavingsProminence: "STANDARD",
    },
    {
      advice: {
        status: "AVAILABLE",
        score: 49,
        label: "Conviene aspettare",
        message: "Prezzo sopra la media.",
        tone: "NEGATIVE",
        recommendation: "WAIT",
        priceHighlight: null,
      },
      expectedPriority: null,
      expectedSavingsProminence: "PROMINENT",
    },
    {
      advice: {
        status: "INSUFFICIENT_DATA",
        score: null,
        label: "Dati insufficienti",
        message: "Storico insufficiente.",
        tone: "MUTED",
        recommendation: "NONE",
        priceHighlight: null,
      },
      expectedPriority: null,
      expectedSavingsProminence: null,
    },
  ];

  for (const {
    advice,
    expectedPriority,
    expectedSavingsProminence,
  } of cases) {
    const presentation = getProductAnalysisPresentation({
      ...baseData,
      advice,
    } satisfies AffarioProductAnalysisData);

    assert.equal(presentation.amazonCta?.priority ?? null, expectedPriority);
    assert.equal(
      presentation.savingsPotential?.prominence ?? null,
      expectedSavingsProminence
    );
    assert.deepEqual(presentation.advice, advice);
    assert.equal(
      presentation.amazonCta?.label.includes(baseData.asin) ?? false,
      false
    );
  }
});

test("NOT_APPLICABLE non espone importo o target consumer", () => {
  const payload = createPayload({
    savingsPotential: {
      status: "NOT_APPLICABLE",
      amount: null,
      targetPrice: null,
      message: null,
    },
  }).data;
  const presentation = getProductAnalysisPresentation({
    asin: payload.asin,
    buyBox: payload.buyBox,
    lastBuyBoxUpdate: payload.lastBuyBoxUpdate,
    priceHistory90Days: payload.priceHistory90Days,
    advice: payload.advice as AffarioAdvice,
    savingsPotential: payload.savingsPotential,
  } satisfies AffarioProductAnalysisData);

  assert.equal(presentation.savingsPotential, null);
  assert.equal(presentation.advice.recommendation, "BUY_NOW");
  assert.equal(presentation.amazonCta?.priority, "PRIMARY");
});

test("dopo un errore rilascia il loading e consente un retry volontario", async () => {
  let requests = 0;
  const gate = { inFlight: false };
  const failingRequester: ProductAnalysisRequester = async () => {
    requests += 1;

    return {
      ok: false,
      json: async () => ({
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Il servizio prodotto non è temporaneamente disponibile.",
        },
      }),
    };
  };

  await assert.rejects(
    requestProductAnalysisOnce(
      "B0FQGPJCJK",
      gate,
      failingRequester
    )!,
    (error: unknown) =>
      error instanceof ProductAnalysisRequestError &&
      error.message ===
        "Il servizio prodotto non è temporaneamente disponibile."
  );

  assert.equal(requests, 1);
  assert.equal(gate.inFlight, false);

  const successfulRequester: ProductAnalysisRequester = async () => {
    requests += 1;

    return { ok: true, json: async () => createPayload() };
  };
  const voluntaryRetry = requestProductAnalysisOnce(
    "B0FQGPJCJK",
    gate,
    successfulRequester
  );

  assert.ok(voluntaryRetry);
  assert.equal((await voluntaryRetry).asin, "B0FQGPJCJK");
  assert.equal(requests, 2);
  assert.equal(gate.inFlight, false);
});

test("formatta i prezzi in euro secondo la convenzione italiana", () => {
  assert.equal(formatEuroPrice(1169), "1.169,00 €");
  assert.equal(formatEuroPrice(12.5), "12,50 €");
  assert.equal(formatEuroPrice(null), null);
});

test("formatta lastBuyBoxUpdate nella timezone Europe/Rome", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");

  assert.equal(
    formatLastBuyBoxUpdate("2026-08-24T08:05:00.000Z", now),
    "Prezzo rilevato alle 10:05"
  );
  assert.equal(
    formatLastBuyBoxUpdate("2026-08-23T20:15:00.000Z", now),
    "Prezzo rilevato il 23/08 alle 22:15"
  );
  assert.equal(formatLastBuyBoxUpdate(null, now), null);
});

test("Buy Box assente non usa price, AMAZON o altri fallback", () => {
  const data = {
    asin: "B0FQGPJCJK",
    buyBox: { status: "UNAVAILABLE" as const, currentPrice: null },
    lastBuyBoxUpdate: "2026-08-24T08:05:00.000Z",
    priceHistory90Days: {
      averageBuyBoxPrice: 1210.5,
      minimumBuyBoxPrice: 1099,
    },
    advice: {
      status: "INSUFFICIENT_DATA" as const,
      score: null,
      label: "Dati insufficienti" as const,
      message:
        "AFFARIO non ha ancora abbastanza storico per esprimere un consiglio affidabile.",
      tone: "MUTED" as const,
      recommendation: "NONE" as const,
      priceHighlight: null,
    },
    savingsPotential: {
      status: "INSUFFICIENT_DATA" as const,
      amount: null,
      targetPrice: null,
      message: null,
    },
  };
  const presentation = getProductAnalysisPresentation(data);

  assert.equal(presentation.isBuyBoxAvailable, false);
  assert.equal(presentation.currentPrice, null);
  assert.equal(presentation.priceTimestamp, null);
  assert.equal(presentation.advice.status, "INSUFFICIENT_DATA");
  assert.equal(presentation.advice.score, null);
  assert.equal(presentation.amazonCta, null);
  assert.equal(presentation.savingsPotential, null);
  assert.equal(presentation.minimum90Days, "1.099,00 €");
  assert.equal(presentation.average90Days, "1.210,50 €");
});
