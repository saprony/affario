import { NextResponse } from "next/server";
import {
  hashAlertManagementToken,
  isValidAlertManagementToken,
} from "@/lib/alertManagementToken";
import { getSupabaseServerClient } from "@/services/supabaseServer";

const ALERT_NOT_FOUND_MESSAGE = "Alert non trovato o già eliminato.";

function alertNotFoundResponse() {
  return NextResponse.json(
    { message: ALERT_NOT_FOUND_MESSAGE },
    { status: 404 }
  );
}

function deleteErrorResponse() {
  return NextResponse.json(
    { message: "Non è stato possibile eliminare l'alert. Riprova." },
    { status: 500 }
  );
}

export async function DELETE(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return alertNotFoundResponse();
  }

  if (!body || typeof body !== "object") {
    return alertNotFoundResponse();
  }

  const { token } = body as Record<string, unknown>;

  if (!isValidAlertManagementToken(token)) {
    return alertNotFoundResponse();
  }

  const tokenHash = hashAlertManagementToken(token);

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("price_alerts")
      .delete()
      .eq("manage_token_hash", tokenHash)
      .select("manage_token_hash");

    if (error) {
      return deleteErrorResponse();
    }

    if (!data || data.length === 0) {
      return alertNotFoundResponse();
    }
  } catch {
    return deleteErrorResponse();
  }

  return NextResponse.json({ message: "Alert eliminato correttamente." });
}
