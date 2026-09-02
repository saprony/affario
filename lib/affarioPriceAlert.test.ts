import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPendingPriceAlertInsert,
  getAffarioPriceAlertOpportunity,
  isActivePriceAlertStatus,
  normalizePriceAlertEmail,
  PRICE_ALERT_MAX_EMAIL_LENGTH,
  PriceAlertRequestError,
  requestAffarioPriceAlertOnce,
  resolveTrustedAffarioPriceAlert,
  type PriceAlertPersistenceStatus,
  type PriceAlertRequester,
} from "./affarioPriceAlert";
import type { AffarioSavingsPotential } from "../types/productAnalysis";

const availableSavings: AffarioSavingsPotential = {
  status: "AVAILABLE",
  amount: 150,
  targetPrice: 1_150,
  message: "Il prezzo obiettivo non è una previsione o una promessa.",
};

const insufficientSavings: AffarioSavingsPotential = {
  status: "INSUFFICIENT_DATA",
  amount: null,
  targetPrice: null,
  message: null,
};

function successfulResponse(
  overrides: Partial<{
    alreadyExists: boolean;
    confirmationEmailSent: boolean;
    alertStatus: PriceAlertPersistenceStatus;
  }> = {}
) {
  return {
    ok: true,
    async json() {
      return {
        success: true,
        alreadyExists: overrides.alreadyExists ?? false,
        confirmationEmailSent: overrides.confirmationEmailSent ?? true,
        alertStatus: overrides.alertStatus ?? "pending_confirmation",
      };
    },
  };
}

test("WAIT + AVAILABLE espone la CTA alert primaria", () => {
  assert.deepEqual(
    getAffarioPriceAlertOpportunity({
      recommendation: "WAIT",
      currentPrice: 1_300,
      savingsPotential: availableSavings,
    }),
    { priority: "PRIMARY", label: "Avvisami quando conviene" }
  );
});

test("NEUTRAL + AVAILABLE espone la CTA alert secondaria", () => {
  assert.deepEqual(
    getAffarioPriceAlertOpportunity({
      recommendation: "NEUTRAL",
      currentPrice: 1_300,
      savingsPotential: availableSavings,
    }),
    { priority: "SECONDARY", label: "Avvisami se il prezzo migliora" }
  );
});

test("BUY resta un alert secondario mentre BUY_NOW non espone alert", () => {
  assert.equal(
    getAffarioPriceAlertOpportunity({
      recommendation: "BUY",
      currentPrice: 1_300,
      savingsPotential: availableSavings,
    })?.priority,
    "SECONDARY"
  );
  assert.equal(
    getAffarioPriceAlertOpportunity({
      recommendation: "BUY_NOW",
      currentPrice: 1_300,
      savingsPotential: availableSavings,
    }),
    null
  );
});

test("NONE o savingsPotential insufficiente non propongono un target alert", () => {
  assert.equal(
    getAffarioPriceAlertOpportunity({
      recommendation: "NONE",
      currentPrice: 1_300,
      savingsPotential: insufficientSavings,
    }),
    null
  );
  assert.equal(
    getAffarioPriceAlertOpportunity({
      recommendation: "WAIT",
      currentPrice: 1_300,
      savingsPotential: insufficientSavings,
    }),
    null
  );
});

test("normalizza un'email valida e rifiuta email non valide", () => {
  assert.equal(
    normalizePriceAlertEmail("  Utente@Example.IT "),
    "utente@example.it"
  );
  assert.equal(normalizePriceAlertEmail("utente@"), null);
  assert.equal(normalizePriceAlertEmail("utente example.it"), null);
  assert.equal(normalizePriceAlertEmail(null), null);
  assert.equal(
    normalizePriceAlertEmail(
      `${"a".repeat(PRICE_ALERT_MAX_EMAIL_LENGTH)}@example.it`
    ),
    null
  );
});

test("preserva l'exact ASIN e non invia alcun target modificabile", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const requester: PriceAlertRequester = async (_input, init) => {
    requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return successfulResponse();
  };

  const result = await requestAffarioPriceAlertOnce(
    "B0ABCDEFGH",
    "utente@example.it",
    { inFlight: false },
    requester
  );

  assert.deepEqual(requestBody, {
    asin: "B0ABCDEFGH",
    email: "utente@example.it",
  });
  assert.equal(Object.hasOwn(requestBody!, "targetPrice"), false);
  assert.equal(result?.confirmationEmailSent, true);
});

test("il server usa il target affidabile della pipeline per l'exact ASIN", () => {
  const trustedAlert = resolveTrustedAffarioPriceAlert({
    exactAsin: "B0ABCDEFGH",
    productTitle: "Variante esatta",
    recommendation: "WAIT",
    currentPrice: 1_300,
    savingsPotential: availableSavings,
  });

  assert.deepEqual(trustedAlert, {
    exactAsin: "B0ABCDEFGH",
    productTitle: "Variante esatta",
    currentPrice: 1_300,
    targetPrice: 1_150,
  });
  assert.ok(trustedAlert);
  assert.deepEqual(
    buildPendingPriceAlertInsert(
      trustedAlert,
      "utente@example.it",
      "a".repeat(64),
      "2026-08-27T12:00:00.000Z"
    ),
    {
      product_id: "B0ABCDEFGH",
      product_title: "Variante esatta",
      email: "utente@example.it",
      target_price: 1_150,
      current_price: 1_300,
      status: "pending_confirmation",
      manage_token_hash: "a".repeat(64),
      confirmation_requested_at: "2026-08-27T12:00:00.000Z",
    }
  );
  assert.equal(isActivePriceAlertStatus("pending_confirmation"), false);
  assert.equal(isActivePriceAlertStatus("active"), true);
  assert.equal(isActivePriceAlertStatus("target_notified"), false);
});

test("il client riconosce lo stato finale target_notified", async () => {
  const result = await requestAffarioPriceAlertOnce(
    "B0ABCDEFGH",
    "utente@example.it",
    { inFlight: false },
    async () =>
      successfulResponse({
        alreadyExists: true,
        confirmationEmailSent: false,
        alertStatus: "target_notified",
      })
  );

  assert.equal(result?.alreadyExists, true);
  assert.equal(result?.alertStatus, "target_notified");
});

test("il submit è single-flight e riapre il gate al termine", async () => {
  const deferred: {
    resolve?: (value: ReturnType<typeof successfulResponse>) => void;
  } = {};
  let calls = 0;
  const requester: PriceAlertRequester = async () => {
    calls += 1;
    return new Promise((resolve) => {
      deferred.resolve = resolve;
    });
  };
  const gate = { inFlight: false };
  const first = requestAffarioPriceAlertOnce(
    "B0ABCDEFGH",
    "utente@example.it",
    gate,
    requester
  );
  const duplicateClick = requestAffarioPriceAlertOnce(
    "B0ABCDEFGH",
    "utente@example.it",
    gate,
    requester
  );

  assert.notEqual(first, null);
  assert.equal(duplicateClick, null);
  assert.equal(calls, 1);
  assert.equal(gate.inFlight, true);

  assert.ok(deferred.resolve);
  deferred.resolve(successfulResponse());
  await first;

  assert.equal(gate.inFlight, false);
});

test("propaga un errore API consumer-safe", async () => {
  const requester: PriceAlertRequester = async () => ({
    ok: false,
    async json() {
      return {
        error: {
          code: "SAVE_FAILED",
          message: "Non è stato possibile creare l'alert. Riprova.",
        },
      };
    },
  });

  await assert.rejects(
    requestAffarioPriceAlertOnce(
      "B0ABCDEFGH",
      "utente@example.it",
      { inFlight: false },
      requester
    )!,
    (error) =>
      error instanceof PriceAlertRequestError &&
      error.message === "Non è stato possibile creare l'alert. Riprova."
  );
});

test("distingue successo con conferma email e alert duplicato", async () => {
  const created = await requestAffarioPriceAlertOnce(
    "B0ABCDEFGH",
    "utente@example.it",
    { inFlight: false },
    async () => successfulResponse()
  );
  const duplicate = await requestAffarioPriceAlertOnce(
    "B0ABCDEFGH",
    "utente@example.it",
    { inFlight: false },
    async () =>
      successfulResponse({
        alreadyExists: true,
        confirmationEmailSent: false,
      })
  );

  assert.deepEqual(created, {
    alreadyExists: false,
    confirmationEmailSent: true,
    alertStatus: "pending_confirmation",
  });
  assert.deepEqual(duplicate, {
    alreadyExists: true,
    confirmationEmailSent: false,
    alertStatus: "pending_confirmation",
  });
});
