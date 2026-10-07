import type { AdminRole } from "@/lib/auth/types";

/**
 * Admin aksiyon → izinli rol matrisi (buton görünürlük kapısı, F7 deseni).
 *
 * OTORİTE backend `@RequireAdminRole(...)`'dır (fail-closed guard). Bu matris onu
 * YANSITIR; UI izinsiz butonu göstermesin diye. apps/admin bilinçle
 * `@rothern/shared`'a bağlı DEĞİL (yerel matris).
 *
 * ⚠️ DRIFT: backend decorator değişirse bu matris bayatlar. NÖBETÇİ:
 * `apps/api/test/unit/admin-action-roles-drift.spec.ts` her aksiyonu backend
 * route'unun `@RequireAdminRole` metadata'sıyla karşılaştırır → uyuşmazsa KIRILIR.
 * Backend değişince: O SPEC'İ + BURAYI birlikte güncelle (iki kopya, çapraz-ref).
 *
 * ÜCRETSİZ DÖNEM (2026-10-07): üyelik yönetimi ekranları panelden kaldırıldı;
 * `setTier`, `extendMembership`, `viewMembershipReport` aksiyonları bu matristen
 * çıktı (API uçları ve o spec'teki satırları duruyor). Ücretli üyelik dönünce
 * ekranlarla birlikte git geçmişinden geri gelir.
 */
export type AdminAction =
  | "suspend" // POST companies/:id/suspend
  | "unsuspend" // POST companies/:id/unsuspend
  | "deleteNote" // DELETE notes/:noteId
  | "deleteCompany" // DELETE companies/:id
  | "announce" // POST announcements
  | "manageStaff" // admin/staff/* (controller-level)
  | "editProfile" // POST companies/:id/profile
  | "verify" // POST companies/:id/verify
  | "reject" // POST companies/:id/reject
  | "reviewDocs" // POST companies/:id/review
  | "reviewDocRevision" // POST companies/:id/doc-revisions/:revId/review (Faz Y A-modeli)
  | "addNote" // POST companies/:id/notes
  | "notify" // POST companies/:id/notify
  | "resolveComplaint" // POST complaints/:id/resolve
  | "manageCompanyUser" // POST companies/:id/users (+active/email)
  | "recoverAccount"
  // Denetim 2026-08-26 Parça 10 B2: admin/sistem'deki üç SUPER_ADMIN aksiyonu
  // matriste HİÇ yoktu → hem UI kapısız hem drift nöbetçisi kapsamı dışındaydı.
  | "manualRate" // POST admin/system/rates/manual
  | "clearSuppression" // POST admin/system/suppressions/clear
  | "timeSavingsConfig" // POST admin/system/time-savings-config
  | "listSuppressions" // companies/:id/users/:userId/{password-reset,resend,drop-sessions} — @AllowAnyAdminRole
  | "resolveCategoryMiss" // POST admin/system/category-misses/:id/resolve
  | "globalSearch" // GET admin/search (üst çubuk global arama)
  | "listCompanies" // GET admin/companies (firma listesi + detay; KYC PII, SUPPORT'a kapalı)
  // Derin denetim LU-12: inceleme sayfaları (ilan/sipariş/ürün) ve Sistem
  // sayfası bu aksiyonları rol kapısız çiziyordu → izinsiz role 403 toast'ı.
  | "listingIntervention" // POST admin/listings/:id/{close,extend,reopen}
  | "cancelOrder" // POST admin/orders/:id/cancel
  | "reviewProduct" // POST admin/products/:id/{approve,reject} + bulk-approve
  | "refreshRates" // POST admin/system/refresh-rates
  // Arayüz testi T-09 (D-017, D-033, D-224): menü öğeleri ve sayfa kapıları
  // da bu matristen beslenir — izinsiz role menüde görünmez, adresle
  // açılınca sorgu atmadan yetki kartı çizilir.
  | "viewAuditLogs" // GET admin/audit-logs (Denetim Kaydı + Güvenlik)
  | "viewEmailLogs" // GET admin/email-logs
  | "viewGrowth"; // GET admin/growth/invites

const SUPER: AdminRole[] = ["SUPER_ADMIN"];
const KYC: AdminRole[] = ["SUPER_ADMIN", "SALES"];
const ANY: AdminRole[] = ["SUPER_ADMIN", "SALES", "SUPPORT"];
// Ürün kararı katalog kalitesi işidir → SUPPORT'a açık, SALES yalnız okur.
const PRODUCT_REVIEW: AdminRole[] = ["SUPER_ADMIN", "SUPPORT"];

export const ADMIN_ACTION_ROLES: Record<AdminAction, AdminRole[]> = {
  suspend: SUPER,
  unsuspend: SUPER,
  deleteNote: SUPER,
  deleteCompany: SUPER,
  announce: SUPER,
  manageStaff: SUPER,
  editProfile: KYC,
  verify: KYC,
  reject: KYC,
  reviewDocs: KYC,
  reviewDocRevision: KYC,
  addNote: KYC,
  notify: KYC,
  resolveComplaint: KYC,
  manageCompanyUser: KYC,
  recoverAccount: ANY,
  manualRate: SUPER,
  clearSuppression: SUPER,
  timeSavingsConfig: SUPER,
  listSuppressions: KYC,
  resolveCategoryMiss: KYC,
  globalSearch: KYC,
  listCompanies: KYC,
  listingIntervention: KYC,
  cancelOrder: KYC,
  reviewProduct: PRODUCT_REVIEW,
  refreshRates: KYC,
  viewAuditLogs: KYC,
  viewEmailLogs: KYC,
  viewGrowth: KYC,
};

/** Rol bu aksiyonu yapabilir mi? (frontend buton kapısı — backend otorite kalır) */
export function canAdminDo(
  role: AdminRole | null | undefined,
  action: AdminAction,
): boolean {
  return !!role && ADMIN_ACTION_ROLES[action].includes(role);
}
