import {
  BarChart3,
  CheckSquare,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
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
    }
  | {
      type: "cta";
      icon: LucideIcon;
      label: string;
      href: string;
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
      },
      {
        type: "link",
        icon: MessageSquare,
        label: "Teklifler",
        href: "/dashboard/teklifler",
      },
      {
        type: "cta",
        icon: Plus,
        label: "Yeni İhale Aç",
        href: "/dashboard/ihaleler/yeni",
      },
      {
        type: "link",
        icon: CheckSquare,
        label: "Onay Bekleyenler",
        href: "/dashboard/onay-bekleyenler",
        badge: 0,
      },
      {
        type: "link",
        icon: Package,
        label: "Siparişler",
        href: "/dashboard/siparisler",
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
      },
      {
        type: "link",
        icon: BarChart3,
        label: "Raporlar",
        href: "/dashboard/raporlar",
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
    "/dashboard/teklifler": "Teklifler",
    "/dashboard/onay-bekleyenler": "Onay Bekleyenler",
    "/dashboard/siparisler": "Siparişler",
    "/dashboard/tedarikciler": "Tedarikçiler",
    "/dashboard/raporlar": "Raporlar",
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
