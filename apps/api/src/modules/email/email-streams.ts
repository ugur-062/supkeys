import {
  PREF_KEYED_NOTIFICATION_TYPES,
  prefKeyForType,
  type NotificationPrefKey,
  type PrefKeyedNotificationType,
} from "../../common/notifications/notification-prefs";

/**
 * E-POSTA AKIŞLARI — tek kaynak (2026-09-27, teslim edilebilirlik Faz 0).
 *
 * Her e-posta bir akışa aittir ve akışın KENDİ gönderen adresinden çıkar
 * (ör. `hesap@rothern.com` · `bildirim@rothern.com` · `davet@rothern.com`).
 * Gerekçe: kayıtsız adreslere giden davetler şikâyet alırsa itibar düşüşü o
 * adreste kalır; doğrulama kodu ve şifre sıfırlama e-postaları spam'e sürüklenmez.
 *
 * Akış çağıranın `context.type`inden TÜRETİLİR (çağrı yerlerine dokunmadan):
 *  - kullanıcının kapatabildiği bildirim tipi (tercih anahtarı var):
 *      · alıcının KENDİ işlemi / doğrudan etkileşimi → ACTIVITY
 *      · keşif / pazarlamaya benzeyen (eşleşme, AI önerisi, özet) → NOTIFICATION
 *    (sınıf `NOTIFICATION_EMAIL_CLASS` haritasından)
 *  - kayıtsız adrese davet → INVITE
 *  - `lifecycle_*` (karşılama serisi, özetler) → LIFECYCLE
 *  - geri kalan her şey (kod, şifre, sipariş, kazandırma…) → TRANSACTIONAL
 *
 * NOTIFICATION / INVITE / LIFECYCLE tek tık çıkış başlığı (RFC 8058) ve alt
 * bilgi çıkış bağlantısı taşır; kapsamı `unsubscribeScopeFor` verir.
 *
 * ACTIVITY (sahip kararı 2026-10-05): bildirim e-postaları Gmail'de
 * Promosyonlar sekmesine düşüyordu. Alıcının kendi işlemine dair e-posta
 * (teklifim elendi, talebim kapandı, onay bekliyor…) bülten gibi
 * işaretlenmemeli → `List-Unsubscribe` başlıkları YOK, işlem göndericisinden
 * çıkar (`EMAIL_FROM_ADDRESS_ACTIVITY`, boşsa `EMAIL_FROM_ADDRESS`), alt
 * bilgide yalnız sessiz bir bildirim AYARLARI bağlantısı. Kullanıcının tercihi
 * aynen uygulanır (kapalıysa gönderilmez) ve daha önce bu kapsamdan / "tümü"nden
 * tek tıkla çıkmış adres yine atlanır — çıkış kapısı kapsamı korur.
 */
export type EmailStream = "TRANSACTIONAL" | "ACTIVITY" | "NOTIFICATION" | "INVITE" | "LIFECYCLE";

/** Tüm akışlar (raporlama / gönderici çözümü için sabit sıra). */
export const EMAIL_STREAMS: readonly EmailStream[] = [
  "TRANSACTIONAL",
  "ACTIVITY",
  "NOTIFICATION",
  "INVITE",
  "LIFECYCLE",
];

/** Tercih anahtarlı bildirim tipinin e-posta sınıfı. */
export type NotificationEmailClass = "ACTIVITY" | "DISCOVERY";

/**
 * TERCİH ANAHTARLI HER BİLDİRİM TİPİNİN SINIFI — tek harita (2026-10-05).
 * Tip `Record<PrefKeyedNotificationType, …>`: `notification-prefs.ts`e yeni
 * tip eklenip burada sınıflanmazsa derleme kırılır (kapsama testi de bakar).
 * Emin olunamayan tip DISCOVERY'dir — çıkış başlığını korur (uyum açısından
 * güvenli taraf). `lifecycle_*` tipleri önekle LIFECYCLE akışına gider, bu
 * haritada yer almaz.
 *
 * Tercih anahtarı paylaşımı: DISCOVERY tipindeki tek tık çıkış YALNIZ kendi
 * anahtarını kapatır. Keşif tipleri ACTIVITY tipleriyle anahtar paylaşmaz
 * (`aiInvitation`, `growthNudges` — üstleri `invitation`/`reminder` ana
 * şalterdir: üst kapalıysa keşif türü de gitmez, tersi değil). Paylaşılan
 * kalan anahtarlar (`categoryMatch`, `announcement`, `aiSuggestions`) yalnız
 * DISCOVERY tiplerini kapsar.
 */
export const NOTIFICATION_EMAIL_CLASS: Record<PrefKeyedNotificationType, NotificationEmailClass> = {
  // ── ACTIVITY: alıcının KENDİ işlemi ya da ona DOĞRUDAN yönelen etkileşim ──
  // Alıcının talebi firmasını adıyla davet etti (yayında / sonradan elle).
  listing_invitation: "ACTIVITY",
  // Davet edildiği, henüz teklif vermediği talebin süre hatırlatması.
  listing_reminder: "ACTIVITY",
  // Kendi teklifi elendi / kazanamadı.
  bid_eliminated: "ACTIVITY",
  bid_lost: "ACTIVITY",
  // Teklif verdiği ya da sahibi olduğu talebin kapanması, kapanış zamanının
  // değişmesi, değerlendirmeye alınması.
  listing_closed: "ACTIVITY",
  listing_closed_owner: "ACTIVITY",
  listing_closing_changed: "ACTIVITY",
  listing_evaluation: "ACTIVITY",
  // Talep sahibine: teklif geçerlilikleri doluyor, değerlendirmeyi bitirin.
  listing_evaluation_reminder: "ACTIVITY",
  // Kendi onayını bekleyen talep / işlem.
  approval_pending: "ACTIVITY",

  // ── DISCOVERY: keşif, öneri, özet, duyuru — pazarlamaya benzer ──
  // "Size uygun yeni bir alım talebi" (kategori eşleşmesi) ve akşam özeti.
  listing_category_match: "DISCOVERY",
  listing_category_digest: "DISCOVERY",
  // AI'ın bulduğu ama gösterilmeyen firmaya yükseltme / doğrulama çağrısı.
  listing_ai_match_locked: "DISCOVERY",
  // AI'ın önerdiği firmaya talep daveti, davet özeti ve o davetliye kapanış
  // hatırlatması (davet edilen firma bu ilişkiyi kendisi kurmadı). Talep
  // taslak/embargoluyken eklenen AI davetlisi açılışta da bu tiple duyurulur.
  listing_invitation_ai: "DISCOVERY",
  listing_invitation_digest: "DISCOVERY",
  listing_reminder_ai: "DISCOVERY",
  // Talep sahibine AI tedarikçi önerileri.
  ai_supplier_suggestions: "DISCOVERY",
  // Teklifsiz talep dürtmesi ("AI tedarikçilerini davet edin") — büyüme
  // e-postası (admin büyüme raporu özetlerle birlikte sayar).
  listing_zero_bid: "DISCOVERY",
  // Yönetici segment duyurusu — ticari ileti.
  admin_announcement: "DISCOVERY",
};

/** Tercih anahtarlı tipin sınıfı; haritada yoksa (ör. yeni tip) DISCOVERY. */
export function notificationEmailClass(type: string): NotificationEmailClass {
  return Object.hasOwn(NOTIFICATION_EMAIL_CLASS, type)
    ? NOTIFICATION_EMAIL_CLASS[type as PrefKeyedNotificationType]
    : "DISCOVERY";
}

/** Sınıflanmamış tercih anahtarlı tipler (kapsama testi boş bekler). */
export function unclassifiedPrefKeyedTypes(): string[] {
  return PREF_KEYED_NOTIFICATION_TYPES.filter((t) => !Object.hasOwn(NOTIFICATION_EMAIL_CLASS, t));
}

/** Kayıtsız adrese giden davet bağlam tipleri (soğuk akış). */
export const INVITE_CONTEXT_TYPES: ReadonlySet<string> = new Set([
  "referral_invite",
  "tender_external_invite",
]);

/** Karşılama serisi / özet e-postaları `lifecycle_<ad>` bağlam tipiyle gönderilir. */
export const LIFECYCLE_CONTEXT_PREFIX = "lifecycle_";

/**
 * Akış → gönderen adresi ortam değişkeni. TRANSACTIONAL dışındakiler İSTEĞE
 * BAĞLI: boşsa `EMAIL_FROM_ADDRESS`e düşer (ACTIVITY de — işlem göndericisi).
 */
export const STREAM_SENDER_ENV: Record<EmailStream, string> = {
  TRANSACTIONAL: "EMAIL_FROM_ADDRESS",
  ACTIVITY: "EMAIL_FROM_ADDRESS_ACTIVITY",
  NOTIFICATION: "EMAIL_FROM_ADDRESS_NOTIFICATION",
  INVITE: "EMAIL_FROM_ADDRESS_INVITE",
  LIFECYCLE: "EMAIL_FROM_ADDRESS_LIFECYCLE",
};

/**
 * Akış başına gönderen — saf fonksiyon (EmailService.onModuleInit ve testler).
 * Boş / yalnız boşluk akış değişkeni varsayılan göndericiye düşer.
 */
export function resolveStreamSenders(
  get: (key: string) => string | undefined,
  fromEmail: string,
  fromName?: string,
): Record<EmailStream, { email: string; name?: string }> {
  const out = {} as Record<EmailStream, { email: string; name?: string }>;
  for (const stream of EMAIL_STREAMS) {
    const v = stream === "TRANSACTIONAL" ? "" : (get(STREAM_SENDER_ENV[stream]) ?? "").trim();
    out[stream] = { email: v || fromEmail, name: fromName };
  }
  return out;
}

export function streamForContext(type: string | undefined | null): EmailStream {
  if (!type) return "TRANSACTIONAL";
  if (INVITE_CONTEXT_TYPES.has(type)) return "INVITE";
  if (type.startsWith(LIFECYCLE_CONTEXT_PREFIX)) return "LIFECYCLE";
  if (prefKeyForType(type)) {
    return notificationEmailClass(type) === "ACTIVITY" ? "ACTIVITY" : "NOTIFICATION";
  }
  return "TRANSACTIONAL";
}

/**
 * Akış tek tık çıkış başlıklarını (`List-Unsubscribe` + `-Post`) ve alt bilgi
 * çıkış bağlantısını taşır mı? İşlem ve ACTIVITY e-postaları taşımaz.
 */
export function carriesOneClickUnsubscribe(stream: EmailStream): boolean {
  return stream === "NOTIFICATION" || stream === "INVITE" || stream === "LIFECYCLE";
}

/**
 * Çıkış (opt-out) kapsamı — gönderim kapısı bu kapsama ve "all"a bakar:
 *  - bildirim tercih anahtarı (`categoryMatch`…) — yalnız o tür kapanır.
 *    ACTIVITY tipinde de dolu: başlık/bağlantı basılmaz (bkz.
 *    `carriesOneClickUnsubscribe`) ama daha önce çıkmış adres yine atlanır.
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
  if (stream === "NOTIFICATION" || stream === "ACTIVITY") return prefKeyForType(type);
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
