import assert from "node:assert/strict";
import test from "node:test";

import { KeepaClientError } from "./keepaClient";
import {
  getKeepaRetryAfterSeconds,
  TEMPORARY_PRODUCT_DATA_MESSAGE,
} from "./keepaTemporaryUnavailable";

test("il messaggio 429 consumer non espone provider o token", () => {
  assert.equal(
    TEMPORARY_PRODUCT_DATA_MESSAGE,
    "Stiamo aggiornando i dati del prodotto. Riprova tra qualche istante."
  );
  assert.doesNotMatch(TEMPORARY_PRODUCT_DATA_MESSAGE, /keepa|token|piano/i);
});

test("Retry-After deriva solo da un 429 con refill valido", () => {
  assert.equal(
    getKeepaRetryAfterSeconds(
      new KeepaClientError(
        "rate limited",
        "OUT_OF_TOKENS",
        429,
        13,
        "EXHAUSTED"
      )
    ),
    13
  );
  assert.equal(
    getKeepaRetryAfterSeconds(
      new KeepaClientError("network", "NETWORK_ERROR")
    ),
    undefined
  );
});
