import { prefKeyForType, type NotificationPrefKey } from "../../common/notifications/notification-prefs";

/**
 * E-POSTA AKIŞLARI — tek kaynak (2026-09-27, teslim edilebilirlik Faz 0).
 *
 * Her e-posta bir akışa aittir ve akışın KENDİ gönderen adresinden çıkar
 * (ör. `notification@rothern.com` · `talep@updates.rothern.com` ·
 * `davet@invite.rothern.com`). Gerekçe: kayıtsız adreslere giden davetler
 * şikâyet alırsa itibar düşüşü o alt alan adında kalır; doğrulama kodu ve
 * şifre sıfırlama e-postaları spam'e sürüklenmez.
 *
 * Akış çağıranın `context.type`inden TÜRETİLİR (çağrı yerlerine dokunmadan):
 *  - kullanıcının kapatabildiği bildirim tipi (tercih anahtarı var) → NOTIFICATION
 *  - kayıtsız adrese davet → INVITE
 *  - `lifecycle_*` (karşılama serisi, özetler) → LIFECYCLE
 *  - geri kalan her şey (kod, şifre, sipariş, kazandırma…) → TRANSACTIONAL
 *
 * İşlem DIŞI her akış tek tık çıkış başlığı (RFC 8058) ve alt bilgi bağlantısı
 * taşır; kapsamı `unsubscribeScopeFor` verir.
 */
export type EmailStream = "TRANSACTIONAL" | "NOTIFICATION" | "INVITE" | "LIFECYCLE";

/** Kayıtsız adrese giden davet bağlam tipleri (soğuk akış). */
export const INVITE_CONTEXT_TYPES: ReadonlySet<string> = new Set([
  "referral_invite",
  "tender_external_invite",
]);

/** Karşılama serisi / özet e-postaları `lifecycle_<ad>` bağlam tipiyle gönderilir. */
export const LIFECYCLE_CONTEXT_PREFIX = "lifecycle_";

/** Akış → gönderen adresi ortam değişkeni (boşsa `EMAIL_FROM_ADDRESS`). */
export const STREAM_SENDER_ENV: Record<EmailStream, string> = {
  TRANSACTIONAL: "EMAIL_FROM_ADDRESS",
  NOTIFICATION: "EMAIL_FROM_ADDRESS_NOTIFICATION",
  INVITE: "EMAIL_FROM_ADDRESS_INVITE",
  LIFECYCLE: "EMAIL_FROM_ADDRESS_LIFECYCLE",
};

export function streamForContext(type: string | undefined | null): EmailStream {
  if (!type) return "TRANSACTIONAL";
  if (INVITE_CONTEXT_TYPES.has(type)) return "INVITE";
  if (type.startsWith(LIFECYCLE_CONTEXT_PREFIX)) return "LIFECYCLE";
  if (prefKeyForType(type)) return "NOTIFICATION";
  return "TRANSACTIONAL";
}

/**
 * Tek tık çıkış kapsamı:
 *  - bildirim tercih anahtarı (`categoryMatch`…) — yalnız o tür kapanır
 *  - `invite` — kayıtsız adrese davetler (ReferralOptOut'a yazılır)
 *  - `lifecycle` — karşılama serisi/özetler
 *  - `all` — işlem dışı her şey (çıkış sayfasındaki geniş seçenek)
 * İşlem e-postasında `null` (çıkış yok).
 */
export type UnsubscribeScope = NotificationPrefKey | "invite" | "lifecycle" | "all";

export function unsubscribeScopeFor(type: string | undefined | null): UnsubscribeScope | null {
  const stream = streamForContext(type);
  if (stream === "INVITE") return "invite";
  if (stream === "LIFECYCLE") return "lifecycle";
  if (stream === "NOTIFICATION") return prefKeyForType(type);
  return null;
}

/**
 * ÜYE OLMAYAN adrese giden İŞLEM e-postaları (derin denetim boşluk taraması
 * GA2): ekip daveti adresi davet eden firmadan gelir, misafir bilgi talebi
 * doğrulaması kayıtsız ziyaretçiye gider. Çıkış bağlantısı taşımazlar ama ilk
 * temas bunlardır → KVKK aydınlatma bağlantısı basılır (KVKK m. 10; güvenli
 * taraf — avukat teyidi bekliyor).
 */
export const PRIVACY_NOTICE_TRANSACTIONAL_CONTEXT_TYPES: ReadonlySet<string> = new Set([
  "company_user_invitation",
  "public_inquiry_verify",
]);

/**
 * Alt bilgide KVKK aydınlatma bağlantısı olmalı mı? İşlem dışı her akış
 * (çıkış bağlantısıyla birlikte) + üye olmayan adrese giden işlem e-postaları.
 */
export function privacyNoticeFor(type: string | undefined | null): boolean {
  if (streamForContext(type) !== "TRANSACTIONAL") return true;
  return !!type && PRIVACY_NOTICE_TRANSACTIONAL_CONTEXT_TYPES.has(type);
}
