import type { CompanyRole } from "@rothern/db";

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
/** Yönetici yetkileri — Kurucu bunların TAMAMINI kapsar (SAHIP ⊇ YONETICI). */
const YONETICI_PERMISSIONS: readonly string[] = [
  "company:manage", // firma profili/ayarları
  "users:manage", // kullanıcı + rol atama/çıkarma
  "connections:manage", // bağlantılar (davet/kabul)
  "templates:manage",
  "approvals:manage", // onay akışı oluştur/düzenle
  // Yönetici onay adımına onaycı olarak atanabilir (assertApproversValid) —
  // karar verebilmesi için approval:act şart (eski COMPANY_ADMIN paritesi).
  "approval:act",
];

/** Yalnızca firma sahibinin (SAHIP rolü) yapabileceği korumalı işlemler. */
export const OWNER_ONLY_PERMISSIONS = [
  "billing:manage", // abonelik/paket
  "company:delete",
  "ownership:transfer",
] as const;

const SATIN_ALMACI_PERMISSIONS: readonly string[] = [
  "buy:listing:create", // alım ilanı aç (tier=PAKET gerekir)
  "buy:listing:manage",
  "buy:bid:review", // gelen teklifleri gör/karşılaştır
  "buy:award", // kazandır
  "buy:order:manage", // alım siparişi (öde/teslim al)
  "sell:bid:submit", // başkasının satış ilanına teklif (mal alımı)
];
const SATISCI_PERMISSIONS: readonly string[] = [
  "sell:bid:submit", // alım ilanına teklif (satış)
  "sell:listing:create", // satış ilanı aç (tier=PAKET gerekir)
  "sell:listing:manage",
  "sell:award",
  "sell:order:manage", // satış siparişi (kargola)
];
const ONAYLAYICI_PERMISSIONS: readonly string[] = ["approval:act"];

export const COMPANY_ROLE_PERMISSIONS: Record<CompanyRole, readonly string[]> = {
  // Faz R — Kurucu (SAHIP) bir ETİKETTİR: yönetim + sahibe-özel yetkiler verir,
  // İŞLEM (buy:*/sell:*) yetkisi VERMEZ. Kurucu işlem yapmak istiyorsa kendine
  // SATIN_ALMACI/SATISCI rolü ekler ([SAHIP, SA] artık geçerli kombo) — koltuk
  // sayımı (Faz K) bu op-rollere bakacak. İşlem-rolsüz Kurucu panelleri
  // SALT-OKUNUR görür (servis assert'leri op-rol ister).
  SAHIP: [
    ...new Set([
      ...YONETICI_PERMISSIONS,
      ...ONAYLAYICI_PERMISSIONS,
      ...OWNER_ONLY_PERMISSIONS,
    ]),
  ],
  YONETICI: YONETICI_PERMISSIONS,
  SATIN_ALMACI: SATIN_ALMACI_PERMISSIONS,
  SATISCI: SATISCI_PERMISSIONS,
  ONAYLAYICI: ONAYLAYICI_PERMISSIONS,
} as const;

/**
 * Yönetim yetkisi taşıyan roller — Kurucu ve Yönetici. Portal erişimi,
 * son-yönetici garantisi, rol atama gibi "admin" kontrolleri bunu kullanır.
 */
export const MANAGEMENT_ROLES: readonly CompanyRole[] = ["SAHIP", "YONETICI"];
export function hasManagementRole(roles: readonly CompanyRole[]): boolean {
  return roles.some((r) => MANAGEMENT_ROLES.includes(r));
}

/** Kişi-bazlı izin override (firma sahibi rol-varsayılanını artırır/azaltır). */
export interface CompanyPermissionOverride {
  added?: string[]; // rol-varsayılanı üstüne EKLENEN izinler
  removed?: string[]; // rol-varsayılanından ÇIKARILAN izinler
}

/**
 * Atanabilir izin kataloğu — Ayarlar UI'ı grup grup gösterir; override
 * doğrulaması yalnızca bu anahtarlarla yapılır. OWNER_ONLY hariç (sahibe özel).
 *
 * Faz R — İŞLEM izinleri (buy:*, sell:*) katalogdan ÇIKARILDI: override ile
 * işlem yetkisi verilemez/alınamaz (koltuk arka-kapısı kapalı — Faz K koltuğu
 * SA/ST ROLÜNE sayar; izin de rolle gelmeli). İşlem yetkisi = rol ata/kaldır.
 */
export const COMPANY_PERMISSION_CATALOG: {
  key: string;
  label: string;
  group: string;
}[] = [
  { key: "company:manage", label: "Firma profili & ayarları", group: "Yönetim" },
  { key: "users:manage", label: "Kullanıcı & rol yönetimi", group: "Yönetim" },
  { key: "connections:manage", label: "Bağlantı yönetimi", group: "Yönetim" },
  { key: "templates:manage", label: "Şablon yönetimi", group: "Yönetim" },
  { key: "approval:act", label: "Onay zincirinde onayla/reddet", group: "Onay" },
  {
    key: "approvals:manage",
    label: "Onay akışı oluşturma/yönetimi",
    group: "Onay",
  },
];

/** Override-atanabilir izinler (katalog anahtarları) — yalnız yönetim/onay. */
export const ALL_COMPANY_PERMISSIONS: readonly string[] =
  COMPANY_PERMISSION_CATALOG.map((p) => p.key);

/**
 * Sistemce BİLİNEN tüm izinler — /me `permissions` listesi bu evrenden
 * hesaplanır (serializeUser). Katalogdan AYRI: işlem izinleri override ile
 * atanamaz ama SA/ST rolü taşıyanların /me'sinde görünmek zorunda (frontend
 * buton gating'i `permissions.includes("buy:listing:manage")` okur).
 */
export const ALL_KNOWN_PERMISSIONS: readonly string[] = [
  ...new Set([
    ...Object.values(COMPANY_ROLE_PERMISSIONS).flat(),
    ...OWNER_ONLY_PERMISSIONS,
    ...ALL_COMPANY_PERMISSIONS,
  ]),
];

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

/**
 * Kullanıcının (rolleri + sahiplik + override) verilen izne sahip olup
 * olmadığı. Sıra: owner-only > açık çıkarma > açık ekleme > rol-varsayılanı.
 */
export function hasCompanyPermission(
  roles: CompanyRole[],
  isOwner: boolean,
  permission: string,
  override?: CompanyPermissionOverride | null,
): boolean {
  if (isOwner && (OWNER_ONLY_PERMISSIONS as readonly string[]).includes(permission)) {
    return true;
  }
  if (override?.removed?.includes(permission)) return false;
  if (override?.added?.includes(permission)) return true;
  return permissionsForRoles(roles).has(permission);
}
