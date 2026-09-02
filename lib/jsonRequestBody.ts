export const DEFAULT_JSON_REQUEST_MAX_BYTES = 4_096;

export const API_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export type JsonRequestBodyErrorCode =
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE";

export class JsonRequestBodyError extends Error {
  constructor(public readonly code: JsonRequestBodyErrorCode) {
    super(code);
    this.name = "JsonRequestBodyError";
  }
}

function readContentLength(request: Request): number | null {
  const value = request.headers.get("content-length");

  if (value === null) {
    return null;
  }

  if (!/^\d+$/.test(value)) {
    throw new JsonRequestBodyError("INVALID_JSON");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new JsonRequestBodyError("PAYLOAD_TOO_LARGE");
  }

  return parsed;
}

export async function readJsonRequestBody(
  request: Request,
  maxBytes = DEFAULT_JSON_REQUEST_MAX_BYTES
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes deve essere un intero positivo.");
  }

  const contentLength = readContentLength(request);

  if (contentLength !== null && contentLength > maxBytes) {
    throw new JsonRequestBodyError("PAYLOAD_TOO_LARGE");
  }

  if (!request.body) {
    throw new JsonRequestBodyError("INVALID_JSON");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The request has already been rejected.
        }

        throw new JsonRequestBodyError("PAYLOAD_TOO_LARGE");
      }

      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof JsonRequestBodyError) {
      throw error;
    }

    throw new JsonRequestBodyError("INVALID_JSON");
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new JsonRequestBodyError("INVALID_JSON");
  }
}
