import assert from "node:assert/strict";
import test from "node:test";

import { buildAmazonAffiliateProductUrl } from "./amazonAffiliateLink";

test("costruisce il link affiliato Amazon con l'ASIN esatto", () => {
  assert.equal(
    buildAmazonAffiliateProductUrl("b0fqgpjcjk"),
    "https://www.amazon.it/dp/B0FQGPJCJK?tag=affario-21"
  );
  assert.equal(
    buildAmazonAffiliateProductUrl("B0GKP9H2W1"),
    "https://www.amazon.it/dp/B0GKP9H2W1?tag=affario-21"
  );
});

test("non costruisce link per identificativi non validi", () => {
  assert.equal(buildAmazonAffiliateProductUrl("ASIN-NON-VALIDO"), null);
  assert.equal(buildAmazonAffiliateProductUrl(""), null);
});
