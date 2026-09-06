/**
 * Firma içi YETKİ KATALOĞU — TEK KAYNAK (api + web + admin + db scriptleri).
 *
 * Model (2026-09-05, kullanıcı kararı — "yetki tablosu"):
 * - Doğruluk kaynağı kişinin AÇIK izin listesidir (`CompanyUser.permissions`).
 * - Roller (SAHIP/YONETICI/SATIN_ALMACI/SATISCI/ONAYLAYICI) ETİKETTİR: girişte
 *   hazır seti (preset) işaretler, çıkışta izin listesinden TÜRETİLİR
 *   (`rolesFromPermissions`). Etiket tek başına yetki vermez.
 * - Koltuk: satınalma ya da satış grubundaki bir İŞLEM izni koltuk tüketir;
 *   görüntüleme ve raporlar tüketmez.
 * - Kurucu (Company.ownerUserId): yönetim + onay + görüntüleme + sahibe-özel
 *   yetkileri ÖRTÜK taşır (kısılamaz); işlem izinleri ise açıkça yazılır
 *   (koltuk tüketir — kayıtta sorulur, sonradan Kullanıcılar'dan değişir).
 */

export type CompanyRoleKey =
  | "SAHIP"
  | "YONETICI"
  | "SATIN_ALMACI"
  | "SATISCI"
  | "ONAYLAYICI";

export type CompanyPermissionGroup = "buy" | "sell" | "approval" | "management";

export interface CompanyPermissionDef {
  key: string;
  label: string;
  group: CompanyPermissionGroup;
  /** İşlem izni — koltuk tüketir (görüntüleme/rapor tüketmez). */
  seat: boolean;
  /** Yalnız Kurucu verir (yönetim sızması kapısı). */
  ownerGrantsOnly?: boolean;
}

export const COMPANY_PERMISSION_GROUP_LABELS: Record<
  CompanyPermissionGroup,
  string
> = {
  buy: "Satınalma",
  sell: "Satış",
  approval: "Onay",
  management: "Yönetim",
};

/** Katalog — sıra UI sırasıdır (grup içinde görüntüleme önce). */
export const COMPANY_PERMISSION_CATALOG: readonly CompanyPermissionDef[] = [
  // Satınalma
  { key: "buy:view", label: "Satınalma görüntüleme", group: "buy", seat: false },
  { key: "buy:listing:manage", label: "Talep açma ve yönetme", group: "buy", seat: true },
  { key: "buy:award", label: "Kazandırma", group: "buy", seat: true },
  { key: "buy:order:manage", label: "Alım siparişi işlemleri", group: "buy", seat: true },
  { key: "buy:inquiry:send", label: "Bilgi talebi gönderme", group: "buy", seat: true },
  { key: "buy:reports:view", label: "Satınalma raporları", group: "buy", seat: false },
  // Satış
  { key: "sell:view", label: "Satış görüntüleme", group: "sell", seat: false },
  { key: "sell:bid:submit", label: "Teklif verme", group: "sell", seat: true },
  { key: "sell:order:manage", label: "Satış siparişi işlemleri", group: "sell", seat: true },
  { key: "sell:product:manage", label: "Ürün ve vitrin yönetimi", group: "sell", seat: true },
  { key: "sell:inquiry:reply", label: "Bilgi taleplerini yanıtlama", group: "sell", seat: true },
  // Onay
  { key: "approval:act", label: "Onaylama", group: "approval", seat: false },
  { key: "approvals:manage", label: "Onay akışı tanımlama", group: "approval", seat: false },
  // Yönetim
  { key: "company:manage", label: "Firma profili ve ayarlar", group: "management", seat: false },
  {
    key: "users:manage",
    label: "Kullanıcı ve yetki",
    group: "management",
    seat: false,
    ownerGrantsOnly: true,
  },
  { key: "connections:manage", label: "Bağlantılar, engelleme ve şikayet", group: "management", seat: false },
  { key: "templates:manage", label: "Şablonlar", group: "management", seat: false },
  { key: "addresses:manage", label: "Adres defteri", group: "management", seat: false },
  { key: "insights:view", label: "Ziyaret edenler ve iş analizi", group: "management", seat: false },
] as const;

/** Sahibe özel — tabloda işaretlenemez, yalnız `isOwner` verir. */
export const OWNER_ONLY_PERMISSIONS = [
  "billing:manage",
  "company:delete",
  "ownership:transfer",
] as const;

export const ALL_COMPANY_PERMISSIONS: readonly string[] =
  COMPANY_PERMISSION_CATALOG.map((p) => p.key);

/** Sistemce bilinen tüm anahtarlar (katalog + sahibe özel). */
export const ALL_KNOWN_PERMISSIONS: readonly string[] = [
  ...ALL_COMPANY_PERMISSIONS,
  ...OWNER_ONLY_PERMISSIONS,
];

const byKey = new Map(COMPANY_PERMISSION_CATALOG.map((p) => [p.key, p]));

export function permissionDef(key: string): CompanyPermissionDef | undefined {
  return byKey.get(key);
}

/** Gruptaki İŞLEM (koltuk) izinleri. */
export function seatPermissionsOf(group: "buy" | "sell"): readonly string[] {
  return COMPANY_PERMISSION_CATALOG.filter(
    (p) => p.group === group && p.seat,
  ).map((p) => p.key);
}

export const BUY_SEAT_PERMISSIONS: readonly string[] = seatPermissionsOf("buy");
export const SELL_SEAT_PERMISSIONS: readonly string[] = seatPermissionsOf("sell");
export const ALL_SEAT_PERMISSIONS: readonly string[] = [
  ...BUY_SEAT_PERMISSIONS,
  ...SELL_SEAT_PERMISSIONS,
];

/** Görüntüleme anahtarları — işlem izni bunları ÖRTÜK içerir (normalize eder). */
export const VIEW_PERMISSION_OF: Record<"buy" | "sell", string> = {
  buy: "buy:view",
  sell: "sell:view",
};

/**
 * Eski anahtarlar → yeni karşılık (geçiş; okumada ve backfill'de uygulanır).
 * `null` = kaldırıldı (satış ilanı özelliği 2026-09-04'te söküldü; Satın
 * Almacı'nın satış ilanına teklif izni de onunla birlikte öldü).
 */
export const LEGACY_PERMISSION_MAP: Record<string, string | null> = {
  "buy:listing:create": "buy:listing:manage",
  "buy:bid:review": "buy:reports:view",
  "sell:listing:create": null,
  "sell:listing:manage": null,
  "sell:award": null,
};

/** Rol → hazır set. SAHIP seti = Yönetici seti (sahibe-özel `isOwner` ile gelir). */
const MANAGEMENT_PRESET: readonly string[] = [
  "buy:view",
  "sell:view",
  "buy:reports:view",
  "approval:act",
  "approvals:manage",
  "company:manage",
  "users:manage",
  "connections:manage",
  "templates:manage",
  "addresses:manage",
  "insights:view",
];

export const COMPANY_ROLE_PRESETS: Record<CompanyRoleKey, readonly string[]> = {
  SAHIP: MANAGEMENT_PRESET,
  YONETICI: MANAGEMENT_PRESET,
  SATIN_ALMACI: [
    "buy:view",
    "buy:listing:manage",
    "buy:award",
    "buy:order:manage",
    "buy:inquiry:send",
    "buy:reports:view",
    "templates:manage",
    "connections:manage",
    "addresses:manage",
  ],
  SATISCI: [
    "sell:view",
    "sell:bid:submit",
    "sell:order:manage",
    "sell:product:manage",
    "sell:inquiry:reply",
    "connections:manage",
    "addresses:manage",
    "insights:view",
  ],
  ONAYLAYICI: ["approval:act"],
};

/** Salt görüntüleyici hazır seti (rol etiketi yok; koltuk tüketmez). */
export const VIEWER_PRESET: readonly string[] = [
  "buy:view",
  "sell:view",
  "buy:reports:view",
];

/**
 * Kurucunun ÖRTÜK izinleri — kişi satırında yazılı olmasa da her istekte
 * geçerli; kısılamaz. İşlem izinleri BUNA DAHİL DEĞİL (koltuk).
 */
export const OWNER_IMPLICIT_PERMISSIONS: readonly string[] = [
  ...MANAGEMENT_PRESET,
  ...OWNER_ONLY_PERMISSIONS,
];

/**
 * İzin listesini kanonik hâle getirir: eski anahtar → yeni, bilinmeyen düşer,
 * sahibe-özel düşer (yalnız isOwner verir), işlem izni grubun görüntülemesini
 * ekler (yönetemediğini görebilmeli), sıra katalog sırası.
 */
export function normalizePermissions(input: readonly string[]): string[] {
  const set = new Set<string>();
  for (const raw of input) {
    const mapped = raw in LEGACY_PERMISSION_MAP ? LEGACY_PERMISSION_MAP[raw] : raw;
    if (!mapped) continue;
    if (!byKey.has(mapped)) continue;
    set.add(mapped);
  }
  if (BUY_SEAT_PERMISSIONS.some((k) => set.has(k))) set.add("buy:view");
  if (SELL_SEAT_PERMISSIONS.some((k) => set.has(k))) set.add("sell:view");
  return ALL_COMPANY_PERMISSIONS.filter((k) => set.has(k));
}

/** Rollerin hazır setlerinin birleşimi (kanonik). */
export function permissionsForRoles(roles: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of roles) {
    const preset = COMPANY_ROLE_PRESETS[r as CompanyRoleKey];
    if (preset) out.push(...preset);
  }
  return normalizePermissions(out);
}

/** Kişinin tuttuğu koltuk grupları — efektif izinlerden (rol yedeğiyle). */
export function seatGroupsOf(user: {
  isOwner?: boolean;
  permissions?: readonly string[] | null;
  roles?: readonly string[] | null;
}): Set<"buy" | "sell"> {
  const perms = effectivePermissions({ isOwner: !!user.isOwner, permissions: user.permissions, roles: user.roles });
  const out = new Set<"buy" | "sell">();
  if (hasBuySeat(perms)) out.add("buy");
  if (hasSellSeat(perms)) out.add("sell");
  return out;
}

/** Bir kişi listesinin toplam koltuk sayımı (grup bazında). */
export function countSeats(
  users: readonly {
    isOwner?: boolean;
    permissions?: readonly string[] | null;
    roles?: readonly string[] | null;
  }[],
): { buy: number; sell: number; total: number } {
  let buy = 0;
  let sell = 0;
  for (const u of users) {
    const g = seatGroupsOf(u);
    if (g.has("buy")) buy++;
    if (g.has("sell")) sell++;
  }
  return { buy, sell, total: buy + sell };
}

export function hasBuySeat(perms: readonly string[]): boolean {
  return BUY_SEAT_PERMISSIONS.some((k) => perms.includes(k));
}
export function hasSellSeat(perms: readonly string[]): boolean {
  return SELL_SEAT_PERMISSIONS.some((k) => perms.includes(k));
}
/** Yönetim etiketi ölçütü: kullanıcı-yetki VEYA firma ayarları. */
export function hasManagementPermission(perms: readonly string[]): boolean {
  return perms.includes("users:manage") || perms.includes("company:manage");
}

/**
 * İzin listesinden rol ETİKETLERİ (saklanan `roles` bununla yazılır):
 * - SAHIP: firma sahibi (isOwner) — tek etiket + varsa işlem rolleri.
 * - YONETICI: yönetim izni (users:manage ∨ company:manage), sahip değilse.
 * - SATIN_ALMACI / SATISCI: grupta ≥1 işlem izni.
 * - ONAYLAYICI: approval:act, yönetici/sahip DEĞİLSE (yönetici zaten onaylar).
 */
export function rolesFromPermissions(
  perms: readonly string[],
  isOwner: boolean,
): CompanyRoleKey[] {
  const out: CompanyRoleKey[] = [];
  const manager = !isOwner && hasManagementPermission(perms);
  if (isOwner) out.push("SAHIP");
  else if (manager) out.push("YONETICI");
  if (hasBuySeat(perms)) out.push("SATIN_ALMACI");
  if (hasSellSeat(perms)) out.push("SATISCI");
  if (perms.includes("approval:act") && !isOwner && !manager)
    out.push("ONAYLAYICI");
  return out;
}

/**
 * EFEKTİF izinler — kapılar ve /me bunu okur.
 * - Kurucu: örtük yönetim/onay/görüntüleme/sahibe-özel + yazılı işlem izinleri.
 * - Diğerleri: yazılı liste.
 * - GEÇİŞ EMNİYETİ: liste boş ama roller doluysa (izin kolonunu yazmayan eski
 *   bir yol/script) rol hazır setine düşer — kimse sessizce kilitlenmez.
 */
export function effectivePermissions(user: {
  isOwner: boolean;
  permissions?: readonly string[] | null;
  roles?: readonly string[] | null;
}): string[] {
  const stored = user.permissions ?? [];
  const base =
    stored.length === 0 && (user.roles?.length ?? 0) > 0
      ? permissionsForRoles(user.roles ?? [])
      : normalizePermissions(stored);
  if (!user.isOwner) return base;
  const set = new Set<string>([...base, ...OWNER_IMPLICIT_PERMISSIONS]);
  return ALL_KNOWN_PERMISSIONS.filter((k) => set.has(k));
}

/**
 * Tek izin kontrolü. `required` dizi ise HERHANGİ BİRİ yeter (any-of).
 * Sahibe-özel anahtarlar yalnız `isOwner`; kurucunun örtük izinleri
 * `effectivePermissions` ile gelir. Eski anahtar verilirse yenisine eşlenir.
 */
export function hasCompanyPermission(
  user: {
    isOwner: boolean;
    permissions?: readonly string[] | null;
    roles?: readonly string[] | null;
  },
  required: string | readonly string[],
): boolean {
  const needed = (Array.isArray(required) ? required : [required]) as string[];
  const effective = effectivePermissions(user);
  return needed.some((raw) => {
    const key =
      raw in LEGACY_PERMISSION_MAP ? LEGACY_PERMISSION_MAP[raw] : raw;
    if (!key) return false;
    if ((OWNER_ONLY_PERMISSIONS as readonly string[]).includes(key))
      return user.isOwner;
    return effective.includes(key);
  });
}
