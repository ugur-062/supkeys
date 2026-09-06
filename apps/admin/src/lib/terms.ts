/**
 * Terminoloji sözlüğü — TEK KAYNAK. Enum/iç-jargon ASLA doğrudan ekrana
 * yazılmaz; her kullanıcı-yüzlü etiket buradan gelir. Aynı kavramın iki
 * sayfada iki farklı adla görünmesini engeller.
 */

export type BadgeColor = "green" | "amber" | "red" | "zinc" | "blue";

// ── Üyelik (tier) — Faz T: 4 kademe (STANDART paketsiz-pasif) ──
export const TIER_LABEL: Record<string, string> = {
  STANDART: "Standart",
  SILVER: "Silver",
  GOLD: "Gold",
};
export const TIER_COLOR: Record<string, "zinc" | "orange" | "sky" | "amber"> = {
  STANDART: "zinc",
  SILVER: "sky",
  GOLD: "amber",
};
/** Paralı kademeler — grant menüsü/rozet mantığı için. */
export const PAID_TIER_OPTIONS = ["SILVER", "GOLD"] as const;

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

// ── Üyelik geçmişi olayları ──
export const MEMBERSHIP_ACTION_META: Record<
  string,
  { label: string; color: BadgeColor }
> = {
  GRANT: { label: "Tanımlandı", color: "green" },
  EXTEND: { label: "Uzatıldı", color: "blue" },
  REVOKE: { label: "Kaldırıldı", color: "red" },
  EXPIRE: { label: "Süresi Doldu", color: "zinc" },
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
};

/** Haritada olmayan durum ham enum yerine tireli nötr etiket alır. */
export function metaOf(
  map: Record<string, { label: string; color: BadgeColor }>,
  key: string | null | undefined,
): { label: string; color: BadgeColor } {
  if (key && map[key]) return map[key];
  return { label: key ? key.replaceAll("_", " ").toLowerCase() : "—", color: "zinc" };
}
