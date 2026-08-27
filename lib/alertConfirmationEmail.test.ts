import assert from "node:assert/strict";
import test from "node:test";

import { buildAlertConfirmationEmailMessage } from "./alertConfirmationEmail";

test("l'email chiede la conferma e contiene il link senza dichiarare l'alert attivo", () => {
  const confirmationUrl =
    "https://affario.it/alert/abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
  const message = buildAlertConfirmationEmailMessage({
    productName: "Variante <esatta>",
    currentPrice: 1_300,
    targetPrice: 1_150,
    confirmationUrl,
  });

  assert.match(message.subject, /^Conferma il tuo alert AFFARIO/);
  assert.match(message.htmlContent, /Conferma il tuo alert AFFARIO/);
  assert.match(message.htmlContent, />Conferma alert<\/a>/);
  assert.match(message.htmlContent, /Il tuo alert non è ancora attivo/);
  assert.match(message.htmlContent, /Variante &lt;esatta&gt;/);
  assert.ok(message.htmlContent.includes(confirmationUrl));
  assert.match(message.textContent, /Conferma alert: https:\/\/affario\.it\/alert\//);
  assert.doesNotMatch(message.htmlContent, /alert (?:è|già) attivo/i);
  assert.doesNotMatch(message.textContent, /alert (?:è|già) attivo/i);
});
