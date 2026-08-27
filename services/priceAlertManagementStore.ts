import "server-only";

import {
  PRICE_ALERT_ACTIVE_STATUS,
  PRICE_ALERT_PENDING_STATUS,
} from "@/lib/affarioPriceAlert";
import type {
  ManagedPriceAlert,
  PriceAlertManagementStore,
} from "@/lib/priceAlertManagement";
import { getSupabaseServerClient } from "@/services/supabaseServer";

function databaseError(): Error {
  return new Error("Price alert management database error");
}

export const priceAlertManagementStore: PriceAlertManagementStore = {
  async findByTokenHash(tokenHash) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .schema("public")
      .from("price_alerts")
      .select("product_title, current_price, target_price, status")
      .eq("manage_token_hash", tokenHash)
      .maybeSingle<ManagedPriceAlert>();

    if (error) {
      throw databaseError();
    }

    return data;
  },

  async activatePendingByTokenHash(tokenHash) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .schema("public")
      .from("price_alerts")
      .update({ status: PRICE_ALERT_ACTIVE_STATUS })
      .eq("manage_token_hash", tokenHash)
      .eq("status", PRICE_ALERT_PENDING_STATUS)
      .select("manage_token_hash")
      .maybeSingle<{ manage_token_hash: string }>();

    if (error) {
      throw databaseError();
    }

    return data !== null;
  },
};
