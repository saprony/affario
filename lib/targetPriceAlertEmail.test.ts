import assert from "node:assert/strict";
import test from "node:test";

import { buildTargetPriceAlertEmailMessage } from "./targetPriceAlertEmail";

const amazonUrl =
  "https://www.amazon.it/dp/B0FQGPJCJK?tag=affario-21";

test("email target distinta con prodotto, prezzi, CTA exact ASIN e nota", () => {
  const message = buildTargetPriceAlertEmailMessage({
    productName: "Variante <esatta>",
    currentPrice: 95,
    targetPrice: 100,
    amazonUrl,
  });

  assert.match(message.subject, /^Il prezzo che aspettavi è arrivato/);
  assert.match(message.htmlContent, /Variante &lt;esatta&gt;/);
  assert.match(message.htmlContent, /Prezzo attuale rilevato/);
  assert.match(message.htmlContent, /Prezzo Obiettivo AFFARIO/);
  assert.match(message.htmlContent, /Differenza sotto il target/);
  assert.ok(message.htmlContent.includes(amazonUrl.replaceAll("&", "&amp;")));
  assert.match(message.textContent, /I prezzi possono cambiare rapidamente/);
  assert.doesNotMatch(message.textContent, /disponibil/i);
  assert.doesNotMatch(message.textContent, /conferma/i);
});

test("non mostra una differenza quando il prezzo coincide con il target", () => {
  const message = buildTargetPriceAlertEmailMessage({
    productName: "Variante esatta",
    currentPrice: 100,
    targetPrice: 100,
    amazonUrl,
  });

  assert.doesNotMatch(message.htmlContent, /Differenza sotto il target/);
  assert.doesNotMatch(message.textContent, /Differenza sotto il target/);
});
