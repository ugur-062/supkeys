/**
 * Denetim kaydı satır biçimleyicisi — Denetim Kaydı sayfası, firma detayının
 * Denetim sekmesi ve Güvenlik sayfası AYNI sözlükleri kullanır. Eskiden firma
 * sekmesi ham eylem kodu, ham aktör tipi ve ham JSON basıyordu (arayüz testi
 * O-047); genel sayfa da varlık ve detay sütununda ham kod gösteriyordu
 * (D-016). Bilinmeyen anahtar/değer ham haliyle görünür (bilgi kaybolmaz).
 */

import { BID_STATUS, LISTING_STATUS, ORDER_STATUS, PAYMENT_STATUS } from "./status-labels";
import {
  ADMIN_ROLE_LABEL,
  COMPANY_ROLE_LABEL,
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
};

/** Değişen alan adları (changedFields/kycFields değerleri). */
const FIELD_LABEL: Record<string, string> = {
  name: "ad",
  legalName: "ticari unvan",
  description: "açıklama",
  website: "web sitesi",
  phone: "telefon",
  email: "e-posta",
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
};

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
const GENERIC_VALUES: Record<string, string> = {
  ...BID_VALUES,
  ...LISTING_VALUES,
  ...ORDER_VALUES,
  ...VERIFY_VALUES,
  ...COMPANY_ROLE_LABEL,
  ...ADMIN_ROLE_LABEL,
  ...TIER_LABEL,
  ...LISTING_TYPE_LABEL,
};

function valueDict(action: string): Record<string, string>[] {
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
    if (/^[A-Z][A-Z0-9_]*$/.test(v)) {
      for (const d of dicts) if (d[v]) return d[v];
    }
    return v;
  }
  if (Array.isArray(v)) {
    const isField = key === "changedFields" || key === "kycFields" || key === "keys";
    return v
      .map((x) =>
        isField && typeof x === "string"
          ? (FIELD_LABEL[x] ?? x)
          : formatValue(key, x, dicts, depth + 1),
      )
      .join(", ");
  }
  if (typeof v === "object") {
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
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${KEY_LABEL[k] ?? k}: ${formatValue(k, v, dicts, depth)}`)
    .join(" · ");
}

/** Detay sütunu metni — anahtar ve bilinen enum değerleri etiketli. */
export function formatAuditMetadata(
  action: string,
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (!metadata || typeof metadata !== "object") return "";
  return formatPairs(metadata, valueDict(action), 0);
}
