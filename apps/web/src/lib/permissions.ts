import type { UserRole } from "@/lib/auth/types";

/**
 * V2-6.5 — Frontend RBAC sabitleri. Backend permissions.constants.ts ile
 * SENKRON tutulmalı. 6 grup, 22 permission.
 */

export interface PermissionItem {
  key: string;
  label: string;
}

export interface PermissionGroup {
  label: string;
  items: PermissionItem[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "İhale",
    items: [
      { key: "tender:create", label: "İhale oluşturabilir" },
      { key: "tender:edit", label: "İhale düzenleyebilir" },
      { key: "tender:publish", label: "İhale yayınlayabilir" },
      { key: "tender:delete", label: "İhale silebilir" },
      { key: "tender:award", label: "Kazananı seçebilir" },
      { key: "tender:cancel", label: "İhale iptal edebilir" },
      { key: "tender:view", label: "İhaleleri görüntüleyebilir" },
    ],
  },
  {
    label: "Teklif",
    items: [
      { key: "bid:compare", label: "Teklifleri karşılaştırabilir" },
      { key: "bid:eliminate", label: "Teklif eleyebilir" },
    ],
  },
  {
    label: "Sipariş",
    items: [
      { key: "order:edit", label: "Sipariş düzenleyebilir" },
      { key: "order:complete", label: "Sipariş tamamlayabilir" },
      { key: "order:cancel", label: "Sipariş iptal edebilir" },
      { key: "order:view", label: "Siparişleri görüntüleyebilir" },
    ],
  },
  {
    label: "Onay",
    items: [
      { key: "approval:approve", label: "Onay süreçlerinde onaylayabilir" },
      { key: "approval:view", label: "Onay süreçlerini görüntüleyebilir" },
    ],
  },
  {
    label: "Ayarlar",
    items: [
      { key: "settings:users", label: "Kullanıcı yönetebilir" },
      { key: "settings:suppliers", label: "Tedarikçi yönetebilir" },
      { key: "settings:addresses", label: "Adresleri yönetebilir" },
      { key: "settings:approval", label: "Onay akışını yönetebilir" },
      { key: "settings:company", label: "Firma bilgilerini düzenleyebilir" },
    ],
  },
  {
    label: "Raporlar",
    items: [
      { key: "reports:view", label: "Raporları görüntüleyebilir" },
      { key: "reports:export", label: "Rapor dışa aktarabilir" },
    ],
  },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.items.map((i) => i.key),
);

export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i.label]),
);

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, string[]> = {
  COMPANY_ADMIN: [
    "settings:users",
    "settings:suppliers",
    "settings:addresses",
    "settings:approval",
    "settings:company",
    "tender:view",
    // V2-6.5 düzeltme: Firma Yöneticisi tekliflerini görebilmeli (yönetim
    // işlevi). Eleme (bid:eliminate) yine operasyonel — sadece BUYER'da.
    "bid:compare",
    "order:view",
    "approval:view",
    // V2-6.5 düzeltme: Firma Yöneticisi onay akışında sıklıkla son onaylayıcı
    // olduğu için approve yetkisi default'ta verilir.
    "approval:approve",
    "reports:view",
    "reports:export",
  ],
  BUYER: [
    "tender:create",
    "tender:edit",
    "tender:publish",
    "tender:delete",
    "tender:award",
    "tender:cancel",
    "tender:view",
    "bid:compare",
    "bid:eliminate",
    "order:edit",
    "order:complete",
    "order:cancel",
    "order:view",
    // Tedarikçi listesini görüntüleme + davet etme her rolde varsayılan
    "settings:suppliers",
    "reports:view",
  ],
  APPROVER: [
    "approval:approve",
    "approval:view",
    "tender:view",
    "order:view",
    // Tedarikçi listesini görüntüleme + davet etme her rolde varsayılan
    "settings:suppliers",
  ],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  COMPANY_ADMIN: "Firma Yöneticisi",
  BUYER: "Satın Almacı",
  APPROVER: "Onaylayıcı",
};

/**
 * V2-6.5 fix — Rol başına KESİNLİKLE atanamayacak izinler. Backend ile
 * birebir SENKRON (permissions.constants.ts).
 *
 * - COMPANY_ADMIN bir yönetim rolüdür; ihale OLUŞTURMA yetkisi verilemez.
 *   UI'da bu izin toggle'ı disabled görünür.
 */
export const FORBIDDEN_PERMISSIONS_BY_ROLE: Record<UserRole, readonly string[]> =
  {
    COMPANY_ADMIN: ["tender:create"],
    BUYER: [],
    APPROVER: [],
  };

export function isPermissionForbiddenForRole(
  role: UserRole,
  permission: string,
): boolean {
  return FORBIDDEN_PERMISSIONS_BY_ROLE[role].includes(permission);
}

export interface PermissionsOverride {
  added?: string[];
  removed?: string[];
}

/**
 * Default rol yetkilerine göre, kullanıcının seçili permission'larından
 * `added` (default'ta yok ama eklenmiş) + `removed` (default'ta var ama kaldırılmış)
 * listelerini hesaplar. Boşsa override null olarak gönderilmeli.
 */
export function computePermissionsOverride(
  role: UserRole,
  selected: string[],
): PermissionsOverride | null {
  const defaults = ROLE_DEFAULT_PERMISSIONS[role] ?? [];
  const defaultsSet = new Set(defaults);
  const selectedSet = new Set(selected);
  const added = selected.filter((p) => !defaultsSet.has(p));
  const removed = defaults.filter((p) => !selectedSet.has(p));
  if (added.length === 0 && removed.length === 0) return null;
  return {
    ...(added.length > 0 ? { added } : {}),
    ...(removed.length > 0 ? { removed } : {}),
  };
}
