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
 */
export type AdminAction =
  | "setTier" // POST companies/:id/tier
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
  | "extendMembership" // POST companies/:id/membership/extend
  | "addNote" // POST companies/:id/notes
  | "notify" // POST companies/:id/notify
  | "resolveComplaint" // POST complaints/:id/resolve
  | "manageCompanyUser" // POST companies/:id/users (+active/email)
  | "recoverAccount"; // companies/:id/users/:userId/{password-reset,resend,drop-sessions} — @AllowAnyAdminRole

const SUPER: AdminRole[] = ["SUPER_ADMIN"];
const KYC: AdminRole[] = ["SUPER_ADMIN", "SALES"];
const ANY: AdminRole[] = ["SUPER_ADMIN", "SALES", "SUPPORT"];

export const ADMIN_ACTION_ROLES: Record<AdminAction, AdminRole[]> = {
  setTier: SUPER,
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
  extendMembership: KYC,
  addNote: KYC,
  notify: KYC,
  resolveComplaint: KYC,
  manageCompanyUser: KYC,
  recoverAccount: ANY,
};

/** Rol bu aksiyonu yapabilir mi? (frontend buton kapısı — backend otorite kalır) */
export function canAdminDo(
  role: AdminRole | null | undefined,
  action: AdminAction,
): boolean {
  return !!role && ADMIN_ACTION_ROLES[action].includes(role);
}
