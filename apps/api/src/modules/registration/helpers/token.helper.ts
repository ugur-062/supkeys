import { createHash, randomBytes } from "node:crypto";

/**
 * Üretilen ham token (e-postaya konur).
 * 32 byte → 64 karakter hex string.
 */
export function generateRegistrationToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * SupplierInvitation gibi tablolarda token'ı SADECE sha256 hash'i olarak saklarız.
 * Doğrulama: gelen ham token'ın hash'i DB'deki tokenHash ile karşılaştırılır.
 */
export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/**
 * Şifre güç regex'i: en az 1 büyük harf, 1 küçük harf, 1 sayı.
 * 8-72 karakter ayrı validate edilir.
 */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
