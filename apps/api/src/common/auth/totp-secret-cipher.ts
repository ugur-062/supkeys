import * as crypto from "crypto";

/**
 * TOTP sırrı şifreleme — ORTAK (firma + admin). Denetim 2026-08-23 Parça 1 #4:
 * firma tarafı AES-256-GCM ile şifreliyordu (company-auth.service, testli),
 * admin 2FA portu düz metin yazıyordu. Tek yardımcı, iki realm.
 *
 * Anahtar: `TOTP_ENC_KEY` env varsa ondan; yoksa JWT_SECRET türevi (geriye
 * uyum — mevcut kayıtlar açılmaya devam eder). JWT_SECRET rotasyonu yapılacaksa
 * önce TOTP_ENC_KEY'i eski JWT_SECRET değeriyle sabitleyin (anahtar ayrışır).
 * Biçim: `enc:v1:<iv b64>:<tag b64>:<ct b64>`; eski düz-metin kayıtlar okurken
 * şeffaf kabul (lazy migration — bir sonraki yazımda şifrelenir).
 */
export const TOTP_ENC_PREFIX = "enc:v1:";

export function totpEncKey(opts: { jwtSecret: string; totpEncKey?: string | null }): Buffer {
  const base = opts.totpEncKey?.trim() ? `totp:${opts.totpEncKey.trim()}` : `2fa:${opts.jwtSecret}`;
  return crypto.createHash("sha256").update(base).digest();
}

export function encryptTotpSecret(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${TOTP_ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Şifreli değeri çözer; düz metinse (legacy) olduğu gibi döner. Bozuk/uyumsuz anahtar → throw. */
export function decryptTotpSecret(stored: string, key: Buffer): string {
  if (!stored.startsWith(TOTP_ENC_PREFIX)) return stored;
  const [, , ivB64, tagB64, ctB64] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64!, "base64")), decipher.final()]).toString("utf8");
}

export function isEncryptedTotpSecret(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(TOTP_ENC_PREFIX);
}
