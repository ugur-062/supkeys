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
  // KEŞİF ALT TERCİHLERİ (e-posta akışları 2026-10-05, inceleme): ACTIVITY ve
  // DISCOVERY tipleri aynı anahtarı paylaşınca keşif e-postasındaki tek tık
  // çıkış (ör. AI daveti) çıkış bağlantısı taşımayan kendi işlem e-postasını
  // (alıcının adıyla davet, teklif geçerliliği hatırlatması) da sessizce
  // kapatıyordu. Keşif tipleri artık kendi anahtarında; üst anahtar
  // (`PREF_KEY_PARENT`) hâlâ ana şalterdir — kapalıysa alt tür de gitmez
  // (önceden kapatmış kullanıcı yeniden e-posta almaya başlamaz).
  //  - `aiInvitation`: AI'ın önerdiği firmaya talep daveti, özeti, hatırlatması
  //  - `growthNudges`: teklifsiz talep dürtmesi (talep sahibine)
  "aiInvitation",
  "growthNudges",
] as const;

/**
 * Tür OLMAYAN tercih BAYRAKLARI (varsayılan KAPALI) — aynı JSON'da saklanır.
 * `categoryMatchInstant`: kategori e-postalarının hepsi anında (kapalıyken
 * günde 3 anında, fazlası akşam özeti — Faz 2).
 */
export const NOTIFICATION_FLAG_KEYS = ["categoryMatchInstant"] as const;

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

/**
 * Alt tercih → üst (ana şalter) tercih. Üst kapalıysa alt türün e-postası da
 * gitmez; alttan çıkmak üstü etkilemez. Ayarlar ekranı alt satırı üst
 * kapalıyken pasif gösterir (web `NOTIFICATION_PREFS.parent`).
 */
export const PREF_KEY_PARENT: Partial<Record<NotificationPrefKey, NotificationPrefKey>> = {
  aiInvitation: "invitation",
  growthNudges: "reminder",
};

/**
 * Bildirim `type` etiketi → tercih anahtarı. `null` = transactional (kapatılamaz):
 * password_reset, referral_invite, bid_awarded, order_status_changed.
 */
const PREF_KEY_BY_TYPE = {
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
  // AI'ın bulduğu ama alıcıya gösterilmeyen ücretsiz firmaya Silver/doğrulama çağrısı.
  listing_ai_match_locked: "categoryMatch",
  // AI'ın önerdiği üyeye doğrudan talep daveti (+ akşam özeti) ve o davetliye
  // kapanış hatırlatması — AI daveti alt tercihi (üstü: `invitation`).
  listing_invitation_ai: "aiInvitation",
  listing_invitation_digest: "aiInvitation",
  listing_reminder_ai: "aiInvitation",
  // Teklifsiz talep dürtmesi — büyüme alt tercihi (üstü: `reminder`).
  listing_zero_bid: "growthNudges",
  // Aşağıdakiler bilinçli olarak listelenmez → transactional:
  //   password_reset, referral_invite, bid_awarded, order_status_changed
} as const satisfies Record<string, NotificationPrefKey>;

/**
 * Tercih anahtarı olan (kullanıcının kapatabildiği) bildirim tipleri. E-posta
 * akış sınıflaması (`email-streams.ts` `NOTIFICATION_EMAIL_CLASS`) bu tiplerin
 * HER BİRİNİ kapsamak zorundadır — tip sistemi ve kapsama testi zorlar.
 * `lifecycle_*` önekli tipler burada değil (önekle `lifecycle` anahtarına düşer).
 */
export type PrefKeyedNotificationType = keyof typeof PREF_KEY_BY_TYPE;
export const PREF_KEYED_NOTIFICATION_TYPES = Object.keys(PREF_KEY_BY_TYPE) as PrefKeyedNotificationType[];

/**
 * Tipe özgü EK kapı anahtarları: AI davetlisine hatırlatma bir hatırlatmadır
 * da — "hatırlatmalar" kapalıysa o da gitmez (eskiden `reminder`a bağlıydı).
 */
const EXTRA_GATE_KEYS_BY_TYPE: Partial<Record<PrefKeyedNotificationType, readonly NotificationPrefKey[]>> = {
  listing_reminder_ai: ["reminder"],
};

type Prefs = Record<string, boolean> | null | undefined;

/** Anahtar + varsa üst anahtarı (alt tercihin ana şalteri). */
export function prefKeyWithParent(key: NotificationPrefKey): NotificationPrefKey[] {
  const parent = PREF_KEY_PARENT[key];
  return parent ? [key, parent] : [key];
}

/**
 * Bu tipi KAPATAN tercih anahtarlarının hepsi (kendi + üst + tipe özgü ek);
 * biri kapalıysa / o kapsamdan çıkılmışsa gönderilmez. Transactional tipte [].
 */
export function gatingPrefKeysForType(type: string | undefined | null): NotificationPrefKey[] {
  const key = prefKeyForType(type);
  if (!key) return [];
  const extra = Object.hasOwn(EXTRA_GATE_KEYS_BY_TYPE, type!)
    ? (EXTRA_GATE_KEYS_BY_TYPE[type as PrefKeyedNotificationType] ?? [])
    : [];
  return [...new Set([...prefKeyWithParent(key), ...extra])];
}

/**
 * Bu bildirim, alıcının tercihlerine göre gönderilmeli mi?
 * - Transactional tip (anahtarı yok) → her zaman true.
 * - Aksi halde kapı anahtarlarından (kendi + üst + ek) hiçbiri açıkça false
 *   değilse true (varsayılan açık).
 */
export function isNotificationEnabled(prefs: Prefs, type: string): boolean {
  return gatingPrefKeysForType(type).every((k) => prefs?.[k] !== false);
}

/** Bildirim tipinin tercih anahtarı; transactional tipte `null`. */
export function prefKeyForType(type: string | undefined | null): NotificationPrefKey | null {
  if (!type) return null;
  if (type.startsWith("lifecycle_")) return "lifecycle";
  // Yalnız kendi anahtarı: "constructor" gibi prototip adları tercih sayılmaz.
  return Object.hasOwn(PREF_KEY_BY_TYPE, type)
    ? (PREF_KEY_BY_TYPE as Record<string, NotificationPrefKey>)[type]!
    : null;
}

export function isNotificationPrefKey(v: unknown): v is NotificationPrefKey {
  return typeof v === "string" && (NOTIFICATION_PREF_KEYS as readonly string[]).includes(v);
}

/** Bir tip transactional (kapatılamaz) mı? */
export function isTransactionalNotification(type: string): boolean {
  return !prefKeyForType(type);
}
