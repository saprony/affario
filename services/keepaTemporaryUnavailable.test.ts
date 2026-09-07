import assert from "node:assert/strict";
import test from "node:test";

import { KeepaClientError } from "./keepaClient";
import {
  getKeepaRetryAfterSeconds,
  TEMPORARY_PRODUCT_DATA_MESSAGE,
} from "./keepaTemporaryUnavailable";
import { SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE } from "../lib/consumerServiceMessages";

test("il messaggio 503 consumer è coerente e non espone provider o token", () => {
  assert.equal(
    TEMPORARY_PRODUCT_DATA_MESSAGE,
    SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE
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
