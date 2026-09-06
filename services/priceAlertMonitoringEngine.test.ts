import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  createPriceAlertCheckRunner,
  MAX_ALERT_MONITORING_ASINS_PER_RUN,
  PriceAlertMonitoringLookupControlError,
  TARGET_NOTIFICATION_CLAIM_LEASE_MS,
  type PriceAlertMonitoringDependencies,
  type PriceAlertMonitoringRecord,
  type PriceAlertProductCheck,
  type TargetEmailProviderEventStatus,
  type TargetEmailSendResult,
  type TargetPriceAlertDelivery,
} from "./priceAlertMonitoringEngine";
import { loadLatestPriceAlertProductChecks } from "./priceAlertMonitoringStore";

const STARTED_AT = new Date("2026-08-28T12:00:00.000Z");
const PRIMARY_ASIN = "B0FQGPJCJK";
const SECONDARY_ASIN = "B000000001";
const PRICE_ALERT_LATEST_CHECKS_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260906010000_create_price_alert_latest_checks_rpc.sql"
);
const PRICE_ALERT_MONITORING_STORE_PATH = resolve(
  process.cwd(),
  "services/priceAlertMonitoringStore.ts"
);

function createAlert(
  overrides: Partial<PriceAlertMonitoringRecord> = {}
): PriceAlertMonitoringRecord {
  return {
    id: 1,
    productId: PRIMARY_ASIN,
    productTitle: "Variante esatta",
    email: "utente@example.test",
    initialPrice: 120,
    targetPrice: 100,
    status: "active",
    notifiedAt: null,
    targetNotificationClaimedAt: null,
    targetReachedAt: null,
    targetReachedPrice: null,
    ...overrides,
  };
}

type FakeHarnessOptions = {
  alerts?: PriceAlertMonitoringRecord[];
  latestChecks?: ReadonlyMap<string, PriceAlertProductCheck | null>;
  lookupPrices?: ReadonlyMap<string, number | null>;
  cacheHits?: ReadonlySet<string>;
  lookupErrors?: ReadonlyMap<string, unknown>;
  tokenBudgetStatuses?: ReadonlyMap<
    string,
    "OK" | "RESERVE" | "EXHAUSTED" | "UNKNOWN"
  >;
  latestChecksError?: unknown;
};

function createFakeHarness({
  alerts = [createAlert()],
  latestChecks = new Map([
    [
      PRIMARY_ASIN,
      {
        requestedAt: "2026-08-28T05:00:00.000Z",
        currentPrice: 105,
      },
    ],
  ]),
  lookupPrices = new Map([[PRIMARY_ASIN, 99]]),
  cacheHits = new Set(),
  lookupErrors = new Map(),
  tokenBudgetStatuses = new Map(),
  latestChecksError,
}: FakeHarnessOptions = {}) {
  const records = alerts.map((alert) => ({ ...alert }));
  const lookupCalls: string[] = [];
  const schedulingBatchCalls: string[][] = [];
  const sendCalls: TargetPriceAlertDelivery[] = [];
  const completedIds: number[] = [];
  const releasedIds: number[] = [];
  const providerChecks: number[] = [];
  let currentTime = new Date(STARTED_AT);
  let sendResult: TargetEmailSendResult = { status: "accepted" };
  let providerEventStatus: TargetEmailProviderEventStatus = "unknown";
  let failFinalization = false;

  const dependencies: PriceAlertMonitoringDependencies = {
    async loadAlerts() {
      return records;
    },
    async loadStaleClaims(staleBefore) {
      const staleBeforeMilliseconds = Date.parse(staleBefore);

      return records.filter(
        (alert) =>
          alert.status === "notifying_target" &&
          alert.notifiedAt === null &&
          alert.targetNotificationClaimedAt !== null &&
          Date.parse(alert.targetNotificationClaimedAt) <=
            staleBeforeMilliseconds
      );
    },
    async getLatestProductChecks(exactAsins) {
      schedulingBatchCalls.push([...exactAsins]);

      if (latestChecksError !== undefined) {
        throw latestChecksError;
      }

      const result = new Map<string, PriceAlertProductCheck>();

      for (const exactAsin of exactAsins) {
        const latestCheck = latestChecks.get(exactAsin);

        if (latestCheck) {
          result.set(exactAsin, latestCheck);
        }
      }

      return result;
    },
    async lookupProduct(exactAsin) {
      lookupCalls.push(exactAsin);

      if (lookupErrors.has(exactAsin)) {
        throw lookupErrors.get(exactAsin);
      }

      return {
        exactAsin,
        currentPrice: lookupPrices.get(exactAsin) ?? null,
        cacheHit: cacheHits.has(exactAsin),
        tokenBudgetStatus: tokenBudgetStatuses.get(exactAsin) ?? "OK",
      };
    },
    async recordTargetOutcome(alertId, reachedPrice, reachedAt) {
      const record = records.find((alert) => alert.id === alertId);

      if (
        !record ||
        record.status !== "active" ||
        record.notifiedAt !== null
      ) {
        return null;
      }

      if (
        record.targetReachedAt !== null &&
        record.targetReachedPrice !== null
      ) {
        return {
          status: "existing",
          reachedAt: record.targetReachedAt,
          reachedPrice: record.targetReachedPrice,
        };
      }

      record.targetReachedAt = reachedAt.toISOString();
      record.targetReachedPrice = reachedPrice;

      return {
        status: "recorded",
        reachedAt: record.targetReachedAt,
        reachedPrice: record.targetReachedPrice,
      };
    },
    async claimTarget(alertId, claimedAt) {
      const record = records.find((alert) => alert.id === alertId);

      if (
        !record ||
        record.status !== "active" ||
        record.notifiedAt !== null ||
        record.targetNotificationClaimedAt !== null ||
        record.targetReachedAt === null ||
        record.targetReachedPrice === null
      ) {
        return false;
      }

      record.status = "notifying_target";
      record.targetNotificationClaimedAt = claimedAt.toISOString();
      return true;
    },
    async completeTarget(alertId, notifiedAt) {
      const record = records.find((alert) => alert.id === alertId);

      if (
        failFinalization ||
        !record ||
        record.status !== "notifying_target" ||
        record.notifiedAt !== null ||
        record.targetNotificationClaimedAt === null
      ) {
        return false;
      }

      record.status = "target_notified";
      record.notifiedAt = notifiedAt.toISOString();
      record.targetNotificationClaimedAt = null;
      completedIds.push(alertId);
      return true;
    },
    async releaseTarget(alertId) {
      const record = records.find((alert) => alert.id === alertId);

      if (
        !record ||
        record.status !== "notifying_target" ||
        record.notifiedAt !== null
      ) {
        return false;
      }

      record.status = "active";
      record.targetNotificationClaimedAt = null;
      releasedIds.push(alertId);
      return true;
    },
    async sendTargetEmail(delivery) {
      await Promise.resolve();
      sendCalls.push(delivery);
      return sendResult;
    },
    async getTargetEmailEventStatus(alertId) {
      providerChecks.push(alertId);
      return providerEventStatus;
    },
    clock: () => new Date(currentTime),
  };

  return {
    completedIds,
    lookupCalls,
    providerChecks,
    records,
    releasedIds,
    run: createPriceAlertCheckRunner(dependencies),
    schedulingBatchCalls,
    sendCalls,
    setClock(value: Date) {
      currentTime = new Date(value);
    },
    setFinalizationFailure(value: boolean) {
      failFinalization = value;
    },
    setProviderEventStatus(value: TargetEmailProviderEventStatus) {
      providerEventStatus = value;
    },
    setSendResult(value: TargetEmailSendResult) {
      sendResult = value;
    },
  };
}

test("zero candidati non eseguono query scheduling o lookup prodotto", async () => {
  const harness = createFakeHarness({ alerts: [] });

  const report = await harness.run({ maxAsins: 5 });

  assert.equal(report.activeAlerts, 0);
  assert.equal(report.uniqueAsins, 0);
  assert.equal(report.dueAsins, 0);
  assert.deepEqual(harness.schedulingBatchCalls, []);
  assert.deepEqual(harness.lookupCalls, []);
});

test("un candidato usa una sola query batch scheduling", async () => {
  const harness = createFakeHarness();

  const report = await harness.run({ maxAsins: 5 });

  assert.equal(report.uniqueAsins, 1);
  assert.deepEqual(harness.schedulingBatchCalls, [[PRIMARY_ASIN]]);
  assert.deepEqual(harness.lookupCalls, [PRIMARY_ASIN]);
});

test(
  "lo store non esegue RPC quando la lista ASIN e vuota",
  { concurrency: false },
  async () => {
    const originalFetch = globalThis.fetch;
    let requestCount = 0;

    globalThis.fetch = (async () => {
      requestCount += 1;
      return Response.json([]);
    }) as typeof fetch;

    try {
      const result = await loadLatestPriceAlertProductChecks([]);

      assert.equal(requestCount, 0);
      assert.equal(result.size, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
);

test(
  "lo store usa una RPC POST per lista e mappa due latest check indipendenti",
  { concurrency: false },
  async () => {
    const originalFetch = globalThis.fetch;
    const originalSupabaseUrl = process.env.SUPABASE_URL;
    const originalSupabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
    const requestedCalls: Array<{
      body: { p_asins: string[] };
      method: string;
      url: URL;
    }> = [];
    const errorAsin = "BZZZZZZZZZ";
    const manyAsins = [
      PRIMARY_ASIN,
      ...Array.from(
        { length: 99 },
        (_, index) => `B${String(index + 1).padStart(9, "0")}`
      ),
    ];

    process.env.SUPABASE_URL = "https://affario.test";
    process.env.SUPABASE_SECRET_KEY = "test-service-role-key";
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      const body = (await request.clone().json()) as { p_asins: string[] };

      requestedCalls.push({
        body,
        method: request.method,
        url: new URL(request.url),
      });

      if (body.p_asins.includes(errorAsin)) {
        return Response.json(
          { code: "XX000", message: "database details" },
          { status: 500 }
        );
      }

      return Response.json(
        [
          {
            asin: PRIMARY_ASIN,
            requested_at: "2026-08-28T12:00:00.000Z",
            buybox_current_cents: 10_500,
          },
          {
            asin: SECONDARY_ASIN,
            requested_at: "2026-08-28T13:00:00.000Z",
            buybox_current_cents: 9_900,
          },
        ].filter((row) => body.p_asins.includes(row.asin))
      );
    }) as typeof fetch;

    try {
      const singleResult = await loadLatestPriceAlertProductChecks([
        PRIMARY_ASIN,
      ]);

      assert.equal(requestedCalls.length, 1);
      assert.deepEqual(singleResult.get(PRIMARY_ASIN), {
        requested_at: "2026-08-28T12:00:00.000Z",
        buybox_current_cents: 10_500,
      });

      const manyResult = await loadLatestPriceAlertProductChecks([
        ...manyAsins,
        PRIMARY_ASIN,
        SECONDARY_ASIN,
      ]);

      assert.equal(requestedCalls.length, 2);
      assert.equal(requestedCalls[0]?.method, "POST");
      assert.equal(requestedCalls[1]?.method, "POST");
      assert.equal(
        requestedCalls[1]?.url.pathname,
        "/rest/v1/rpc/affario_price_alert_latest_product_checks"
      );
      assert.equal(requestedCalls[1]?.url.search, "");
      assert.deepEqual(requestedCalls[0]?.body, {
        p_asins: [PRIMARY_ASIN],
      });
      assert.deepEqual(requestedCalls[1]?.body, {
        p_asins: manyAsins,
      });
      assert.deepEqual(manyResult.get(PRIMARY_ASIN), {
        requested_at: "2026-08-28T12:00:00.000Z",
        buybox_current_cents: 10_500,
      });
      assert.deepEqual(manyResult.get(SECONDARY_ASIN), {
        requested_at: "2026-08-28T13:00:00.000Z",
        buybox_current_cents: 9_900,
      });
      assert.equal(manyResult.has("B000000002"), false);

      await assert.rejects(
        loadLatestPriceAlertProductChecks([errorAsin]),
        new Error("Lettura batch degli ultimi controlli prodotto fallita.")
      );
      assert.equal(requestedCalls.length, 3);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalSupabaseUrl === undefined) {
        delete process.env.SUPABASE_URL;
      } else {
        process.env.SUPABASE_URL = originalSupabaseUrl;
      }

      if (originalSupabaseSecretKey === undefined) {
        delete process.env.SUPABASE_SECRET_KEY;
      } else {
        process.env.SUPABASE_SECRET_KEY = originalSupabaseSecretKey;
      }
    }
  }
);

test("la migration seleziona staticamente il latest snapshot per ogni ASIN", () => {
  const sql = readFileSync(PRICE_ALERT_LATEST_CHECKS_MIGRATION_PATH, "utf8");
  const store = readFileSync(PRICE_ALERT_MONITORING_STORE_PATH, "utf8");

  assert.match(
    sql,
    /create function public\.affario_price_alert_latest_product_checks\(\s*p_asins text\[\]/i
  );
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(
    sql,
    /returns table \(\s*asin text,\s*requested_at timestamptz,\s*buybox_current_cents integer\s*\)/i
  );
  assert.match(
    sql,
    /select distinct on \(snapshot\.asin\)[\s\S]*from public\.keepa_snapshots as snapshot/i
  );
  assert.match(
    sql,
    /where snapshot\.asin = any \(coalesce\(p_asins, '\{\}'::text\[\]\)\)/i
  );
  assert.match(
    sql,
    /order by snapshot\.asin, snapshot\.requested_at desc/i
  );
  assert.match(
    sql,
    /revoke execute on function public\.affario_price_alert_latest_product_checks\([\s\S]*?\) from public, anon, authenticated/i
  );
  assert.match(
    sql,
    /grant execute on function public\.affario_price_alert_latest_product_checks\([\s\S]*?\) to service_role/i
  );
  assert.doesNotMatch(
    sql,
    /\b(?:insert|update|delete|merge|truncate)\s+(?:into|from|table)?\s*public\./i
  );
  assert.match(
    store,
    /\.rpc\(\s*"affario_price_alert_latest_product_checks"/i
  );
  assert.doesNotMatch(store, /\.in\s*\(/i);
});

test("100 alert sullo stesso exact ASIN producono un solo lookup", async () => {
  const alerts = Array.from({ length: 100 }, (_, index) =>
    createAlert({
      id: index + 1,
      email: `utente${index}@example.test`,
    })
  );
  const harness = createFakeHarness({ alerts });

  const report = await harness.run();

  assert.equal(report.activeAlerts, 100);
  assert.equal(report.uniqueAsins, 1);
  assert.equal(report.productLookups, 1);
  assert.deepEqual(harness.lookupCalls, [PRIMARY_ASIN]);
  assert.deepEqual(harness.schedulingBatchCalls, [[PRIMARY_ASIN]]);
  assert.equal(report.notificationsSent, 100);
});

test("ASIN differenti sono gruppi separati e maxAsins resta opzionale", async () => {
  const harness = createFakeHarness({
    alerts: [
      createAlert(),
      createAlert({ id: 2, productId: SECONDARY_ASIN }),
    ],
    latestChecks: new Map([
      [PRIMARY_ASIN, null],
      [SECONDARY_ASIN, null],
    ]),
    lookupPrices: new Map([
      [PRIMARY_ASIN, 110],
      [SECONDARY_ASIN, 110],
    ]),
  });

  const report = await harness.run({ maxAsins: 1 });

  assert.equal(report.uniqueAsins, 2);
  assert.equal(report.productLookups, 1);
  assert.equal(report.deferredAsins, 1);
  assert.equal(report.backgroundDeferredForRunLimit, 1);
});

test("oltre il default 5 la selezione resta una query e limita i lookup a 5", async () => {
  const asins = Array.from({ length: 8 }, (_, index) =>
    `B${String(index + 1).padStart(9, "0")}`
  );
  const harness = createFakeHarness({
    alerts: asins.map((productId, index) =>
      createAlert({ id: index + 1, productId })
    ),
    latestChecks: new Map(asins.map((asin) => [asin, null])),
    lookupPrices: new Map(asins.map((asin) => [asin, 110])),
  });

  const report = await harness.run({ maxAsins: 5 });

  assert.equal(harness.schedulingBatchCalls.length, 1);
  assert.deepEqual(harness.schedulingBatchCalls[0], asins);
  assert.equal(harness.lookupCalls.length, 5);
  assert.deepEqual(harness.lookupCalls, asins.slice(0, 5));
  assert.equal(report.backgroundDeferredForRunLimit, 3);
});

test("hard cap assoluto limita a 10 anche senza opzione o con valore superiore", async () => {
  const asins = Array.from(
    { length: MAX_ALERT_MONITORING_ASINS_PER_RUN + 1 },
    (_, index) => `B${String(index + 1).padStart(9, "0")}`
  );
  const createCappedHarness = () =>
    createFakeHarness({
      alerts: asins.map((productId, index) =>
        createAlert({ id: index + 1, productId })
      ),
      latestChecks: new Map(asins.map((asin) => [asin, null])),
      lookupPrices: new Map(asins.map((asin) => [asin, 110])),
    });
  const defaultHarness = createCappedHarness();
  const oversizedHarness = createCappedHarness();

  const defaultReport = await defaultHarness.run();
  const oversizedReport = await oversizedHarness.run({ maxAsins: 99 });

  assert.equal(
    defaultHarness.lookupCalls.length,
    MAX_ALERT_MONITORING_ASINS_PER_RUN
  );
  assert.equal(defaultHarness.schedulingBatchCalls.length, 1);
  assert.equal(defaultReport.backgroundDeferredForRunLimit, 1);
  assert.equal(
    oversizedHarness.lookupCalls.length,
    MAX_ALERT_MONITORING_ASINS_PER_RUN
  );
  assert.equal(oversizedHarness.schedulingBatchCalls.length, 1);
  assert.equal(oversizedReport.backgroundDeferredForRunLimit, 1);
});

test("il batch serve prima ASIN mai controllati e poi i controlli piu vecchi", async () => {
  const neverCheckedAsin = "B000000002";
  const harness = createFakeHarness({
    alerts: [
      createAlert(),
      createAlert({ id: 2, productId: SECONDARY_ASIN }),
      createAlert({ id: 3, productId: neverCheckedAsin }),
    ],
    latestChecks: new Map([
      [
        PRIMARY_ASIN,
        {
          requestedAt: "2026-08-28T05:00:00.000Z",
          currentPrice: 105,
        },
      ],
      [
        SECONDARY_ASIN,
        {
          requestedAt: "2026-08-28T01:00:00.000Z",
          currentPrice: 105,
        },
      ],
      [neverCheckedAsin, null],
    ]),
    lookupPrices: new Map([
      [PRIMARY_ASIN, 110],
      [SECONDARY_ASIN, 110],
      [neverCheckedAsin, 110],
    ]),
  });

  const report = await harness.run({ maxAsins: 2 });

  assert.deepEqual(harness.lookupCalls, [neverCheckedAsin, SECONDARY_ASIN]);
  assert.equal(report.dueAsins, 2);
  assert.equal(report.deferredAsins, 1);
  assert.equal(report.backgroundDeferredForRunLimit, 1);
});

test("un gruppo non dovuto non consuma il limite del batch", async () => {
  const harness = createFakeHarness({
    alerts: [
      createAlert(),
      createAlert({ id: 2, productId: SECONDARY_ASIN }),
    ],
    latestChecks: new Map([
      [
        PRIMARY_ASIN,
        {
          requestedAt: "2026-08-28T11:30:00.000Z",
          currentPrice: 102,
        },
      ],
      [
        SECONDARY_ASIN,
        {
          requestedAt: "2026-08-28T09:59:59.000Z",
          currentPrice: 102,
        },
      ],
    ]),
    lookupPrices: new Map([[SECONDARY_ASIN, 110]]),
  });

  const report = await harness.run({ maxAsins: 1 });

  assert.deepEqual(harness.schedulingBatchCalls, [
    [PRIMARY_ASIN, SECONDARY_ASIN],
  ]);
  assert.deepEqual(harness.lookupCalls, [SECONDARY_ASIN]);
  assert.equal(report.skippedNotDue, 1);
  assert.equal(report.dueAsins, 1);
  assert.equal(report.deferredAsins, 0);
  assert.equal(report.backgroundDeferredForRunLimit, 0);
});

test("errore DB batch fallisce chiuso prima di ogni lookup prodotto", async () => {
  const harness = createFakeHarness({
    alerts: [
      createAlert(),
      createAlert({ id: 2, productId: SECONDARY_ASIN }),
    ],
    latestChecksError: new Error("database unavailable"),
  });

  const report = await harness.run({ maxAsins: 1 });

  assert.equal(harness.schedulingBatchCalls.length, 1);
  assert.equal(report.schedulingFailures, 2);
  assert.equal(report.productLookups, 0);
  assert.deepEqual(harness.lookupCalls, []);
  assert.deepEqual(harness.sendCalls, []);
});

test("la fairness ordina per dueAt e non privilegia la fascia piu vicina", async () => {
  const harness = createFakeHarness({
    alerts: [
      createAlert(),
      createAlert({ id: 2, productId: SECONDARY_ASIN }),
    ],
    latestChecks: new Map([
      [
        PRIMARY_ASIN,
        {
          requestedAt: "2026-08-27T11:00:00.000Z",
          currentPrice: 116,
        },
      ],
      [
        SECONDARY_ASIN,
        {
          requestedAt: "2026-08-28T08:00:00.000Z",
          currentPrice: 103,
        },
      ],
    ]),
    lookupPrices: new Map([
      [PRIMARY_ASIN, 110],
      [SECONDARY_ASIN, 110],
    ]),
  });

  const report = await harness.run({ maxAsins: 1 });

  assert.deepEqual(harness.lookupCalls, [SECONDARY_ASIN]);
  assert.equal(report.deferredAsins, 1);
  assert.equal(report.backgroundDeferredForRunLimit, 1);
});

test("a parita di scheduling l'ordering per exact ASIN resta stabile", async () => {
  const harness = createFakeHarness({
    alerts: [
      createAlert(),
      createAlert({ id: 2, productId: SECONDARY_ASIN }),
    ],
    latestChecks: new Map([
      [PRIMARY_ASIN, null],
      [SECONDARY_ASIN, null],
    ]),
    lookupPrices: new Map([
      [PRIMARY_ASIN, 110],
      [SECONDARY_ASIN, 110],
    ]),
  });

  await harness.run({ maxAsins: 1 });

  assert.deepEqual(harness.lookupCalls, [SECONDARY_ASIN]);
});

test("target differenti usano l'intervallo più breve del gruppo", async () => {
  const harness = createFakeHarness({
    alerts: [
      createAlert({ targetPrice: 100 }),
      createAlert({ id: 2, targetPrice: 117 }),
    ],
    latestChecks: new Map([
      [
        PRIMARY_ASIN,
        {
          requestedAt: "2026-08-28T10:00:00.000Z",
          currentPrice: 120,
        },
      ],
    ]),
    lookupPrices: new Map([[PRIMARY_ASIN, 119]]),
  });

  const report = await harness.run();

  assert.equal(report.dueAsins, 1);
  assert.equal(report.productLookups, 1);
});

test("snapshot recente viene saltata, snapshot scaduta e assente controllate", async () => {
  const thirdAsin = "B000000002";
  const harness = createFakeHarness({
    alerts: [
      createAlert(),
      createAlert({ id: 2, productId: SECONDARY_ASIN }),
      createAlert({ id: 3, productId: thirdAsin }),
    ],
    latestChecks: new Map([
      [
        PRIMARY_ASIN,
        {
          requestedAt: "2026-08-28T11:30:00.000Z",
          currentPrice: 102,
        },
      ],
      [
        SECONDARY_ASIN,
        {
          requestedAt: "2026-08-28T09:59:59.000Z",
          currentPrice: 102,
        },
      ],
      [thirdAsin, null],
    ]),
    lookupPrices: new Map([
      [SECONDARY_ASIN, 110],
      [thirdAsin, 110],
    ]),
  });

  const report = await harness.run();

  assert.equal(report.skippedNotDue, 1);
  assert.deepEqual(harness.lookupCalls, [thirdAsin, SECONDARY_ASIN]);
});

test("la riserva background ferma il refresh senza valutare o notificare", async () => {
  const harness = createFakeHarness({
    latestChecks: new Map([[PRIMARY_ASIN, null]]),
    lookupErrors: new Map([
      [
        PRIMARY_ASIN,
        new PriceAlertMonitoringLookupControlError(
          "TOKEN_RESERVE",
          "RESERVE"
        ),
      ],
    ]),
  });

  const report = await harness.run();

  assert.equal(report.tokenBudgetStatus, "RESERVE");
  assert.equal(report.backgroundSkippedForReserve, 1);
  assert.equal(report.backgroundDeferredForRunLimit, 0);
  assert.equal(report.skippedNotDue, 0);
  assert.equal(report.keepaRateLimited, 0);
  assert.equal(report.refreshedProducts, 0);
  assert.equal(report.targetsReached, 0);
  assert.equal(report.notificationsSent, 0);
  assert.equal(harness.records[0]?.targetReachedAt, null);
  assert.equal(harness.records[0]?.status, "active");
});

test("contesa refresh background salta il gruppo senza notificare", async () => {
  const harness = createFakeHarness({
    latestChecks: new Map([[PRIMARY_ASIN, null]]),
    lookupErrors: new Map([
      [
        PRIMARY_ASIN,
        new PriceAlertMonitoringLookupControlError(
          "REFRESH_CONTENDED",
          "UNKNOWN"
        ),
      ],
    ]),
  });

  const report = await harness.run();

  assert.equal(report.productRefreshLockContended, 1);
  assert.equal(report.lookupFailures, 0);
  assert.equal(report.refreshedProducts, 0);
  assert.equal(report.notificationsSent, 0);
  assert.equal(harness.records[0]?.status, "active");
  assert.equal(harness.records[0]?.targetReachedAt, null);
});

test("un 429 background interrompe i refresh successivi del run", async () => {
  const harness = createFakeHarness({
    alerts: [
      createAlert(),
      createAlert({ id: 2, productId: SECONDARY_ASIN }),
    ],
    latestChecks: new Map([
      [PRIMARY_ASIN, null],
      [SECONDARY_ASIN, null],
    ]),
    lookupErrors: new Map([
      [
        SECONDARY_ASIN,
        new PriceAlertMonitoringLookupControlError(
          "RATE_LIMITED",
          "EXHAUSTED"
        ),
      ],
    ]),
  });

  const report = await harness.run();

  assert.deepEqual(harness.lookupCalls, [SECONDARY_ASIN]);
  assert.equal(report.tokenBudgetStatus, "EXHAUSTED");
  assert.equal(report.keepaRateLimited, 1);
  assert.equal(report.backgroundDeferredForRunLimit, 0);
  assert.equal(report.backgroundSkippedForReserve, 0);
  assert.equal(report.skippedNotDue, 0);
  assert.equal(report.notificationsSent, 0);
  assert.equal(report.deferredAsins, 0);
  assert.equal(harness.records[0]?.targetReachedAt, null);
  assert.equal(harness.records[1]?.targetReachedAt, null);
});

test("una cache hit background resta utilizzabile senza budget provider", async () => {
  const harness = createFakeHarness({
    latestChecks: new Map([[PRIMARY_ASIN, null]]),
    cacheHits: new Set([PRIMARY_ASIN]),
    tokenBudgetStatuses: new Map([[PRIMARY_ASIN, "UNKNOWN"]]),
  });

  const report = await harness.run();

  assert.equal(report.cacheHits, 1);
  assert.equal(report.refreshedProducts, 0);
  assert.equal(report.backgroundSkippedForReserve, 0);
  assert.equal(report.notificationsSent, 1);
});

test("success conclude in target_notified e il run successivo lo esclude", async () => {
  const harness = createFakeHarness({
    lookupPrices: new Map([[PRIMARY_ASIN, 100]]),
  });

  const firstReport = await harness.run();
  const secondReport = await harness.run();

  assert.equal(firstReport.notificationsSent, 1);
  assert.equal(harness.records[0]?.status, "target_notified");
  assert.equal(harness.records[0]?.notifiedAt, STARTED_AT.toISOString());
  assert.equal(harness.records[0]?.targetNotificationClaimedAt, null);
  assert.equal(secondReport.activeAlerts, 0);
  assert.equal(harness.lookupCalls.length, 1);
  assert.equal(harness.sendCalls.length, 1);
  assert.equal(harness.records.length, 1);
});

test("target_reached outcome è write-once e alimenta il retry", async () => {
  const harness = createFakeHarness({
    lookupPrices: new Map([[PRIMARY_ASIN, 98]]),
  });
  harness.setSendResult({ status: "rejected" });

  await harness.run();

  const reachedAt = harness.records[0]?.targetReachedAt;
  assert.equal(harness.records[0]?.targetReachedPrice, 98);
  assert.equal(harness.records[0]?.notifiedAt, null);
  assert.equal(harness.records[0]?.status, "active");

  harness.setSendResult({ status: "accepted" });
  await harness.run();

  assert.equal(harness.records[0]?.targetReachedAt, reachedAt);
  assert.equal(harness.records[0]?.targetReachedPrice, 98);
  assert.equal(harness.sendCalls[1]?.currentPrice, 98);
  assert.equal(harness.lookupCalls.length, 1);
});

test("prezzo sopra target non invia intermediate o target", async () => {
  const harness = createFakeHarness({
    lookupPrices: new Map([[PRIMARY_ASIN, 105]]),
  });

  const report = await harness.run();

  assert.equal(report.targetsReached, 0);
  assert.equal(report.notificationsSent, 0);
  assert.deepEqual(harness.sendCalls, []);
});

test("pending, target_notified, già notified e legacy incompatibili sono esclusi", async () => {
  const harness = createFakeHarness({
    alerts: [
      createAlert(),
      createAlert({ id: 2, status: "pending_confirmation" }),
      createAlert({ id: 3, status: "target_notified" }),
      createAlert({ id: 4, notifiedAt: STARTED_AT.toISOString() }),
      createAlert({ id: 5, targetPrice: 130 }),
    ],
  });

  const report = await harness.run();

  assert.equal(report.activeAlerts, 2);
  assert.equal(report.eligibleAlerts, 1);
  assert.equal(report.excludedAlerts, 3);
  assert.equal(report.invalidAlerts, 1);
  assert.deepEqual(harness.completedIds, [1]);
});

test("failure certa rilascia claim, conserva outcome e lascia notified_at NULL", async () => {
  const harness = createFakeHarness();
  harness.setSendResult({ status: "rejected" });

  const report = await harness.run();

  assert.equal(report.notificationFailures, 1);
  assert.deepEqual(harness.releasedIds, [1]);
  assert.equal(harness.records[0]?.status, "active");
  assert.equal(harness.records[0]?.notifiedAt, null);
  assert.equal(harness.records[0]?.targetReachedAt, STARTED_AT.toISOString());
  assert.equal(harness.records[0]?.targetReachedPrice, 99);
});

test("esito ambiguo lascia una claim timestampata recuperabile", async () => {
  const harness = createFakeHarness();
  harness.setSendResult({ status: "unknown" });

  const report = await harness.run();

  assert.equal(report.ambiguousNotifications, 1);
  assert.equal(harness.records[0]?.status, "notifying_target");
  assert.equal(
    harness.records[0]?.targetNotificationClaimedAt,
    STARTED_AT.toISOString()
  );
  assert.equal(harness.records[0]?.notifiedAt, null);

  harness.setProviderEventStatus("not-found");
  harness.setSendResult({ status: "accepted" });
  harness.setClock(
    new Date(STARTED_AT.getTime() + TARGET_NOTIFICATION_CLAIM_LEASE_MS + 1)
  );
  const recoveryReport = await harness.run();

  assert.equal(recoveryReport.staleClaimsRetried, 1);
  assert.equal(harness.records[0]?.status, "target_notified");
});

test("stale claim con evento provider esistente finalizza senza reinvio", async () => {
  const claimedAt = new Date(
    STARTED_AT.getTime() - TARGET_NOTIFICATION_CLAIM_LEASE_MS - 1
  ).toISOString();
  const harness = createFakeHarness({
    alerts: [
      createAlert({
        status: "notifying_target",
        targetNotificationClaimedAt: claimedAt,
        targetReachedAt: "2026-08-28T10:00:00.000Z",
        targetReachedPrice: 99,
      }),
    ],
  });
  harness.setProviderEventStatus("accepted");

  const report = await harness.run();

  assert.equal(report.staleClaimsRecovered, 1);
  assert.equal(harness.records[0]?.status, "target_notified");
  assert.equal(harness.sendCalls.length, 0);
  assert.deepEqual(harness.providerChecks, [1]);
});

test("stale claim senza evento provider viene ritentata", async () => {
  const claimedAt = new Date(
    STARTED_AT.getTime() - TARGET_NOTIFICATION_CLAIM_LEASE_MS - 1
  ).toISOString();
  const harness = createFakeHarness({
    alerts: [
      createAlert({
        status: "notifying_target",
        targetNotificationClaimedAt: claimedAt,
        targetReachedAt: "2026-08-28T10:00:00.000Z",
        targetReachedPrice: 97,
      }),
    ],
  });
  harness.setProviderEventStatus("not-found");

  const report = await harness.run();

  assert.equal(report.staleClaimsRetried, 1);
  assert.equal(harness.sendCalls.length, 1);
  assert.equal(harness.sendCalls[0]?.currentPrice, 97);
  assert.equal(harness.records[0]?.status, "target_notified");
});

test("stato provider incerto conserva stale claim senza reinvio cieco", async () => {
  const claimedAt = new Date(
    STARTED_AT.getTime() - TARGET_NOTIFICATION_CLAIM_LEASE_MS - 1
  ).toISOString();
  const harness = createFakeHarness({
    alerts: [
      createAlert({
        status: "notifying_target",
        targetNotificationClaimedAt: claimedAt,
        targetReachedAt: "2026-08-28T10:00:00.000Z",
        targetReachedPrice: 99,
      }),
    ],
  });
  harness.setProviderEventStatus("unknown");

  const report = await harness.run();

  assert.equal(report.staleClaimsUnknown, 1);
  assert.equal(harness.records[0]?.status, "notifying_target");
  assert.equal(harness.sendCalls.length, 0);
});

test("finalizzazione DB fallita resta recuperabile e non rilascia la claim", async () => {
  const harness = createFakeHarness();
  harness.setFinalizationFailure(true);

  const report = await harness.run();

  assert.equal(report.notificationsSent, 1);
  assert.equal(report.finalizationFailures, 1);
  assert.equal(harness.records[0]?.status, "notifying_target");
  assert.equal(harness.records[0]?.notifiedAt, null);
  assert.notEqual(harness.records[0]?.targetNotificationClaimedAt, null);

  harness.setFinalizationFailure(false);
  harness.setProviderEventStatus("accepted");
  harness.setClock(
    new Date(STARTED_AT.getTime() + TARGET_NOTIFICATION_CLAIM_LEASE_MS + 1)
  );
  const recoveryReport = await harness.run();

  assert.equal(recoveryReport.staleClaimsRecovered, 1);
  assert.equal(harness.records[0]?.status, "target_notified");
  assert.equal(harness.sendCalls.length, 1);
});

test("due worker concorrenti producono un solo invio", async () => {
  const harness = createFakeHarness();

  const reports = await Promise.all([harness.run(), harness.run()]);

  assert.equal(
    reports.reduce((total, report) => total + report.notificationsSent, 0),
    1
  );
  assert.equal(harness.sendCalls.length, 1);
  assert.equal(harness.records[0]?.status, "target_notified");
});

test("exact ASIN e target restano invariati e il record non viene cancellato", async () => {
  const harness = createFakeHarness({
    alerts: [createAlert({ targetPrice: 97 })],
    latestChecks: new Map([[PRIMARY_ASIN, null]]),
    lookupPrices: new Map([[PRIMARY_ASIN, 95]]),
  });

  await harness.run();

  assert.equal(harness.sendCalls[0]?.exactAsin, PRIMARY_ASIN);
  assert.equal(harness.sendCalls[0]?.targetPrice, 97);
  assert.equal(harness.records[0]?.productId, PRIMARY_ASIN);
  assert.equal(harness.records[0]?.targetPrice, 97);
  assert.equal(harness.records.length, 1);
});
