import assert from "node:assert/strict";
import test from "node:test";

import {
  JsonRequestBodyError,
  readJsonRequestBody,
} from "./jsonRequestBody";

function postRequest(body: BodyInit, headers?: HeadersInit): Request {
  return new Request("https://example.test/api", {
    method: "POST",
    headers,
    body,
  });
}

test("legge un body JSON entro il limite", async () => {
  const body = await readJsonRequestBody(
    postRequest(JSON.stringify({ token: "abc" })),
    64
  );

  assert.deepEqual(body, { token: "abc" });
});

test("rifiuta JSON non valido", async () => {
  await assert.rejects(
    readJsonRequestBody(postRequest("{"), 64),
    (error: unknown) =>
      error instanceof JsonRequestBodyError &&
      error.code === "INVALID_JSON"
  );
});

test("rifiuta subito un Content-Length oltre il limite", async () => {
  await assert.rejects(
    readJsonRequestBody(
      postRequest("{}", { "Content-Length": "65" }),
      64
    ),
    (error: unknown) =>
      error instanceof JsonRequestBodyError &&
      error.code === "PAYLOAD_TOO_LARGE"
  );
});

test("rifiuta anche un body reale oltre il limite senza fidarsi dell'header", async () => {
  await assert.rejects(
    readJsonRequestBody(
      postRequest(JSON.stringify({ value: "x".repeat(128) })),
      64
    ),
    (error: unknown) =>
      error instanceof JsonRequestBodyError &&
      error.code === "PAYLOAD_TOO_LARGE"
  );
});
