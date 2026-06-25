import type { CompanyRole } from "@supkeys/db";

/**
 * Birleşik sistem — CompanyRole → izin matrisi.
 *
 * İlke: izinler "panel tipi" değil, kişinin firmadaki ROLÜYLE belirlenir.
 * - YONETICI: hesap yönetimi (kullanıcı/rol, ayar, bağlantı). Operasyon DEĞİL.
 * - SATIN_ALMACI: alım (🔵) operasyonu.
 * - SATISCI: satış (🟢) operasyonu.
 * - ONAYLAYICI: onay zinciri.
 *
 * Firma SAHİBİ (Company.ownerUserId) ekstra korumalı yetkilere sahiptir
 * (billing/devir/silme) — bunlar role değil `isOwner`a bağlıdır (OWNER_ONLY).
 *
 * İki katman: bu roller "kişi firmanın izinli kümesinde ne yapar"; firmanın
 * neyi yapabildiği (ilan açma vb.) ayrıca üyelik `tier`ine (PAKET) bağlıdır.
 */
export const COMPANY_ROLE_PERMISSIONS: Record<CompanyRole, readonly string[]> = {
  YONETICI: [
    "company:manage", // firma profili/ayarları
    "users:manage", // kullanıcı + rol atama/çıkarma
    "connections:manage", // bağlantılar (davet/kabul)
    "templates:manage",
  ],
  SATIN_ALMACI: [
    "buy:listing:create", // alım ilanı aç (tier=PAKET gerekir)
    "buy:listing:manage",
    "buy:bid:review", // gelen teklifleri gör/karşılaştır
    "buy:award", // kazandır
    "buy:order:manage", // alım siparişi (öde/teslim al)
    "sell:bid:submit", // başkasının satış ilanına teklif (mal alımı)
  ],
  SATISCI: [
    "sell:bid:submit", // alım ilanına teklif (satış)
    "sell:listing:create", // satış ilanı aç (tier=PAKET gerekir)
    "sell:listing:manage",
    "sell:award",
    "sell:order:manage", // satış siparişi (kargola)
  ],
  ONAYLAYICI: [
    "approval:act", // onay zincirinde onayla/reddet
  ],
} as const;

/** Yalnızca firma sahibinin (isOwner) yapabileceği korumalı işlemler. */
export const OWNER_ONLY_PERMISSIONS = [
  "billing:manage", // abonelik/paket
  "company:delete",
  "ownership:transfer",
] as const;

/** Verilen rollerin birleşik izin kümesi. */
export function permissionsForRoles(roles: CompanyRole[]): Set<string> {
  const set = new Set<string>();
  for (const role of roles) {
    for (const perm of COMPANY_ROLE_PERMISSIONS[role] ?? []) {
      set.add(perm);
    }
  }
  return set;
}

/** Kullanıcının (rolleri + sahiplik) verilen izne sahip olup olmadığı. */
export function hasCompanyPermission(
  roles: CompanyRole[],
  isOwner: boolean,
  permission: string,
): boolean {
  if (isOwner && (OWNER_ONLY_PERMISSIONS as readonly string[]).includes(permission)) {
    return true;
  }
  return permissionsForRoles(roles).has(permission);
}
