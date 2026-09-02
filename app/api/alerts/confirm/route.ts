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
import { confirmPriceAlertByToken } from "@/lib/priceAlertManagement";
import { priceAlertManagementStore } from "@/services/priceAlertManagementStore";

function alertNotFoundResponse() {
  return NextResponse.json(
    { message: "Alert non trovato o già eliminato." },
    { status: 404, headers: API_NO_STORE_HEADERS }
  );
}

function confirmationErrorResponse() {
  return NextResponse.json(
    { message: "Non è stato possibile confermare l'alert. Riprova." },
    { status: 500, headers: API_NO_STORE_HEADERS }
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    if (
      error instanceof JsonRequestBodyError &&
      error.code === "PAYLOAD_TOO_LARGE"
    ) {
      return NextResponse.json(
        { message: "Alert non trovato o già eliminato." },
        { status: 413, headers: API_NO_STORE_HEADERS }
      );
    }

    return alertNotFoundResponse();
  }

  if (!body || typeof body !== "object") {
    return alertNotFoundResponse();
  }

  const { token } = body as Record<string, unknown>;

  try {
    const result = await confirmPriceAlertByToken(
      token,
      {
        isValid: isValidAlertManagementToken,
        hash: hashAlertManagementToken,
      },
      priceAlertManagementStore
    );

    if (result.status === "not-found") {
      return alertNotFoundResponse();
    }

    return NextResponse.json(
      {
        success: true,
        alertStatus: result.alertStatus,
        alreadyConfirmed: result.status === "already-active",
      },
      { headers: API_NO_STORE_HEADERS }
    );
  } catch {
    return confirmationErrorResponse();
  }
}
