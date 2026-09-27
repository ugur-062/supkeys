/**
 * Bildirim tercihleri — TEK kaynak. Her e-posta bildirimi bir `type` etiketiyle
 * gönderilir; bu etiket bir tercih anahtarına eşlenir. Anahtarı olmayan tipler
 * TRANSACTIONAL'dır (kapatılamaz — her zaman gönderilir).
 *
 * Tercihler kullanıcı başına `CompanyUser.notificationPrefs` (Json) içinde
 * tutulur; `{ [prefKey]: boolean }`. Ayarlanmamışsa varsayılan AÇIK.
 */

/** Kullanıcının kapatabileceği bildirim tercih anahtarları. */
export const NOTIFICATION_PREF_KEYS = [
  "invitation",
  "reminder",
  "bidElimination",
  "listingClosed",
  "categoryMatch",
  "approvalPending",
  // Platform duyuruları (denetim 2026-08-26 Parça 9 #15): admin segment
  // duyurusu (`admin_announcement`) tercih haritasında HİÇ yoktu → bu
  // dosyanın kuralı gereği TRANSACTIONAL (kapatılamaz) sayılıyordu. Oysa
  // tier/ülke segmentli duyuru ticari ilettir; kullanıcı kapatabilmeli.
  "announcement",
  // AI tedarikçi önerileri (2026-09-27, Faz 1): yayın sonrası otomatik keşif
  // "N tedarikçi bulundu, tek tıkla davet et" — talebi açan kişiye.
  "aiSuggestions",
  // Karşılama serisi + haftalık görünürlük özeti (LIFECYCLE akışı, Faz 2) —
  // `lifecycle_*` bağlam tipleri bu anahtara düşer.
  "lifecycle",
] as const;

/**
 * Tür OLMAYAN tercih BAYRAKLARI (varsayılan KAPALI) — aynı JSON'da saklanır.
 * `categoryMatchInstant`: kategori e-postalarının hepsi anında (kapalıyken
 * günde 3 anında, fazlası akşam özeti — Faz 2).
 */
export const NOTIFICATION_FLAG_KEYS = ["categoryMatchInstant"] as const;

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

/**
 * Bildirim `type` etiketi → tercih anahtarı. `null` = transactional (kapatılamaz):
 * password_reset, referral_invite, bid_awarded, order_status_changed.
 */
const PREF_KEY_BY_TYPE: Record<string, NotificationPrefKey | undefined> = {
  listing_invitation: "invitation",
  listing_reminder: "reminder",
  bid_eliminated: "bidElimination",
  bid_lost: "bidElimination",
  listing_closed: "listingClosed",
  listing_closed_owner: "listingClosed",
  // Kapanış zamanı değişikliği (uzatma/öne çekme) kapanış ailesindendir.
  listing_closing_changed: "listingClosed",
  // Değerlendirmeye alınma sinyali kapanış ailesindendir (aynı tercih anahtarı).
  listing_evaluation: "listingClosed",
  // Değerlendirme uzarken "teklif geçerlilikleri doluyor" sahip hatırlatması.
  listing_evaluation_reminder: "reminder",
  listing_category_match: "categoryMatch",
  approval_pending: "approvalPending",
  admin_announcement: "announcement",
  ai_supplier_suggestions: "aiSuggestions",
  // Faz 2: akşam özeti kategori tercihine, teklifsiz talep hatırlatmalara bağlı.
  listing_category_digest: "categoryMatch",
  listing_zero_bid: "reminder",
  // Aşağıdakiler bilinçli olarak listelenmez → transactional:
  //   password_reset, referral_invite, bid_awarded, order_status_changed
};

type Prefs = Record<string, boolean> | null | undefined;

/**
 * Bu bildirim, alıcının tercihlerine göre gönderilmeli mi?
 * - Transactional tip (anahtarı yok) → her zaman true.
 * - Aksi halde tercih açıkça false değilse true (varsayılan açık).
 */
export function isNotificationEnabled(prefs: Prefs, type: string): boolean {
  const key = prefKeyForType(type);
  if (!key) return true; // transactional
  return prefs?.[key] !== false;
}

/** Bildirim tipinin tercih anahtarı; transactional tipte `null`. */
export function prefKeyForType(type: string | undefined | null): NotificationPrefKey | null {
  if (!type) return null;
  if (type.startsWith("lifecycle_")) return "lifecycle";
  return PREF_KEY_BY_TYPE[type] ?? null;
}

export function isNotificationPrefKey(v: unknown): v is NotificationPrefKey {
  return typeof v === "string" && (NOTIFICATION_PREF_KEYS as readonly string[]).includes(v);
}

/** Bir tip transactional (kapatılamaz) mı? */
export function isTransactionalNotification(type: string): boolean {
  return !prefKeyForType(type);
}
