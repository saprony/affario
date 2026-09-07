import assert from "node:assert/strict";
import test from "node:test";

import { buildAlertConfirmationEmailMessage } from "./alertConfirmationEmail";
import {
  formatUserFacingProductTitle,
  USER_FACING_PRODUCT_TITLE_FALLBACK,
  USER_FACING_PRODUCT_TITLE_MAX_LENGTH,
} from "./userFacingProductTitle";

const longProductName =
  "realme GT 8 Pro Smartphone 5G 16+512GB Snapdragon Elite processore veloce";

test("il titolo user-facing normalizza whitespace e lascia invariato un titolo corto", () => {
  assert.equal(
    formatUserFacingProductTitle("  realme\tGT 8\nPro  "),
    "realme GT 8 Pro"
  );
  assert.equal(formatUserFacingProductTitle("Titolo corto"), "Titolo corto");
  assert.doesNotMatch(formatUserFacingProductTitle("Titolo corto"), /…$/u);
});

test("il titolo user-facing tronca su una parola intera e usa l'ellissi solo se serve", () => {
  const productName = formatUserFacingProductTitle(longProductName);

  assert.equal(
    productName,
    "realme GT 8 Pro Smartphone 5G 16+512GB Snapdragon Elite…"
  );
  assert.ok(productName.length <= USER_FACING_PRODUCT_TITLE_MAX_LENGTH);
  assert.doesNotMatch(productName, /process…$/u);
  assert.match(productName, /…$/u);
});

test("il titolo user-facing gestisce valori nulli, vuoti o senza separatori", () => {
  assert.equal(
    formatUserFacingProductTitle(null),
    USER_FACING_PRODUCT_TITLE_FALLBACK
  );
  assert.equal(
    formatUserFacingProductTitle(" \n\t "),
    USER_FACING_PRODUCT_TITLE_FALLBACK
  );
  assert.equal(
    formatUserFacingProductTitle("x".repeat(100)),
    `${USER_FACING_PRODUCT_TITLE_FALLBACK}…`
  );
});

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

test("l'email di conferma abbrevia lo stesso titolo in subject, HTML e testo", () => {
  const productName = formatUserFacingProductTitle(longProductName);
  const message = buildAlertConfirmationEmailMessage({
    productName: longProductName,
    currentPrice: 859.99,
    targetPrice: 830,
    confirmationUrl: "https://affario.it/alert/token",
  });

  assert.equal(
    message.subject,
    `Conferma il tuo alert AFFARIO — ${productName}`
  );
  assert.ok(
    message.subject.length <= 32 + USER_FACING_PRODUCT_TITLE_MAX_LENGTH
  );
  assert.ok(message.htmlContent.includes(productName));
  assert.ok(message.textContent.includes(`Prodotto: ${productName}`));
  assert.doesNotMatch(message.htmlContent, /processore veloce/u);
  assert.doesNotMatch(message.textContent, /processore veloce/u);
});
