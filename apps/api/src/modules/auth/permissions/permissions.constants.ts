import type { UserRole } from "@supkeys/db";

/**
 * V2-6.5 — RBAC permission constants.
 * 6 grup, 22 permission.
 */
export const PERMISSIONS = {
  TENDER: {
    CREATE: "tender:create",
    EDIT: "tender:edit",
    PUBLISH: "tender:publish",
    DELETE: "tender:delete",
    AWARD: "tender:award",
    CANCEL: "tender:cancel",
    VIEW: "tender:view",
  },
  BID: {
    COMPARE: "bid:compare",
    ELIMINATE: "bid:eliminate",
  },
  ORDER: {
    EDIT: "order:edit",
    COMPLETE: "order:complete",
    CANCEL: "order:cancel",
    VIEW: "order:view",
  },
  APPROVAL: {
    APPROVE: "approval:approve",
    VIEW: "approval:view",
  },
  SETTINGS: {
    USERS: "settings:users",
    SUPPLIERS: "settings:suppliers",
    ADDRESSES: "settings:addresses",
    APPROVAL_FLOW: "settings:approval",
    COMPANY: "settings:company",
  },
  REPORTS: {
    VIEW: "reports:view",
    EXPORT: "reports:export",
  },
  TEMPLATES: {
    VIEW: "templates:view",
    EDIT: "templates:edit",
  },
} as const;

export const ALL_PERMISSIONS: readonly string[] = Object.values(PERMISSIONS)
  .flatMap((group) => Object.values(group))
  .map((p) => p as string);

export const PERMISSION_LABELS: Record<
  string,
  { tr: string; groupTr: string }
> = {
  "tender:create": { tr: "İhale oluşturabilir", groupTr: "İhale" },
  "tender:edit": { tr: "İhale düzenleyebilir", groupTr: "İhale" },
  "tender:publish": { tr: "İhale yayınlayabilir", groupTr: "İhale" },
  "tender:delete": { tr: "İhale silebilir", groupTr: "İhale" },
  "tender:award": { tr: "Kazananı seçebilir", groupTr: "İhale" },
  "tender:cancel": { tr: "İhale iptal edebilir", groupTr: "İhale" },
  "tender:view": { tr: "İhaleleri görüntüleyebilir", groupTr: "İhale" },
  "bid:compare": { tr: "Teklifleri karşılaştırabilir", groupTr: "Teklif" },
  "bid:eliminate": { tr: "Teklif eleyebilir", groupTr: "Teklif" },
  "order:edit": { tr: "Sipariş düzenleyebilir", groupTr: "Sipariş" },
  "order:complete": { tr: "Sipariş tamamlayabilir", groupTr: "Sipariş" },
  "order:cancel": { tr: "Sipariş iptal edebilir", groupTr: "Sipariş" },
  "order:view": { tr: "Siparişleri görüntüleyebilir", groupTr: "Sipariş" },
  "approval:approve": {
    tr: "Onay süreçlerinde onaylayabilir",
    groupTr: "Onay",
  },
  "approval:view": {
    tr: "Onay süreçlerini görüntüleyebilir",
    groupTr: "Onay",
  },
  "settings:users": { tr: "Kullanıcı yönetebilir", groupTr: "Ayarlar" },
  "settings:suppliers": { tr: "Tedarikçi yönetebilir", groupTr: "Ayarlar" },
  "settings:addresses": { tr: "Adresleri yönetebilir", groupTr: "Ayarlar" },
  "settings:approval": { tr: "Onay akışını yönetebilir", groupTr: "Ayarlar" },
  "settings:company": {
    tr: "Firma bilgilerini düzenleyebilir",
    groupTr: "Ayarlar",
  },
  "reports:view": { tr: "Raporları görüntüleyebilir", groupTr: "Raporlar" },
  "reports:export": { tr: "Rapor dışa aktarabilir", groupTr: "Raporlar" },
  "templates:view": {
    tr: "Şablonları görüntüleyebilir",
    groupTr: "Şablonlar",
  },
  "templates:edit": {
    tr: "Şablon oluşturup düzenleyebilir",
    groupTr: "Şablonlar",
  },
};

/**
 * Rol başına default permission seti. Override yoksa user bu setle çalışır.
 *
 * Tasarım:
 * - COMPANY_ADMIN: yalnızca yönetim (kullanıcı/tedarikçi/adres/onay-akışı/firma)
 *   + tüm görüntüleme + raporlar. İhale OLUŞTURAMAZ default'ta — yönetici
 *   isterse kendisine `tender:create` ekleyebilir.
 * - BUYER (Satın Almacı): tüm ihale + sipariş operasyonu + bid işlemleri +
 *   reports:view. Ayarları yönetemez.
 * - APPROVER: sadece onay süreçleri + temel view (tender/order okuyabilir).
 */
/**
 * V2-6.5 fix — Rol başına KESİNLİKLE atanamayacak izinler. Override.added
 * ile bile verilmez; resolveUserPermissions efektif listede filtreler.
 *
 * Kural:
 * - COMPANY_ADMIN (Yönetici) bir yönetim rolüdür. İhale OLUŞTURMAK
 *   onun işi değil; default'ta da yok. Bu listeyle, yanlışlıkla veya
 *   kasten override ile bile verilmesi engellenir.
 * - APPROVER (Onaylayıcı) salt-okunur + onaylama rolüdür. İhale/teklif/sipariş
 *   YAZMA yetkileri yasaktır (override.added ile bile verilemez). Yönetim
 *   ayarları (settings:*) yasak DEĞİL — default'ta yok ama firma yöneticisi
 *   isterse override.added ile verebilir.
 */
export const FORBIDDEN_PERMISSIONS_BY_ROLE: Record<UserRole, readonly string[]> =
  {
    // V2-6.5 — Yönetici: sorumluluk ayrımı için OPERASYONEL yetkiler yasak.
    // Karar yetkileri (tender:cancel, tender:award, order:complete, order:cancel)
    // yönetimde kalır; operasyon (oluşturma, düzenleme, yayın, silme, eleme,
    // sipariş ince ayarı) BUYER'ın işi.
    COMPANY_ADMIN: [
      "tender:create",
      "tender:edit",
      "tender:publish",
      "tender:delete",
      "bid:eliminate",
      "order:edit",
    ],
    BUYER: [],
    APPROVER: [
      // İhale yazma operasyonları
      "tender:create",
      "tender:edit",
      "tender:publish",
      "tender:delete",
      "tender:cancel",
      "tender:award",
      // Teklif eleme (yazma)
      "bid:eliminate",
      // Sipariş yazma operasyonları
      "order:edit",
      "order:complete",
      "order:cancel",
    ],
  };

export function isForbiddenForRole(role: UserRole, permission: string): boolean {
  return FORBIDDEN_PERMISSIONS_BY_ROLE[role].includes(permission);
}

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, string[]> = {
  // V2-6.5 — Yönetici (COMPANY_ADMIN): sorumluluk ayrımı. Operasyonel
  // yetkiler (create/edit/publish/delete/eleme/order edit) BUYER'a bırakılır
  // ve yasaktır — yönetici override.added ile de alamaz. Yönetici "karar
  // verici" rolündedir: kazandırma, iptal, teslim onayı, ayarlar, onay,
  // raporlar. İş modeli koruması (BUYER ücretli koltuk) zaten korunuyor:
  // yönetici ihale açamadığı için her tenant'a en az 1 BUYER lazım.
  COMPANY_ADMIN: [
    // Ayarlar (yönetim)
    "settings:users",
    "settings:suppliers",
    "settings:addresses",
    "settings:approval",
    "settings:company",
    // İhale — sadece görüntüleme + yönetim kararları
    "tender:view",
    "tender:cancel",
    "tender:award",
    // Teklif — sadece görüntüleme (compare)
    "bid:compare",
    // Sipariş — görüntüleme + yönetim kararları (teslim/iptal)
    "order:view",
    "order:complete",
    "order:cancel",
    // Onay (sıklıkla son onaylayıcı)
    "approval:view",
    "approval:approve",
    // Raporlar
    "reports:view",
    "reports:export",
    // Şablonlar — yönetici şablon yönetebilir
    "templates:view",
    "templates:edit",
  ],
  BUYER: [
    // İhale operasyonu (BUYER'ın ana iş alanı)
    "tender:create",
    "tender:edit",
    "tender:publish",
    "tender:delete",
    "tender:award",
    "tender:cancel",
    "tender:view",
    // Teklif değerlendirme
    "bid:compare",
    "bid:eliminate",
    // Sipariş operasyonu
    "order:edit",
    "order:complete",
    "order:cancel",
    "order:view",
    // Tedarikçi listesini görüntüleme + davet etme her rolde varsayılan
    "settings:suppliers",
    // V2-6.5 — Satın almacı sahaya yakın; teslimat/fatura adreslerini
    // yönetebilmeli ki RFQ akışı yöneticiyi beklemekle yavaşlamasın.
    "settings:addresses",
    // V2-6.5 — Açtığı ihalenin onay sürecinde nerede olduğunu görmeli
    // (yöneticiye sormadan takip edebilsin).
    "approval:view",
    // Raporlar
    "reports:view",
    "reports:export",
    // Şablonlar — BUYER hızlı ihale aç(mak için) şablon yönetir
    "templates:view",
    "templates:edit",
  ],
  APPROVER: [
    "approval:approve",
    "approval:view",
    "tender:view",
    // V2-6.5 — Onaylayıcı teklifleri karşılaştırabilir (onay öncesi inceleme)
    "bid:compare",
    "order:view",
    // Tedarikçi listesini görüntüleme + davet etme her rolde varsayılan
    "settings:suppliers",
    // V2-6.5 — Onaylayıcı raporları görüntüleyebilir ve dışa aktarabilir
    "reports:view",
    "reports:export",
    // Onaylayıcı şablonları görüntüleyebilir (ihale içeriği bağlamı için)
    "templates:view",
  ],
};
