import assert from "node:assert/strict";
import test from "node:test";

import type { ManagedPriceAlert } from "../lib/priceAlertManagement";
import { ABUSE_RATE_LIMIT_POLICIES } from "./abuseRateLimit";
import {
  createPriceAlertManagementPageAccess,
  createPriceAlertManagementPageAccessWithDevelopmentPreviews,
} from "./priceAlertManagementPageAccess";

const VALID_TOKEN = Buffer.alloc(32, 9).toString("base64url");
const ALERT: ManagedPriceAlert = {
  product_title: "Variante esatta",
  current_price: 100,
  target_price: 90,
  status: "active",
};

function requestFor(ip = "192.0.2.70"): Request {
  return new Request("https://affario.it/alert", {
    headers: { "x-forwarded-for": ip },
  });
}

test("i token preview sono fixture solo in development", async () => {
  const previewTokens = [
    "preview-alert",
    "preview-rate-limited",
    "preview-unavailable",
  ];
  const request = requestFor();
  const delegatedTokens: unknown[] = [];

  for (const nodeEnvironment of ["production", "test", undefined]) {
    const getAccess =
      createPriceAlertManagementPageAccessWithDevelopmentPreviews({
        getNodeEnvironment: () => nodeEnvironment,
        getProductionAccess: async (delegatedRequest, token) => {
          assert.equal(delegatedRequest, request);
          delegatedTokens.push(token);
          return { status: "not-found" };
        },
      });

    for (const token of previewTokens) {
      assert.deepEqual(await getAccess(request, token), {
        status: "not-found",
      });
    }
  }

  assert.deepEqual(delegatedTokens, [
    ...previewTokens,
    ...previewTokens,
    ...previewTokens,
  ]);

  let developmentDelegations = 0;
  const getDevelopmentAccess =
    createPriceAlertManagementPageAccessWithDevelopmentPreviews({
      getNodeEnvironment: () => "development",
      getProductionAccess: async () => {
        developmentDelegations += 1;
        return { status: "not-found" };
      },
    });

  assert.equal(
    (await getDevelopmentAccess(request, "preview-alert")).status,
    "found"
  );
  assert.deepEqual(
    await getDevelopmentAccess(request, "preview-rate-limited"),
    { status: "rate-limited" }
  );
  assert.deepEqual(
    await getDevelopmentAccess(request, "preview-unavailable"),
    { status: "unavailable" }
  );
  assert.equal(developmentDelegations, 0);
});

test("un token sintatticamente invalido non consuma quota ne legge lo store", async () => {
  let executorCalls = 0;
  let readCalls = 0;
  const getAccess = createPriceAlertManagementPageAccess({
    isValidToken: (token): token is string => token === VALID_TOKEN,
    executeRateLimited: async () => {
      executorCalls += 1;
      return { status: "unavailable" };
    },
    readAlert: async () => {
      readCalls += 1;
      return ALERT;
    },
  });

  assert.deepEqual(await getAccess(requestFor(), "token-invalido"), {
    status: "not-found",
  });
  assert.equal(executorCalls, 0);
  assert.equal(readCalls, 0);
});

test("il GET valido usa una sola esecuzione con quote client e token", async () => {
  let executorCalls = 0;
  let readCalls = 0;
  const getAccess = createPriceAlertManagementPageAccess({
    isValidToken: (token): token is string => token === VALID_TOKEN,
    executeRateLimited: async (_request, rules, operation) => {
      executorCalls += 1;
      assert.equal(rules.length, 2);
      assert.deepEqual(rules[0], {
        policy: ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_CLIENT,
        subject: { domain: "client" },
      });
      assert.deepEqual(rules[1], {
        policy: ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_TOKEN,
        subject: { domain: "token", value: VALID_TOKEN },
      });
      return { status: "completed", value: await operation() };
    },
    readAlert: async () => {
      readCalls += 1;
      return ALERT;
    },
  });

  assert.deepEqual(await getAccess(requestFor(), VALID_TOKEN), {
    status: "found",
    alert: ALERT,
  });
  assert.equal(executorCalls, 1);
  assert.equal(readCalls, 1);
});

test("rate limit e infrastruttura indisponibile fermano la lettura alert", async () => {
  for (const blockedStatus of ["rate-limited", "unavailable"] as const) {
    let readCalls = 0;
    const getAccess = createPriceAlertManagementPageAccess({
      isValidToken: (token): token is string => token === VALID_TOKEN,
      executeRateLimited: async () =>
        blockedStatus === "rate-limited"
          ? { status: "rate-limited", retryAfterSeconds: 60 }
          : { status: "unavailable" },
      readAlert: async () => {
        readCalls += 1;
        return ALERT;
      },
    });

    assert.deepEqual(await getAccess(requestFor(), VALID_TOKEN), {
      status: blockedStatus,
    });
    assert.equal(readCalls, 0);
  }
});

test("una failure della lettura e consumer-safe e non diventa not-found", async () => {
  const getAccess = createPriceAlertManagementPageAccess({
    isValidToken: (token): token is string => token === VALID_TOKEN,
    executeRateLimited: async (_request, _rules, operation) => ({
      status: "completed",
      value: await operation(),
    }),
    readAlert: async () => {
      throw new Error("database fixture failure");
    },
  });

  assert.deepEqual(await getAccess(requestFor(), VALID_TOKEN), {
    status: "unavailable",
  });
});
