/**
 * Denetim kaydı satır biçimleyicisi — Denetim Kaydı sayfası, firma detayının
 * Denetim sekmesi ve Güvenlik sayfası AYNI sözlükleri kullanır. Eskiden firma
 * sekmesi ham eylem kodu, ham aktör tipi ve ham JSON basıyordu (arayüz testi
 * O-047); genel sayfa da varlık ve detay sütununda ham kod gösteriyordu
 * (D-016). Bilinmeyen anahtar/değer ham haliyle görünür (bilgi kaybolmaz).
 *
 * Yeniden doğrulama (webC-14): iç kimlikler (`listingId`, `sessionId`, …),
 * depolama yolları (`keys`), ISO zaman damgaları ve kaynak/eylem kodları
 * (`AI_AUTO`, `send_invites`) artık okunur yazılır: kimlikler gizlenir (varlık
 * sütunu kaydın nesnesini zaten gösterir), tarihler İstanbul biçiminde,
 * belge türleri ve değişen alanlar Türkçe adla.
 */

import { countryName } from "./country";
import { safeFormat } from "./date";
import { EMAIL_TEMPLATE_LABELS } from "./email-logs/status";
import { BID_STATUS, LISTING_STATUS, ORDER_STATUS, PAYMENT_STATUS } from "./status-labels";
import {
  ADMIN_ROLE_LABEL,
  COMPANY_PERMISSION_LABEL,
  COMPANY_ROLE_LABEL,
  COMPLAINT_STATUS_META,
  CONNECTION_STATUS_META,
  DOC_STATUS_META,
  ENTITY_TYPE_LABEL,
  TIER_LABEL,
  VERIFY_META,
  type BadgeColor,
} from "./terms";

// ── Aktör ──
export const ACTOR_META: Record<string, { label: string; color: BadgeColor }> = {
  admin: { label: "Admin", color: "blue" },
  company: { label: "Firma", color: "green" },
  // Eski aktör tipleri — yalnız geçmiş satırlar; süzgeçte sunulmaz.
  tenant: { label: "Alıcı", color: "green" },
  supplier: { label: "Tedarikçi", color: "amber" },
  system: { label: "Sistem", color: "zinc" },
};

export function actorMeta(type: string | null | undefined): {
  label: string;
  color: BadgeColor;
} {
  return (type && ACTOR_META[type]) || { label: type || "—", color: "zinc" };
}

// ── Varlık ──
/** Varlık türü etiketi — API bazı yerlerde büyük harf yazar ("COMPANY"). */
export function entityTypeLabel(type: string): string {
  return ENTITY_TYPE_LABEL[type] ?? ENTITY_TYPE_LABEL[type.toLowerCase()] ?? type;
}

// ── Başarısız giriş (auth.login_failed) ──
export const LOGIN_FAIL_REASON_LABEL: Record<string, string> = {
  bad_credentials: "Hatalı e-posta veya şifre",
  bad_2fa: "Hatalı doğrulama kodu (2FA)",
  bad_2fa_code: "Hatalı doğrulama kodu (2FA)",
  "2fa_locked": "2FA çok fazla hatalı deneme — kilitli",
  user_missing: "Kullanıcı bulunamadı",
  user_inactive: "Kullanıcı pasif",
  inactive_or_missing: "Hesap pasif ya da yok",
  company_blocked: "Firma askıda",
  company_inactive: "Firma pasif",
  email_unverified: "E-posta doğrulanmamış",
};

export const PORTAL_LABEL: Record<string, string> = {
  admin: "Admin paneli",
  company: "Firma paneli",
  satinalma: "Satın alma paneli",
};

// ── Detay (metadata) ──
const KEY_LABEL: Record<string, string> = {
  from: "önce",
  to: "sonra",
  before: "önce",
  after: "sonra",
  status: "durum",
  statusBefore: "önceki durum",
  reason: "gerekçe",
  note: "not",
  portal: "portal",
  tier: "paket",
  months: "ay",
  role: "rol",
  roles: "roller",
  rolesBefore: "önceki roller",
  rolesAfter: "yeni roller",
  previousRoles: "önceki roller",
  requestedRoles: "istenen roller",
  targetRoles: "hedef roller",
  attemptedRoles: "denenen roller",
  permissions: "izinler",
  email: "e-posta",
  toEmail: "alıcı e-posta",
  name: "ad",
  title: "başlık",
  subject: "konu",
  type: "tür",
  kind: "tür",
  listingType: "ilan türü",
  listingNumber: "ilan no",
  orderNumber: "sipariş no",
  invoiceNumber: "fatura no",
  amount: "tutar",
  currency: "para birimi",
  changedFields: "değişen alanlar",
  kycFields: "doğrulama alanları",
  fileName: "dosya",
  source: "kaynak",
  via: "kanal",
  isFinal: "son adım",
  isDefault: "varsayılan",
  isPublic: "herkese açık",
  wasPublic: "önceden herkese açık",
  visibility: "görünürlük",
  bankName: "banka",
  ibanMasked: "IBAN",
  ibanMaskedAfter: "yeni IBAN",
  added: "eklenen",
  removed: "çıkarılan",
  queued: "kuyruğa alınan",
  skipped: "atlanan",
  sent: "gönderilen",
  delivered: "iletilen",
  targets: "hedef",
  round: "tur",
  fromRound: "önceki tur",
  toRound: "yeni tur",
  additionalDays: "ek gün",
  validityDays: "geçerlilik (gün)",
  validUntil: "geçerlilik sonu",
  expectedDeliveryDate: "beklenen teslim",
  country: "ülke",
  countryCode: "ülke",
  vatNumber: "VAT no",
  valid: "geçerli",
  active: "aktif",
  wasActive: "önceden aktif",
  suspend: "askı",
  stepOrder: "adım sırası",
  stepCount: "adım sayısı",
  itemCount: "kalem sayısı",
  actionType: "eylem türü",
  sellerReason: "satıcı gerekçesi",
  buyerReason: "alıcı gerekçesi",
  rate: "kur",
  date: "tarih",
  // Yeniden doğrulama (webC-14) — denetim kayıtlarında görülen kalan anahtarlar.
  version: "sürüm",
  submitCount: "gönderim sayısı",
  resubmission: "yeniden gönderim",
  closesAt: "kapanış",
  keys: "belgeler",
  decisions: "kararlar",
  rejected: "red var",
  changes: "değişiklikler",
  // Gönderimde onaylı olmayan (incelemeye giren) belgeler — ilk gönderimde de
  // dolu; "yeniden istenen" ilk başvuruyu yanlış anlatıyordu (son tur).
  resetDocs: "incelemeye gönderilen belgeler",
  revived: "yeniden canlandı",
  rowCounts: "kayıt sayıları",
  rothernId: "Rothern kodu",
  retainedBecause: "saklama nedeni",
  bulk: "toplu",
  reReview: "yeniden inceleme",
  code: "kod",
  slug: "profil adresi",
  entities: "kayıt",
  enabled: "açık",
  enqueued: "kuyruğa alınan",
  started: "başladı",
  failed: "başarısız",
  truncated: "kesildi",
  emailQueued: "kuyruğa alınan e-posta",
  body: "metin",
  setupEmailSent: "kurulum e-postası gönderildi",
  twoFactorSetupRequired: "2FA kurulumu gerekli",
  bidAmount: "teklif tutarı",
  bidCurrency: "teklif para birimi",
  newBidStatus: "yeni teklif durumu",
  previousBidStatus: "önceki teklif durumu",
  byItem: "kalem bazında",
  viaApproval: "onay akışıyla",
  lost: "kaybeden",
  reopened: "yeniden açıldı",
  restored: "geri alınan",
  carryBids: "teklif aktarımı",
  eliminateNonBidders: "teklif vermeyenler elendi",
  newFormat: "yeni biçim",
  needed: "gerekli yetki",
  invited: "davet edilen",
  autoCompleted: "otomatik tamamlandı",
  unavailable: "servis yanıt vermedi",
  address: "adres",
  template: "şablon",
  droppedGroups: "kapanan alanlar",
  roleChanges: "rol değişiklikleri",
  labelChanges: "etiket değişiklikleri",
  droppedCount: "kapanan",
  keptCount: "kalan",
  limit: "sınır",
  usingSearch: "web aramasıyla",
  website: "web sitesi",
  query: "sorgu",
  success: "başarılı",
  origin: "kaynak",
  listingLeftWithoutLiveOrder: "ilan canlı siparişsiz kaldı",
  previousOwnerRoles: "önceki sahibin rolleri",
  city: "şehir",
  // Son tur (webC-4) — iç içe sayım nesneleri (KVKK dökümü `rowCounts`,
  // anonimleştirme `retainedBecause`) ve zaman tasarrufu ayarları.
  users: "kullanıcı",
  listings: "ilan",
  // Çeviri doldurma (`admin.system.translation_backfill` → `enqueued`).
  products: "ürün",
  companies: "firma",
  bidsPlaced: "verilen teklif",
  ordersAsBuyer: "alım siparişi",
  ordersAsSeller: "satış siparişi",
  bankAccounts: "banka hesabı",
  adminNotes: "admin notu",
  messagesSent: "gönderilen mesaj",
  reviewsGiven: "verilen değerlendirme",
  reviewsReceived: "alınan değerlendirme",
  complaintsMade: "yaptığı şikayet",
  complaintsReceived: "hakkındaki şikayet",
  membershipEvents: "üyelik kaydı",
  threadsAsBuyer: "alıcı yazışması",
  threadsAsSeller: "satıcı yazışması",
  listingInvitations: "talep daveti",
  publicInquiries: "bilgi talebi",
  rfqMailPrepMin: "RFQ maili (dk)",
  followupMin: "hatırlatma (dk)",
  bidToExcelMin: "teklif→Excel (dk)",
  bidItemFactor: "kalem katsayısı",
  comparisonTableMin: "karşılaştırma tablosu (dk)",
  revisionRoundMin: "revizyon turu (dk)",
  approvalLoopMin: "onay döngüsü (dk)",
  poPrepMin: "PO hazırlama (dk)",
  hourlyLaborCost: "saatlik maliyet (₺)",
  targetCountries: "hedef ülkeler",
  bankCountry: "banka ülkesi",
};

/**
 * Detayda GÖSTERİLMEYEN anahtarlar: iç kimlikler (cuid/uuid) yöneticiye bilgi
 * vermez, satırın nesnesi varlık sütunundadır. `rothernId` firmanın herkese
 * açık kodudur — görünür kalır.
 */
const HIDDEN_KEYS = new Set(["dedupeKey"]);
function isHiddenKey(k: string): boolean {
  if (k === "rothernId") return false;
  return HIDDEN_KEYS.has(k) || /[a-z](Id|Ids)$/.test(k);
}

/** Firma doğrulama belgeleri (admin Belgeler sekmesiyle aynı adlar). */
const DOC_KIND_LABEL: Record<string, string> = {
  taxPlate: "Vergi levhası",
  tradeRegistry: "Ticaret sicil gazetesi",
  signatureCircular: "İmza sirküleri",
  activityCert: "Faaliyet belgesi",
  idFront: "Yetkili kimlik (ön)",
  idBack: "Yetkili kimlik (arka)",
};

/** İlan belgesi türleri (web `listingDocKind` ile aynı adlar). */
const LISTING_DOC_KIND_LABEL: Record<string, string> = {
  IDARI_SARTNAME: "İdari şartname",
  TEKNIK_SARTNAME: "Teknik şartname",
  SOZLESME: "Sözleşme taslağı",
  EK: "Ek / çizim",
  NUMUNE: "Numune / görsel",
  DIGER: "Diğer",
};

/** Anahtara özgü değer sözlükleri — kaynak, kanal, AI eylem türü vb. kodlar. */
const VALUE_BY_KEY: Record<string, Record<string, string>> = {
  source: {
    MANUAL: "Elle",
    manual: "Elle",
    AI_FORM: "AI (talep formu)",
    AI_AUTO: "AI (otomatik)",
    onboarding: "Kayıt sırasında",
    letter_of_credit: "Akreditif",
  },
  via: { ai_assistant: "AI asistan", complaint: "Şikayet" },
  actionType: {
    send_invites: "Davet gönderme",
    publish_tender: "Talep yayınlama",
    eliminate_bid: "Teklif eleme",
    award_tender: "Kazanan seçme",
    place_bid: "Teklif verme",
    mark_order_received: "Teslim alındı işaretleme",
  },
  origin: { INVITE: "Davet", PREMIUM: "Premium keşif", ADMIN: "Platform" },
  carryBids: { AUTO: "Otomatik", LAZY: "Tedarikçi onayıyla", NONE: "Aktarılmaz" },
  visibility: {
    PUBLIC: "Herkese açık",
    CONNECTIONS: "Bağlantılara açık",
    PRIVATE: "Yalnız davetliler",
  },
  template: EMAIL_TEMPLATE_LABELS,
  droppedGroups: { buy: "satınalma", sell: "satış" },
  newFormat: { RFQ: "Teklif toplama (kapalı zarf)", ENGLISH_AUCTION: "Açık eksiltme" },
  kind: { ...DOC_KIND_LABEL, ...LISTING_DOC_KIND_LABEL },
  tier: { all: "Tümü" },
  reason: {
    seat_selection: "Koltuk seçimi",
    missing_permission: "Yetki eksik",
    not_admin: "Yönetici değil",
    not_admin_grant: "Yönetici olmayan yetki veremez",
    not_creator: "Talebi açan kişi değil",
    // Kategori/nitelik çeviri doldurma başlamadığında (API kodu; eski satırlar
    // İngilizce cümle yazıyordu — webC-4).
    provider_not_configured: "Çeviri sağlayıcısı yapılandırılmamış",
    already_running: "Zaten çalışıyor",
    "translation provider not configured": "Çeviri sağlayıcısı yapılandırılmamış",
    "already running": "Zaten çalışıyor",
  },
};

/** ISO ülke kodu taşıyan anahtarlar — Türkçe ülke adıyla yazılır. */
const COUNTRY_KEYS = new Set(["country", "countryCode", "bankCountry", "targetCountries"]);

/** Takvim günü taşıyan anahtarlar — saat gösterilmez. */
const DATE_ONLY_KEYS = new Set(["expectedDeliveryDate", "date"]);
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatDateValue(key: string, v: string): string | null {
  if (ISO_DATE.test(v) || (DATE_ONLY_KEYS.has(key) && ISO_DATE_TIME.test(v))) {
    // Takvim günü UTC bileşenlerinden okunur (gece yarısı UTC = o gün).
    const d = new Date(ISO_DATE.test(v) ? `${v}T00:00:00Z` : v);
    if (Number.isNaN(d.getTime())) return null;
    return safeFormat(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), "d MMM yyyy", "") || null;
  }
  if (ISO_DATE_TIME.test(v)) return safeFormat(v, "d MMM yyyy HH:mm", "") || null;
  return null;
}

/** Değişen alan adları (changedFields/kycFields değerleri). */
const FIELD_LABEL: Record<string, string> = {
  name: "ad",
  legalName: "ticari unvan",
  description: "açıklama",
  website: "web sitesi",
  phone: "telefon",
  email: "e-posta",
  firstName: "ad",
  lastName: "soyad",
  country: "ülke",
  stateRegion: "bölge",
  city: "şehir",
  cityId: "şehir",
  district: "ilçe",
  addressLine: "adres",
  postalCode: "posta kodu",
  taxNumber: "vergi no",
  taxOffice: "vergi dairesi",
  mersisNo: "MERSİS no",
  tradeRegistryNo: "ticaret sicil no",
  iban: "IBAN",
  ibanHolder: "IBAN sahibi",
  accountHolder: "hesap sahibi",
  accountNumber: "hesap no",
  bankName: "banka",
  bankSwiftBic: "SWIFT/BIC",
  swiftBic: "SWIFT/BIC",
  bankCountry: "banka ülkesi",
  title: "başlık",
  type: "tür",
  isDefault: "varsayılan",
  contactName: "yetkili",
  logoUrl: "logo",
  coverUrl: "kapak görseli",
  sectors: "sektörler",
  categoryIds: "kategoriler",
  employeeCount: "çalışan sayısı",
  foundedYear: "kuruluş yılı",
  industry: "sektör",
  billingEmail: "fatura e-postası",
  aboutText: "hakkında",
  activities: "faaliyetler",
  services: "hizmetler",
  buyerCategoryIds: "alım kategorileri",
  buyerSubCategoryIds: "alım alt kategorileri",
  sellerCategoryIds: "satış kategorileri",
  sellerSubCategoryIds: "satış alt kategorileri",
  coverImageUrl: "kapak görseli",
  instagramUrl: "Instagram",
  linkedinUrl: "LinkedIn",
  kepAddress: "KEP adresi",
  publicEnabled: "herkese açık profil",
  slug: "profil adresi",
  visitsVisible: "ziyaret sayısı görünür",
  // Talep varsayılanları (company.request_defaults.updated)
  advancePercent: "avans oranı",
  allowedCurrencies: "izinli para birimleri",
  bidVisibility: "teklif görünürlüğü",
  billingSameAsDelivery: "fatura adresi teslimatla aynı",
  closeDays: "kapanış süresi (gün)",
  deliveryAddressId: "teslim adresi",
  deliveryTerm: "teslim şekli",
  isInternational: "uluslararası",
  isSealedBid: "kapalı zarf (eski ayar)",
  lcType: "akreditif türü",
  paymentCategory: "ödeme şekli",
  paymentDays: "vade (gün)",
  primaryCurrency: "ana para birimi",
  requireAllItems: "tüm kalemler zorunlu",
  requireBidDocument: "teklif belgesi zorunlu",
  targetCountries: "hedef ülkeler",
  visibility: "görünürlük",
};

const fieldLabel = (f: string) => FIELD_LABEL[f] ?? DOC_KIND_LABEL[f] ?? f;
const keyLabel = (k: string) => KEY_LABEL[k] ?? DOC_KIND_LABEL[k] ?? k;
/** Değeri alan/belge adı listesi olan anahtarlar. */
const FIELD_LIST_KEYS = new Set(["changedFields", "kycFields", "resetDocs"]);

const LISTING_TYPE_LABEL: Record<string, string> = {
  ALIM: "Alım talebi",
  SATIS: "Satış ilanı",
};

const labelsOf = (m: Record<string, { label: string }>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.label]));

/**
 * Enum değer sözlükleri — eylem ailesine göre öncelik: aynı kod (ör.
 * PENDING) sipariş, doğrulama ve belge durumunda farklı adla anılır.
 */
const ORDER_VALUES = { ...labelsOf(ORDER_STATUS), ...labelsOf(PAYMENT_STATUS) };
const LISTING_VALUES = { ...labelsOf(LISTING_STATUS), ...LISTING_TYPE_LABEL };
const BID_VALUES = labelsOf(BID_STATUS);
const VERIFY_VALUES = { ...labelsOf(VERIFY_META), ...labelsOf(DOC_STATUS_META) };
/** Onay akışı/isteği: tür (ApprovalType) ve akış durumu (ApprovalFlowStatus). */
const APPROVAL_TYPE_LABEL: Record<string, string> = {
  LISTING_PUBLISH: "Talep yayını onayı",
  LISTING_AWARD: "Kazandırma onayı",
};
const APPROVAL_VALUES: Record<string, string> = {
  ...APPROVAL_TYPE_LABEL,
  DRAFT: "Taslak",
  ACTIVE: "Aktif",
  PASSIVE: "Pasif",
  PENDING: "Bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal edildi",
};
const COMPLAINT_VALUES = labelsOf(COMPLAINT_STATUS_META);
const CONNECTION_VALUES = labelsOf(CONNECTION_STATUS_META);
const ADDRESS_TYPE_LABEL: Record<string, string> = {
  FATURA: "Fatura",
  ILETISIM: "İletişim",
  TESLIMAT: "Teslimat",
};
const GENERIC_VALUES: Record<string, string> = {
  ...BID_VALUES,
  ...LISTING_VALUES,
  ...ORDER_VALUES,
  ...VERIFY_VALUES,
  ...COMPANY_ROLE_LABEL,
  ...ADMIN_ROLE_LABEL,
  ...TIER_LABEL,
  ...LISTING_TYPE_LABEL,
  // Benzersiz kodlar — aile eşleşmese de (ör. firma detayı) çevrilir.
  ...APPROVAL_TYPE_LABEL,
  ...ADDRESS_TYPE_LABEL,
  DISMISSED: "Reddedildi",
  RESOLVED: "Çözüldü",
  PASSIVE: "Pasif",
};

function valueDict(action: string): Record<string, string>[] {
  // Onay akışı ailesi önce: DRAFT/ACTIVE/PASSIVE akış durumudur, ilan durumu
  // değil (eskiden "sonra: ACTIVE · önce: Taslak" yarım çevriliyordu).
  if (/\.approval/.test(action)) return [APPROVAL_VALUES, LISTING_VALUES, GENERIC_VALUES];
  if (/complaint/.test(action)) return [COMPLAINT_VALUES, GENERIC_VALUES];
  if (/\.connection\./.test(action)) return [CONNECTION_VALUES, GENERIC_VALUES];
  if (/\.address\./.test(action)) return [ADDRESS_TYPE_LABEL, GENERIC_VALUES];
  if (/\.order\./.test(action)) return [ORDER_VALUES, GENERIC_VALUES];
  if (/\.bid/.test(action)) return [BID_VALUES, LISTING_VALUES, GENERIC_VALUES];
  if (/\.listing/.test(action)) return [LISTING_VALUES, GENERIC_VALUES];
  if (/verification|docs|doc_revision/.test(action)) return [VERIFY_VALUES, GENERIC_VALUES];
  if (/tier|membership/.test(action)) return [TIER_LABEL, GENERIC_VALUES];
  return [GENERIC_VALUES];
}

function formatValue(
  key: string,
  v: unknown,
  dicts: Record<string, string>[],
  depth: number,
): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "evet" : "hayır";
  if (typeof v === "number") return v.toLocaleString("tr-TR");
  if (typeof v === "string") {
    if (key === "portal") return PORTAL_LABEL[v] ?? v;
    if (key === "reason" && LOGIN_FAIL_REASON_LABEL[v]) return LOGIN_FAIL_REASON_LABEL[v];
    const byKey = VALUE_BY_KEY[key]?.[v];
    if (byKey) return byKey;
    // İzin kodu ("sell:bid:submit") hangi anahtarda olursa olsun (izinler,
    // önce/sonra, eklenen/çıkarılan, gerekli yetki) etiketiyle yazılır.
    const perm = v.includes(":") ? COMPANY_PERMISSION_LABEL[v] : undefined;
    if (perm) return perm;
    if (COUNTRY_KEYS.has(key) && /^[A-Z]{2}$/.test(v)) return countryName(v);
    const date = formatDateValue(key, v);
    if (date) return date;
    if (/^[A-Z][A-Z0-9_]*$/.test(v)) {
      for (const d of dicts) if (d[v]) return d[v];
    }
    return v;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    const isField = FIELD_LIST_KEYS.has(key) || key === "keys";
    return v
      .map((x) =>
        isField && typeof x === "string"
          ? fieldLabel(x)
          : formatValue(key, x, dicts, depth + 1),
      )
      .join(", ");
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // `keys`: belge türü → depolama yolu. Yol yöneticiye bilgi vermez (ve iç
    // depolama düzenini sızdırır) — yalnız belge adları.
    if (key === "keys") {
      const kinds = Object.keys(obj);
      return kinds.length ? kinds.map(fieldLabel).join(", ") : "—";
    }
    // `changes`: alan → { from, to } — "sektör (— → Yeni)" biçiminde.
    if (key === "changes") {
      const parts = Object.entries(obj).map(([f, c]) => {
        if (c && typeof c === "object" && !Array.isArray(c) && ("from" in c || "to" in c)) {
          const cc = c as { from?: unknown; to?: unknown };
          return `${fieldLabel(f)} (${formatValue(f, cc.from, dicts, depth + 1)} → ${formatValue(f, cc.to, dicts, depth + 1)})`;
        }
        return `${fieldLabel(f)} (${formatValue(f, c, dicts, depth + 1)})`;
      });
      return parts.length ? parts.join(", ") : "—";
    }
    if (depth >= 2) return "…";
    const inner = formatPairs(v as Record<string, unknown>, dicts, depth + 1);
    return inner ? `(${inner})` : "—";
  }
  return String(v);
}

function formatPairs(
  meta: Record<string, unknown>,
  dicts: Record<string, string>[],
  depth: number,
): string {
  return Object.entries(meta)
    .filter(([k, v]) => v !== undefined && v !== null && !isHiddenKey(k))
    .map(([k, v]) => `${keyLabel(k)}: ${formatValue(k, v, dicts, depth)}`)
    .join(" · ");
}

/** Detay sütunu metni — anahtar ve bilinen enum değerleri etiketli. */
export function formatAuditMetadata(
  action: string,
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (!metadata || typeof metadata !== "object") return "";
  // Paket kaldırma (tier_set → STANDART) ay vermez; eski kayıtlar önceki
  // hibenin "months: 12"sini taşıyordu (arayüz testi son tur api-2) — gizlenir.
  if (action === "admin.company.tier_set" && metadata.tier === "STANDART" && "months" in metadata) {
    const { months: _months, ...rest } = metadata;
    return formatPairs(rest, valueDict(action), 0);
  }
  return formatPairs(metadata, valueDict(action), 0);
}
