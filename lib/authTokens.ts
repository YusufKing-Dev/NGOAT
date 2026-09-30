import { createHash, randomBytes } from "crypto";

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // links work for 30 minutes
export const TOKEN_EMAIL_COOLDOWN_MS = 2 * 60 * 1000; // at most one email per 2 min per account
export const WITHDRAWAL_HOLD_AFTER_RESET_MS = 24 * 60 * 60 * 1000; // 24h withdrawal hold after a forgot-password reset

/** A fresh random token to put in an emailed link. */
export function newRawToken(): string {
  return randomBytes(32).toString("hex");
}

/** Only this hash is stored in the database, never the raw token. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Returns an error code for an unacceptable new password, or null if it's
 * fine. Minimum matches registration (8). The 72-character cap exists
 * because bcrypt silently ignores anything past 72 bytes.
 */
export function validateNewPassword(pw: unknown): "INVALID_INPUT" | "PASSWORD_TOO_SHORT" | "PASSWORD_TOO_LONG" | null {
  if (typeof pw !== "string") return "INVALID_INPUT";
  if (pw.length < 8) return "PASSWORD_TOO_SHORT";
  if (pw.length > 72) return "PASSWORD_TOO_LONG";
  return null;
}