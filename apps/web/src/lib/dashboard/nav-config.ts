import {
  BarChart3,
  CheckSquare,
  FileText,
  FolderOpen,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Plus,
  Settings,
  User,
  Users,
} from "lucide-react";

export type NavItem =
  | {
      type: "link";
      icon: LucideIcon;
      label: string;
      href: string;
      /** Sidebar'da kırmızı/mavi rakamlı badge — 0 ise gizlenir */
      badge?: number;
      /** V2-6.5 — Sidebar'da görünürlüğü için gerekli RBAC permission. null/undefined = herkese açık */
      permission?: string;
    }
  | {
      type: "cta";
      icon: LucideIcon;
      label: string;
      href: string;
      /** V2-6.5 — RBAC permission */
      permission?: string;
    };

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navConfig: NavGroup[] = [
  {
    label: "Operasyonel",
    items: [
      {
        type: "link",
        icon: LayoutDashboard,
        label: "Dashboard",
        href: "/dashboard",
      },
      {
        type: "link",
        icon: FileText,
        label: "İhaleler",
        href: "/dashboard/ihaleler",
        permission: "tender:view",
      },
      {
        type: "cta",
        icon: Plus,
        label: "Yeni İhale Aç",
        href: "/dashboard/ihaleler/yeni",
        permission: "tender:create",
      },
      {
        type: "link",
        icon: CheckSquare,
        label: "Onay Bekleyenler",
        href: "/dashboard/onay-bekleyenler",
        badge: 0,
        permission: "approval:view",
      },
      {
        type: "link",
        icon: Package,
        label: "Siparişler",
        href: "/dashboard/siparisler",
        permission: "order:view",
      },
    ],
  },
  {
    label: "Yönetimsel",
    items: [
      {
        type: "link",
        icon: Users,
        label: "Tedarikçiler",
        href: "/dashboard/tedarikciler",
        permission: "settings:suppliers",
      },
      {
        type: "link",
        icon: BarChart3,
        label: "Raporlar",
        href: "/dashboard/raporlar",
        permission: "reports:view",
      },
      {
        type: "link",
        icon: FolderOpen,
        label: "Şablonlar",
        href: "/dashboard/sablonlar",
        permission: "templates:view",
      },
      {
        type: "link",
        icon: Settings,
        label: "Ayarlar",
        href: "/dashboard/ayarlar",
      },
    ],
  },
];

/**
 * Sidebar footer'da kullanıcı kartı üzerinde gösterilen tek-öğe profil linki.
 * Gruplardan ayrı tutulur — semantik olarak "kişisel" bölge.
 */
export const profileNavItem: NavItem = {
  type: "link",
  icon: User,
  label: "Profil",
  href: "/dashboard/profil",
};

/**
 * Pathname → breadcrumb labelları. Tek ya da iki seviye.
 */
export function getBreadcrumbs(pathname: string): string[] {
  if (pathname === "/dashboard") return ["Dashboard"];

  const labels: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/dashboard/ihaleler": "İhaleler",
    "/dashboard/ihaleler/yeni": "Yeni İhale",
    "/dashboard/onay-bekleyenler": "Onay Bekleyenler",
    "/dashboard/siparisler": "Siparişler",
    "/dashboard/tedarikciler": "Tedarikçiler",
    "/dashboard/raporlar": "Raporlar",
    "/dashboard/sablonlar": "Şablonlar",
    "/dashboard/ayarlar": "Ayarlar",
    "/dashboard/profil": "Profilim",
  };

  // Exact match önce
  if (labels[pathname]) {
    if (pathname === "/dashboard/ihaleler/yeni") {
      return ["Dashboard", "İhaleler", "Yeni İhale"];
    }
    return ["Dashboard", labels[pathname]];
  }

  // Fallback
  return ["Dashboard"];
}

/**
 * Sidebar item'ı pathname'e göre aktif mi?
 * Dashboard: sadece exact match (alt rotalar kendi item'larında highlight olur)
 * Diğerleri: prefix match
 */
export function isItemActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
