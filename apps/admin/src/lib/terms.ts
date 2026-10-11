/**
 * Terminoloji sözlüğü — TEK KAYNAK. Enum/iç-jargon ASLA doğrudan ekrana
 * yazılmaz; her kullanıcı-yüzlü etiket buradan gelir. Aynı kavramın iki
 * sayfada iki farklı adla görünmesini engeller.
 */

export type BadgeColor = "green" | "amber" | "red" | "zinc" | "blue";

// ── Firma doğrulama durumu (KYC iç terimdir; ekranda "Doğrulama") ──
export const VERIFY_META: Record<
  string,
  { label: string; color: BadgeColor }
> = {
  UNVERIFIED: { label: "Doğrulanmadı", color: "zinc" },
  PENDING: { label: "İnceleme Bekliyor", color: "amber" },
  VERIFIED: { label: "Doğrulandı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
};

// ── Yönetici (personel) rolleri ──
export const ADMIN_ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Süper Admin",
  SALES: "Satış",
  SUPPORT: "Destek",
};

// ── Firma kullanıcı rolleri ──
export const COMPANY_ROLE_LABEL: Record<string, string> = {
  SAHIP: "Kurucu",
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

// ── Firma içi izinler ──
/**
 * `@rothern/shared` `COMPANY_PERMISSION_CATALOG` + `OWNER_ONLY_PERMISSIONS`
 * etiket AYNASI (admin paylaşılan pakete bağlı değil). Denetim kaydında izin
 * listeleri ham kod ("buy:view, sell:bid:submit") basıyordu (arayüz testi son
 * tur webC-4). Nöbetçi test katalogla birebirliği denetler.
 */
export const COMPANY_PERMISSION_LABEL: Record<string, string> = {
  "buy:view": "Satınalma görüntüleme",
  "buy:listing:manage": "Talep açma ve yönetme",
  "buy:award": "Kazandırma",
  "buy:order:manage": "Alım siparişi işlemleri",
  "buy:inquiry:send": "Bilgi talebi gönderme",
  "buy:reports:view": "Satınalma raporları",
  "sell:view": "Satış görüntüleme",
  "sell:bid:submit": "Teklif verme",
  "sell:order:manage": "Satış siparişi işlemleri",
  "sell:product:manage": "Ürün ve vitrin yönetimi",
  "sell:inquiry:reply": "Bilgi taleplerini yanıtlama",
  "approval:act": "Onaylama",
  "approvals:manage": "Onay akışı tanımlama",
  "company:manage": "Firma profili ve ayarlar",
  "users:manage": "Kullanıcı ve yetki",
  "connections:manage": "Bağlantılar, engelleme ve şikayet",
  "templates:manage": "Şablonlar",
  "addresses:manage": "Adres defteri",
  "insights:view": "Ziyaret edenler ve iş analizi",
  "billing:manage": "Faturalama (Kurucu)",
  "company:delete": "Firmayı silme (Kurucu)",
  "ownership:transfer": "Kurucu devri (Kurucu)",
};

// ── Belge inceleme durumu ──
export const DOC_STATUS_META: Record<
  string,
  { label: string; color: BadgeColor }
> = {
  PENDING: { label: "İnceleme Bekliyor", color: "amber" },
  APPROVED: { label: "Onaylı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
};

// ── Şikayet durumu ──
export const COMPLAINT_STATUS_META: Record<
  string,
  { label: string; color: BadgeColor }
> = {
  OPEN: { label: "Açık", color: "amber" },
  RESOLVED: { label: "Çözüldü", color: "green" },
  DISMISSED: { label: "Reddedildi", color: "zinc" },
};

// ── Bağlantı / referans davet durumları ──
export const CONNECTION_STATUS_META: Record<
  string,
  { label: string; color: BadgeColor }
> = {
  ACTIVE: { label: "Aktif", color: "green" },
  PENDING: { label: "Bekliyor", color: "amber" },
  REJECTED: { label: "Reddedildi", color: "red" },
  INACTIVE: { label: "Pasif", color: "zinc" },
};

export const REFERRAL_STATUS_META: Record<
  string,
  { label: string; color: BadgeColor }
> = {
  PENDING: { label: "Bekliyor", color: "amber" },
  ACCEPTED: { label: "Kabul Edildi", color: "green" },
  CANCELLED: { label: "İptal", color: "zinc" },
  EXPIRED: { label: "Süresi Doldu", color: "zinc" },
};

// ── Denetim kaydı varlık türleri (ham entityType ekrana çıkmasın) ──
export const ENTITY_TYPE_LABEL: Record<string, string> = {
  company: "Firma",
  listing: "İlan",
  order: "Sipariş",
  complaint: "Şikayet",
  company_user: "Kullanıcı",
  company_note: "Not",
  platform_admin: "Yönetici",
  connection: "Bağlantı",
  referral_invite: "Davet",
  announcement: "Duyuru",
  email: "E-posta",
  system: "Sistem",
  // Bugünkü yazım noktalarının tamamı — `__tests__/audit-actions.test.ts`
  // API'deki `entityType: "…"` yazımlarını tarar (arayüz testi D-016).
  company_order: "Sipariş",
  company_order_payment: "Sipariş ödemesi",
  company_user_invitation: "Kullanıcı daveti",
  company_connection: "Bağlantı",
  company_block: "Engelleme",
  company_address: "Adres",
  company_bank_account: "Banka hesabı",
  company_item: "Katalog kalemi",
  listing_bid: "Teklif",
  listing_document: "İlan belgesi",
  bid_document: "Teklif belgesi",
  approval_flow: "Onay akışı",
  approval_request: "Onay isteği",
  audit_log: "Denetim kaydı",
  email_log: "E-posta kaydı",
};

/** Haritada olmayan durum ham enum yerine tireli nötr etiket alır. */
export function metaOf(
  map: Record<string, { label: string; color: BadgeColor }>,
  key: string | null | undefined,
): { label: string; color: BadgeColor } {
  if (key && map[key]) return map[key];
  return { label: key ? key.replaceAll("_", " ").toLowerCase() : "—", color: "zinc" };
}
