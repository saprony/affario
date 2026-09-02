import { NextResponse } from "next/server";
import {
  hashAlertManagementToken,
  isValidAlertManagementToken,
} from "@/lib/alertManagementToken";
import {
  API_NO_STORE_HEADERS,
  JsonRequestBodyError,
  readJsonRequestBody,
} from "@/lib/jsonRequestBody";
import { getSupabaseServerClient } from "@/services/supabaseServer";

const ALERT_NOT_FOUND_MESSAGE = "Alert non trovato o già eliminato.";

function alertNotFoundResponse() {
  return NextResponse.json(
    { message: ALERT_NOT_FOUND_MESSAGE },
    { status: 404, headers: API_NO_STORE_HEADERS }
  );
}

function deleteErrorResponse() {
  return NextResponse.json(
    { message: "Non è stato possibile eliminare l'alert. Riprova." },
    { status: 500, headers: API_NO_STORE_HEADERS }
  );
}

export async function DELETE(request: Request) {
  let body: unknown;

  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    if (
      error instanceof JsonRequestBodyError &&
      error.code === "PAYLOAD_TOO_LARGE"
    ) {
      return NextResponse.json(
        { message: ALERT_NOT_FOUND_MESSAGE },
        { status: 413, headers: API_NO_STORE_HEADERS }
      );
    }

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

  return NextResponse.json(
    { message: "Alert eliminato correttamente." },
    { headers: API_NO_STORE_HEADERS }
  );
}
