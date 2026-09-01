import type { CompanyRole } from "@/lib/company-auth/types";

/**
 * C15 — kullanıcıya görünen anahtar→etiket sözlükleri TEK dosyada.
 * Kural: sözlükte olmayan anahtar HAM basılmaz — `labelOr` genel metne düşer
 * (ham anahtar yalnız title/tooltip'te kalır, destek teşhisi için).
 */

export const ROLE_LABELS: Record<CompanyRole, string> = {
  SAHIP: "Kurucu",
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

export function roleLabel(code: string): string {
  return ROLE_LABELS[code as CompanyRole] ?? code;
}

/** Üyelik kademesi etiketleri — rozet/kolon her yerde aynı kasa (C21). */
export const TIER_LABELS: Record<string, string> = {
  STANDART: "Standart",
  BRONZ: "Bronz",
  SILVER: "Silver",
  GOLD: "Gold",
};

/**
 * AI kullanım kırılımı — `AiUsage.feature` anahtarları.
 *
 * Backend'de `callAi({ feature })` ile yazılan HER anahtar burada olmalı;
 * eksik kalan anahtar kullanıcıya ham biçimde ("bid_price_extract") görünür.
 * 2026-09-01'de üçü eksikti.
 */
export const AI_FEATURE_LABELS: Record<string, string> = {
  test: "Test",
  assistant: "Asistan",
  tender_extract: "Belgeden Satın Alma Talebi Çıkarımı",
  supplier_discovery: "Tedarikçi Keşfi",
  bid_price_extract: "Belgeden Teklif Fiyatlama",
  category_suggest: "Kategori Önerisi",
  profile_enrich: "Web Sitesinden Profil Oluşturma",
};

/** Aktivite logu — AuditLog.action anahtarları (backend ile birebir). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "company.listing.published": "Satın Alma Talebi yayınlandı",
  "company.listing.awarded": "Satın Alma Talebi kazandırıldı",
  "company.listing.cancelled": "Satın Alma Talebi iptal edildi",
  "company.listing.evaluation_started": "Değerlendirme başlatıldı",
  "company.listing.closed_no_award": "Satın Alma Talebi kazandırmasız kapatıldı",
  "company.listing.next_round_created": "Pazarlık turu açıldı",
  "company.listing.manage_denied": "Satın Alma Talebi yönetimi reddedildi (yetkisiz deneme)",
  "company.bid.submitted": "Teklif verildi",
  "company.bid.validity_extended": "Teklif geçerliliği uzatıldı",
  "company.order.accepted": "Sipariş kabul edildi",
  "company.order.rejected": "Sipariş reddedildi",
  "company.order.shipped": "Sipariş gönderildi",
  "company.order.received": "Sipariş teslim alındı",
  "company.order.completed": "Sipariş tamamlandı",
  "company.order.cancelled": "Sipariş iptal edildi",
  "company.order.cancel_requested": "Sipariş iptali talep edildi",
  "company.order.cancel_request_approved": "Sipariş iptal talebi onaylandı",
  "company.order.cancel_request_withdrawn": "Sipariş iptal talebi geri çekildi",
  "company.order.disputed": "Sipariş ihtilafa taşındı",
  "company.order.defect_notified": "Sipariş için kusur bildirildi",
  "company.order.defect_notice_withdrawn": "Kusur bildirimi geri çekildi",
  "company.order.payment_confirmed": "Ödeme onaylandı",
  "company.order.payment_rejected": "Ödeme reddedildi",
  "company.user.roles_changed": "Kullanıcı rolleri değişti",
  "company.user.active_changed": "Kullanıcı aktif/pasif yapıldı",
  "company.user.removed": "Kullanıcı çıkarıldı",
  "company.user.permissions_overridden": "Kullanıcı izinleri düzenlendi",
  "company.user.role_change_denied": "Rol değişikliği reddedildi (yetkisiz deneme)",
  "company.user.last_admin_denied": "Son yönetici kaldırılamaz (engellendi)",
  "company.seats.selection_applied": "Kullanıcı hakkı seçimi uygulandı",
  "company.bank_account.created": "Banka hesabı eklendi",
  "company.bank_account.updated": "Banka hesabı güncellendi (IBAN maskeli)",
  "company.bank_account.deleted": "Banka hesabı silindi",
  "company.address.created": "Adres eklendi",
  "company.address.updated": "Adres güncellendi",
  "company.address.deleted": "Adres silindi",
  "company.docs.uploaded": "KYC belgesi yüklendi",
  "company.docs.submitted": "KYC doğrulamaya gönderildi",
  "company.docs.revision_submitted": "Belge güncellemesi incelemeye gönderildi",
  "company.approval.approved": "Onay verildi",
  "company.approval.step_approved": "Onay adımı geçildi",
  "company.approval.rejected": "Onay reddedildi",
  "company.connection.requested": "Bağlantı isteği gönderildi",
  "company.connection.accepted": "Bağlantı kabul edildi",
  "company.connection.rejected": "Bağlantı reddedildi",
  "company.connection.auto_created": "Bağlantı otomatik kuruldu",
  "company.connection.disconnected": "Bağlantı koparıldı",
  "company.connection.blocked": "Firma engellendi",
  "company.connection.unblocked": "Engel kaldırıldı",
  "company.profile.updated": "Firma profili güncellendi",
  "company.profile_enriched": "Firma profili AI ile zenginleştirildi",
  "company.signup": "Firma kaydı",
};

/** Sözlük dışı anahtar → genel metin (ham anahtar UI'da basılmaz). */
export function labelOr(
  dict: Record<string, string>,
  key: string,
  fallback = "Diğer işlem",
): string {
  return dict[key] ?? fallback;
}
