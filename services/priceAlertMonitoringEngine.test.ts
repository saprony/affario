import assert from "node:assert/strict";
import test from "node:test";

import {
  createPriceAlertCheckRunner,
  TARGET_NOTIFICATION_CLAIM_LEASE_MS,
  type PriceAlertMonitoringDependencies,
  type PriceAlertMonitoringRecord,
  type PriceAlertProductCheck,
  type TargetEmailProviderEventStatus,
  type TargetEmailSendResult,
  type TargetPriceAlertDelivery,
} from "./priceAlertMonitoringEngine";

const STARTED_AT = new Date("2026-08-28T12:00:00.000Z");
const PRIMARY_ASIN = "B0FQGPJCJK";
const SECONDARY_ASIN = "B000000001";

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
};

function createFakeHarness({
  alerts = [createAlert()],
  latestChecks = new Map([
    [
      PRIMARY_ASIN,
      {
        requestedAt: "2026-08-28T08:00:00.000Z",
        currentPrice: 105,
      },
    ],
  ]),
  lookupPrices = new Map([[PRIMARY_ASIN, 99]]),
  cacheHits = new Set(),
}: FakeHarnessOptions = {}) {
  const records = alerts.map((alert) => ({ ...alert }));
  const lookupCalls: string[] = [];
  const snapshotCalls: string[] = [];
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
    async getLatestProductCheck(exactAsin) {
      snapshotCalls.push(exactAsin);
      return latestChecks.get(exactAsin) ?? null;
    },
    async lookupProduct(exactAsin) {
      lookupCalls.push(exactAsin);
      return {
        exactAsin,
        currentPrice: lookupPrices.get(exactAsin) ?? null,
        cacheHit: cacheHits.has(exactAsin),
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
    snapshotCalls,
  };
}

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
          requestedAt: "2026-08-28T10:59:59.000Z",
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
  assert.deepEqual(harness.lookupCalls, [SECONDARY_ASIN, thirdAsin]);
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
