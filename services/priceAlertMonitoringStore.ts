import "server-only";

import {
  PRICE_ALERT_ACTIVE_STATUS,
  PRICE_ALERT_NOTIFYING_TARGET_STATUS,
} from "@/lib/affarioPriceAlert";
import { getSupabaseServerClient } from "@/services/supabaseServer";

export type StoredActivePriceAlert = {
  id: number;
  product_id: string;
  product_title: string;
  email: string;
  current_price: number;
  target_price: number;
  status: string;
  notified_at: string | null;
  target_notification_claimed_at: string | null;
  target_reached_at: string | null;
  target_reached_price: number | null;
};

export type StoredPriceAlertProductCheck = {
  requested_at: string;
  buybox_current_cents: number | null;
};

export async function loadActivePriceAlerts(): Promise<
  readonly StoredActivePriceAlert[]
> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_alerts")
    .select(
      "id,product_id,product_title,email,current_price,target_price,status,notified_at,target_notification_claimed_at,target_reached_at,target_reached_price"
    )
    .eq("status", PRICE_ALERT_ACTIVE_STATUS)
    .is("notified_at", null)
    .order("id", { ascending: true });

  if (error) {
    throw new Error("Lettura degli alert attivi fallita.");
  }

  return (data ?? []) as StoredActivePriceAlert[];
}

export async function loadStaleTargetNotificationClaims(
  staleBefore: string
): Promise<readonly StoredActivePriceAlert[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_alerts")
    .select(
      "id,product_id,product_title,email,current_price,target_price,status,notified_at,target_notification_claimed_at,target_reached_at,target_reached_price"
    )
    .eq("status", PRICE_ALERT_NOTIFYING_TARGET_STATUS)
    .is("notified_at", null)
    .not("target_notification_claimed_at", "is", null)
    .lte("target_notification_claimed_at", staleBefore)
    .order("target_notification_claimed_at", { ascending: true });

  if (error) {
    throw new Error("Lettura delle claim target scadute fallita.");
  }

  return (data ?? []) as StoredActivePriceAlert[];
}

export async function getLatestPriceAlertProductCheck(
  exactAsin: string
): Promise<StoredPriceAlertProductCheck | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("keepa_snapshots")
    .select("requested_at,buybox_current_cents")
    .eq("asin", exactAsin)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle<StoredPriceAlertProductCheck>();

  if (error) {
    throw new Error("Lettura dell'ultimo controllo prodotto fallita.");
  }

  return data;
}
