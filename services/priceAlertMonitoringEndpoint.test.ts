import assert from "node:assert/strict";
import test from "node:test";

import {
  createPriceAlertMonitoringEndpoint,
  DEFAULT_ALERT_MONITORING_MAX_ASINS_PER_RUN,
  MIN_ALERT_MONITORING_CRON_SECRET_BYTES,
} from "./priceAlertMonitoringEndpoint";
import type {
  PriceAlertCheckOptions,
  PriceAlertCheckReport,
} from "./priceAlertMonitoringEngine";

const CRON_SECRET = "a-secure-dedicated-monitoring-secret-for-tests";

function createReport(
  overrides: Partial<PriceAlertCheckReport> = {}
): PriceAlertCheckReport {
  return {
    activeAlerts: 3,
    eligibleAlerts: 3,
    excludedAlerts: 0,
    invalidAlerts: 0,
    uniqueAsins: 2,
    dueAsins: 1,
    deferredAsins: 0,
    backgroundDeferredForRunLimit: 0,
    productLookups: 1,
    cacheHits: 0,
    refreshedProducts: 1,
    targetsReached: 1,
    outcomesRecorded: 1,
    outcomeFailures: 0,
    notificationsSent: 1,
    notificationFailures: 0,
    ambiguousNotifications: 0,
    claimConflicts: 0,
    claimFailures: 0,
    claimReleaseFailures: 0,
    finalizationFailures: 0,
    staleClaims: 0,
    staleClaimsRecovered: 0,
    staleClaimsRetried: 0,
    staleClaimsUnknown: 0,
    invalidStaleClaims: 0,
    skippedNotDue: 1,
    schedulingFailures: 0,
    lookupFailures: 0,
    unavailablePrices: 0,
    tokenBudgetStatus: "OK",
    backgroundSkippedForReserve: 0,
    keepaRateLimited: 0,
    ...overrides,
  };
}

function createRequest(secret: string | null = CRON_SECRET): Request {
  return new Request(
    "https://example.test/api/internal/price-alert-monitoring",
    {
      method: "POST",
      headers: secret
        ? { Authorization: `Bearer ${secret}` }
        : undefined,
    }
  );
}

function assertNoCache(response: Response): void {
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
}

function createHarness(input?: {
  cronSecret?: string;
  enabled?: string;
  maxAsinsPerRun?: string;
  runMonitoring?: (
    options?: PriceAlertCheckOptions
  ) => Promise<PriceAlertCheckReport>;
}) {
  let calls = 0;
  const receivedOptions: Array<PriceAlertCheckOptions | undefined> = [];
  const endpoint = createPriceAlertMonitoringEndpoint({
    async runMonitoring(options) {
      calls += 1;
      receivedOptions.push(options);
      return input?.runMonitoring
        ? input.runMonitoring(options)
        : createReport();
    },
    getEnvironment: () => ({
      cronSecret: input?.cronSecret ?? CRON_SECRET,
      enabled: input?.enabled,
      maxAsinsPerRun: input?.maxAsinsPerRun,
    }),
  });

  return {
    endpoint,
    get calls() {
      return calls;
    },
    receivedOptions,
  };
}

test("GET non esegue il motore e risponde 405 senza cache", async () => {
  const harness = createHarness({ enabled: "true" });
  const response = await harness.endpoint.GET();

  assert.equal(response.status, 405);
  assert.equal(harness.calls, 0);
  assertNoCache(response);
});

test("POST senza secret risponde 401 e non esegue il motore", async () => {
  const harness = createHarness({ enabled: "true" });
  const response = await harness.endpoint.POST(createRequest(null));

  assert.equal(response.status, 401);
  assert.equal(harness.calls, 0);
  assertNoCache(response);
});

test("POST con secret errato risponde 401", async () => {
  const harness = createHarness({ enabled: "true" });
  const response = await harness.endpoint.POST(
    createRequest("secret-errato")
  );

  assert.equal(response.status, 401);
  assert.equal(harness.calls, 0);
});

test("secret server assente rende l'endpoint non eseguibile", async () => {
  const harness = createHarness({ cronSecret: "", enabled: "true" });
  const response = await harness.endpoint.POST(createRequest());

  assert.equal(response.status, 401);
  assert.equal(harness.calls, 0);
});

test("secret server troppo corto rende l'endpoint non eseguibile", async () => {
  const weakSecret = "x".repeat(
    MIN_ALERT_MONITORING_CRON_SECRET_BYTES - 1
  );
  const harness = createHarness({
    cronSecret: weakSecret,
    enabled: "true",
  });
  const response = await harness.endpoint.POST(createRequest(weakSecret));

  assert.equal(response.status, 401);
  assert.equal(harness.calls, 0);
  assertNoCache(response);
});

test("secret corretto e kill switch non true non leggono servizi", async () => {
  for (const enabled of [undefined, "false", "TRUE"]) {
    const harness = createHarness({ enabled });
    const response = await harness.endpoint.POST(createRequest());

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "disabled" });
    assert.equal(harness.calls, 0);
    assertNoCache(response);
  }
});

test("secret corretto e enabled true eseguono una volta con limite prudente", async () => {
  const harness = createHarness({ enabled: "true" });
  const response = await harness.endpoint.POST(createRequest());

  assert.equal(response.status, 200);
  assert.equal(harness.calls, 1);
  assert.deepEqual(harness.receivedOptions, [
    { maxAsins: DEFAULT_ALERT_MONITORING_MAX_ASINS_PER_RUN },
  ]);
});

test("due POST autorizzati restano due run indipendenti", async () => {
  const harness = createHarness({ enabled: "true" });

  const responses = await Promise.all([
    harness.endpoint.POST(createRequest()),
    harness.endpoint.POST(createRequest()),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200]
  );
  assert.equal(harness.calls, 2);
});

test("report restituisce soltanto metriche aggregate consentite", async () => {
  const reportWithPrivateFields = Object.assign(createReport(), {
    email: "utente@example.test",
    exactAsin: "B0FQGPJCJK",
    targetPrice: 100,
    token: "private-token",
  });
  const harness = createHarness({
    enabled: "true",
    maxAsinsPerRun: "2",
    runMonitoring: async () => reportWithPrivateFields,
  });
  const response = await harness.endpoint.POST(createRequest());
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.deepEqual(harness.receivedOptions, [{ maxAsins: 2 }]);
  assert.deepEqual(body, {
    status: "completed",
    report: {
      activeAlerts: 3,
      uniqueAsins: 2,
      dueAsins: 1,
      productLookups: 1,
      cacheHits: 0,
      refreshedProducts: 1,
      targetsReached: 1,
      notificationsSent: 1,
      notificationFailures: 0,
      backgroundDeferredForRunLimit: 0,
      tokenBudgetStatus: "OK",
      backgroundSkippedForReserve: 0,
      keepaRateLimited: 0,
    },
  });
  assert.doesNotMatch(
    serialized,
    /utente|B0FQGPJCJK|targetPrice|private-token/
  );
  assertNoCache(response);
});

test("exception del motore non espone dettagli sensibili", async () => {
  const harness = createHarness({
    enabled: "true",
    runMonitoring: async () => {
      throw new Error(
        "Provider failed for utente@example.test with secret private-token"
      );
    },
  });
  const response = await harness.endpoint.POST(createRequest());
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: {
      code: "INTERNAL_ERROR",
      message: "Monitoring run failed.",
    },
  });
  assert.doesNotMatch(serialized, /utente|secret|provider|private-token/i);
  assertNoCache(response);
});

test("configurazione max ASIN non valida fallisce senza eseguire", async () => {
  const harness = createHarness({
    enabled: "true",
    maxAsinsPerRun: "0",
  });
  const response = await harness.endpoint.POST(createRequest());

  assert.equal(response.status, 503);
  assert.equal(harness.calls, 0);
  assertNoCache(response);
});
