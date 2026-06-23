// Catalyst SidebarItem ikonları `fill-*` ile renklendiği için solid (20)
// Heroicons kullanılır — tedarikçi paneliyle birebir aynı ikon stili.
import {
  ChartBarIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  BuildingStorefrontIcon,
  FolderIcon,
  HomeIcon,
  PlusIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";
import type { ComponentType, SVGProps } from "react";

type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { "data-slot"?: string }>;

export type NavItem =
  | {
      type: "link";
      icon: NavIcon;
      label: string;
      href: string;
      /** Sidebar'da kırmızı/mavi rakamlı badge — 0 ise gizlenir */
      badge?: number;
      /** V2-6.5 — Sidebar'da görünürlüğü için gerekli RBAC permission. null/undefined = herkese açık */
      permission?: string;
    }
  | {
      type: "cta";
      icon: NavIcon;
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
        icon: HomeIcon,
        label: "Dashboard",
        href: "/dashboard",
      },
      {
        type: "link",
        icon: ClipboardDocumentListIcon,
        label: "İhaleler",
        href: "/dashboard/ihaleler",
        permission: "tender:view",
      },
      {
        type: "cta",
        icon: PlusIcon,
        label: "Yeni İhale Aç",
        href: "/dashboard/ihaleler/yeni",
        permission: "tender:create",
      },
      {
        type: "link",
        icon: ClipboardDocumentCheckIcon,
        label: "Onay Bekleyenler",
        href: "/dashboard/onay-bekleyenler",
        badge: 0,
        permission: "approval:view",
      },
      {
        type: "link",
        icon: ShoppingBagIcon,
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
        icon: UsersIcon,
        label: "Tedarikçilerim",
        href: "/dashboard/tedarikciler",
        permission: "settings:suppliers",
      },
      {
        type: "link",
        icon: BuildingStorefrontIcon,
        label: "Tedarikçi Havuzu",
        href: "/dashboard/tedarikciler/havuz",
        permission: "settings:suppliers",
      },
      {
        type: "link",
        icon: ChartBarIcon,
        label: "Raporlar",
        href: "/dashboard/raporlar",
        permission: "reports:view",
      },
      {
        type: "link",
        icon: FolderIcon,
        label: "Şablonlar",
        href: "/dashboard/sablonlar",
        permission: "templates:view",
      },
      {
        type: "link",
        icon: ShieldCheckIcon,
        label: "Kurumsal Kimlik",
        href: "/dashboard/kurumsal-kimlik",
      },
      {
        type: "link",
        icon: Cog6ToothIcon,
        label: "Ayarlar",
        href: "/dashboard/ayarlar",
      },
    ],
  },
];

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
    "/dashboard/tedarikciler": "Tedarikçilerim",
    "/dashboard/tedarikciler/havuz": "Tedarikçi Havuzu",
    "/dashboard/raporlar": "Raporlar",
    "/dashboard/sablonlar": "Şablonlar",
    "/dashboard/kurumsal-kimlik": "Kurumsal Kimlik",
    "/dashboard/ayarlar": "Ayarlar",
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
