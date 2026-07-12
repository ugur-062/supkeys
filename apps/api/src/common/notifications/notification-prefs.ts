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
] as const;

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
  // Değerlendirmeye alınma sinyali kapanış ailesindendir (aynı tercih anahtarı).
  listing_evaluation: "listingClosed",
  // Değerlendirme uzarken "teklif geçerlilikleri doluyor" sahip hatırlatması.
  listing_evaluation_reminder: "reminder",
  listing_category_match: "categoryMatch",
  approval_pending: "approvalPending",
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
  const key = PREF_KEY_BY_TYPE[type];
  if (!key) return true; // transactional
  return prefs?.[key] !== false;
}

/** Bir tip transactional (kapatılamaz) mı? */
export function isTransactionalNotification(type: string): boolean {
  return !PREF_KEY_BY_TYPE[type];
}
