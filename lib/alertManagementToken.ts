import "server-only";

import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateAlertManagementToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function isValidAlertManagementToken(token: unknown): token is string {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    return false;
  }

  try {
    const decodedToken = Buffer.from(token, "base64url");

    return (
      decodedToken.length === TOKEN_BYTES &&
      decodedToken.toString("base64url") === token
    );
  } catch {
    return false;
  }
}

export function hashAlertManagementToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
