import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { isLocale, type Locale } from "@rothern/i18n";
import { isNotificationPrefKey } from "../../common/notifications/notification-prefs";
import type { UnsubscribeScope } from "./email-streams";

/**
 * TEK TIK ÇIKIŞ JETONU — şifreli + doğrulamalı, veritabanı satırı gerektirmez
 * (2026-09-27). Jeton adresi, kapsamı ve e-postanın dilini taşır.
 * Anahtar `JWT_SECRET`ten AYRI bir etiketle türetilir (yeni ortam değişkeni
 * yok — unutulan değişken ya kapıyı gevşetir ya da açılışı keserdi; oturum
 * jetonuyla aynı anahtarı doğrudan paylaşmaz). Süresi yoktur: çıkış bağlantısı
 * aylar sonra açılsa da çalışmalı (ETK ret hakkı). `JWT_SECRET` döndürülürse
 * eski bağlantılar geçersizleşir — sayfa kullanıcıyı ayarlara yönlendirir.
 */
export interface UnsubscribePayload {
  email: string;
  scope: UnsubscribeScope;
  locale: Locale;
}

const VERSION = "u1";
const KEY_LABEL = "rothern:email-unsubscribe:v1";
const IV_LEN = 12;
const TAG_LEN = 16;

function derivedKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

export function isUnsubscribeScope(v: unknown): v is UnsubscribeScope {
  return v === "invite" || v === "lifecycle" || v === "all" || isNotificationPrefKey(v);
}

/**
 * AES-256-GCM (kimlik doğrulamalı şifreleme): jeton hem sahteciliğe kapalı
 * hem de İÇİ OKUNMAZ — bağlantı günlüğe düşse ya da iletilse adres görünmez.
 */
export function signUnsubscribeToken(p: UnsubscribePayload, secret: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(secret), iv);
  const plain = Buffer.from(JSON.stringify([VERSION, p.email.trim().toLowerCase(), p.scope, p.locale]));
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, enc, cipher.getAuthTag()]).toString("base64url");
}

/** Geçersiz/bozuk/değiştirilmiş jeton → `null` (hata ayrıntısı sızdırılmaz). */
export function verifyUnsubscribeToken(
  token: string | undefined | null,
  secret: string,
): UnsubscribePayload | null {
  if (!token || token.length > 2_000 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= IV_LEN + TAG_LEN) return null;
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(raw.length - TAG_LEN);
    const enc = raw.subarray(IV_LEN, raw.length - TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(secret), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    const parsed: unknown = JSON.parse(plain);
    if (!Array.isArray(parsed) || parsed[0] !== VERSION) return null;
    const [, email, scope, locale] = parsed as [string, unknown, unknown, unknown];
    if (typeof email !== "string" || !email.includes("@")) return null;
    if (!isUnsubscribeScope(scope)) return null;
    return { email, scope, locale: isLocale(locale) ? locale : "tr" };
  } catch {
    return null;
  }
}
