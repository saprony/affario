import assert from "node:assert/strict";
import test from "node:test";

import {
  BREVO_HTTP_TIMEOUT_MS,
  createBrevoTargetEmailGateway,
  getTargetEmailProviderIdentity,
  type TargetPriceAlertEmail,
} from "./brevoTransactionalEmail";

const TARGET_EMAIL: TargetPriceAlertEmail = {
  alertId: 42,
  recipientEmail: "utente@example.test",
  productName: "Variante esatta",
  currentPrice: 95,
  targetPrice: 100,
  amazonUrl: "https://www.amazon.it/dp/B0FQGPJCJK?tag=affario-21",
};

test("stesso alert target produce UUID e tag stabili senza PII", () => {
  const first = getTargetEmailProviderIdentity(42);
  const retry = getTargetEmailProviderIdentity(42);
  const otherAlert = getTargetEmailProviderIdentity(43);

  assert.deepEqual(first, retry);
  assert.notDeepEqual(first, otherAlert);
  assert.match(
    first.idempotencyKey,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  assert.doesNotMatch(first.eventTag, /@|B0FQGPJCJK|utente/i);
});

test("retry usa la stessa Idempotency-Key Brevo e alert diversi chiavi diverse", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const signals: AbortSignal[] = [];
  const requester = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    assert.ok(init?.signal instanceof AbortSignal);
    signals.push(init.signal);
    return Response.json({ messageId: "provider-message" }, { status: 201 });
  }) as typeof fetch;
  const gateway = createBrevoTargetEmailGateway({
    requester,
    getApiKey: () => "test-api-key",
  });

  await gateway.sendTargetEmail(TARGET_EMAIL);
  await gateway.sendTargetEmail(TARGET_EMAIL);
  await gateway.sendTargetEmail({ ...TARGET_EMAIL, alertId: 43 });

  const firstHeaders = bodies[0]?.headers as Record<string, string>;
  const retryHeaders = bodies[1]?.headers as Record<string, string>;
  const otherHeaders = bodies[2]?.headers as Record<string, string>;
  const firstTags = bodies[0]?.tags as string[];

  assert.equal(
    firstHeaders["Idempotency-Key"],
    retryHeaders["Idempotency-Key"]
  );
  assert.notEqual(
    firstHeaders["Idempotency-Key"],
    otherHeaders["Idempotency-Key"]
  );
  assert.deepEqual(firstTags, [getTargetEmailProviderIdentity(42).eventTag]);
  assert.equal(signals.length, 3);
  assert.equal(BREVO_HTTP_TIMEOUT_MS, 10_000);
});

test("Brevo distingue accepted, rejected e stato ambiguo", async () => {
  const responses = [
    Response.json({ messageId: "provider-message" }, { status: 201 }),
    Response.json({ code: "invalid_parameter" }, { status: 400 }),
    Response.json({ message: "temporary" }, { status: 503 }),
    Response.json({ code: "duplicate_parameter" }, { status: 400 }),
  ];
  const requester = (async () =>
    responses.shift() ??
    Response.json({ message: "missing fixture" }, { status: 500 })) as typeof fetch;
  const gateway = createBrevoTargetEmailGateway({
    requester,
    getApiKey: () => "test-api-key",
  });

  assert.deepEqual(await gateway.sendTargetEmail(TARGET_EMAIL), {
    status: "accepted",
  });
  assert.deepEqual(await gateway.sendTargetEmail(TARGET_EMAIL), {
    status: "rejected",
    reason: "provider",
  });
  assert.deepEqual(await gateway.sendTargetEmail(TARGET_EMAIL), {
    status: "unknown",
    reason: "provider",
  });
  assert.deepEqual(await gateway.sendTargetEmail(TARGET_EMAIL), {
    status: "accepted",
  });
});

test("un timeout Brevo resta ambiguo e distinto da un errore HTTP", async () => {
  const requester = (async (_input, init) => {
    const signal = init?.signal;
    assert.ok(signal instanceof AbortSignal);

    return await new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  }) as typeof fetch;
  const gateway = createBrevoTargetEmailGateway({
    requester,
    getApiKey: () => "test-api-key",
    timeoutMilliseconds: 5,
  });
  const keepEventLoopAlive = setTimeout(() => undefined, 100);

  try {
    assert.deepEqual(await gateway.sendTargetEmail(TARGET_EMAIL), {
      status: "unknown",
      reason: "timeout",
    });
  } finally {
    clearTimeout(keepEventLoopAlive);
  }
});

test("recovery interroga gli eventi soltanto tramite tag stabile", async () => {
  const requestedUrls: URL[] = [];
  const signals: AbortSignal[] = [];
  const identity = getTargetEmailProviderIdentity(42);
  const requester = (async (input, init) => {
    requestedUrls.push(new URL(String(input)));
    assert.ok(init?.signal instanceof AbortSignal);
    signals.push(init.signal);
    return Response.json({
      events: [{ event: "request", tag: identity.eventTag }],
    });
  }) as typeof fetch;
  const gateway = createBrevoTargetEmailGateway({
    requester,
    getApiKey: () => "test-api-key",
    clock: () => new Date("2026-08-28T12:00:00.000Z"),
  });

  const status = await gateway.getTargetEmailEventStatus(
    42,
    "2026-08-28T10:00:00.000Z"
  );
  const requestedUrl = requestedUrls[0];

  assert.equal(status, "accepted");
  assert.equal(requestedUrl?.pathname, "/v3/smtp/statistics/events");
  assert.equal(
    requestedUrl?.searchParams.get("tags"),
    JSON.stringify([identity.eventTag])
  );
  assert.equal(requestedUrl?.searchParams.has("email"), false);
  assert.equal(signals.length, 1);
});

test("recovery senza eventi permette retry, risposta incerta lo blocca", async () => {
  const responses = [
    Response.json({ events: [] }),
    Response.json({ message: "temporary" }, { status: 503 }),
  ];
  const requester = (async () =>
    responses.shift() ?? Response.json({ events: [] })) as typeof fetch;
  const gateway = createBrevoTargetEmailGateway({
    requester,
    getApiKey: () => "test-api-key",
    clock: () => new Date("2026-08-28T12:00:00.000Z"),
  });

  assert.equal(
    await gateway.getTargetEmailEventStatus(
      42,
      "2026-08-28T10:00:00.000Z"
    ),
    "not-found"
  );
  assert.equal(
    await gateway.getTargetEmailEventStatus(
      42,
      "2026-08-28T10:00:00.000Z"
    ),
    "unknown"
  );
});
