import {
  PRICE_ALERT_ACTIVE_STATUS,
} from "./affarioPriceAlert";

export type ManagedPriceAlert = {
  product_title: string;
  current_price: number;
  target_price: number;
  status: string | null;
};

export type AlertManagementTokenCodec = {
  isValid: (token: unknown) => token is string;
  hash: (token: string) => string;
};

export type PriceAlertManagementStore = {
  findByTokenHash: (tokenHash: string) => Promise<ManagedPriceAlert | null>;
  activatePendingByTokenHash: (tokenHash: string) => Promise<boolean>;
};

export type PriceAlertConfirmationResult =
  | { status: "confirmed"; alertStatus: typeof PRICE_ALERT_ACTIVE_STATUS }
  | {
      status: "already-active";
      alertStatus: typeof PRICE_ALERT_ACTIVE_STATUS;
    }
  | { status: "not-found" };

export async function readPriceAlertByToken(
  token: unknown,
  tokenCodec: AlertManagementTokenCodec,
  store: Pick<PriceAlertManagementStore, "findByTokenHash">
): Promise<ManagedPriceAlert | null> {
  if (!tokenCodec.isValid(token)) {
    return null;
  }

  return store.findByTokenHash(tokenCodec.hash(token));
}

export async function confirmPriceAlertByToken(
  token: unknown,
  tokenCodec: AlertManagementTokenCodec,
  store: Pick<
    PriceAlertManagementStore,
    "activatePendingByTokenHash" | "findByTokenHash"
  >
): Promise<PriceAlertConfirmationResult> {
  if (!tokenCodec.isValid(token)) {
    return { status: "not-found" };
  }

  const tokenHash = tokenCodec.hash(token);
  const wasActivated = await store.activatePendingByTokenHash(tokenHash);

  if (wasActivated) {
    return {
      status: "confirmed",
      alertStatus: PRICE_ALERT_ACTIVE_STATUS,
    };
  }

  const alert = await store.findByTokenHash(tokenHash);

  if (alert?.status === PRICE_ALERT_ACTIVE_STATUS) {
    return {
      status: "already-active",
      alertStatus: PRICE_ALERT_ACTIVE_STATUS,
    };
  }

  return { status: "not-found" };
}
