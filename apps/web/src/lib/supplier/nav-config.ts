import {
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  HomeIcon,
  ShoppingBagIcon,
  UserCircleIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";
import type { ComponentType, SVGProps } from "react";

// Catalyst SidebarItem ikonları `fill-*` ile renklendiği için solid (20)
// Heroicons kullanılır — Catalyst'in resmi ikon stili.
type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { "data-slot"?: string }>;

export interface SupplierNavItem {
  icon: NavIcon;
  label: string;
  href: string;
}

export const supplierNavConfig: SupplierNavItem[] = [
  {
    icon: HomeIcon,
    label: "Ana Sayfa",
    href: "/supplier/dashboard",
  },
  {
    icon: ClipboardDocumentListIcon,
    label: "İhaleler",
    href: "/supplier/ihaleler",
  },
  {
    icon: ShoppingBagIcon,
    label: "Siparişler",
    href: "/supplier/siparisler",
  },
  {
    icon: UsersIcon,
    label: "Alıcı Havuzu",
    href: "/supplier/alici-havuzu",
  },
  {
    icon: UserCircleIcon,
    label: "Profilim",
    href: "/supplier/profil",
  },
  {
    icon: Cog6ToothIcon,
    label: "Ayarlar",
    href: "/supplier/ayarlar",
  },
];

const BREADCRUMB_LABELS: Record<string, string> = {
  "/supplier/dashboard": "Ana Sayfa",
  "/supplier/ihaleler": "İhaleler",
  "/supplier/siparisler": "Siparişler",
  "/supplier/alici-havuzu": "Alıcı Havuzu",
  "/supplier/mesajlar": "Mesajlar",
  "/supplier/profil": "Profilim",
  "/supplier/ayarlar": "Ayarlar",
  "/supplier/ayarlar/hesap-bilgileri": "Hesap Bilgileri",
  "/supplier/ayarlar/sifre-islemleri": "Şifre İşlemleri",
  "/supplier/ayarlar/bildirim-tercihleri": "Bildirim Tercihleri",
};

export function getSupplierBreadcrumb(pathname: string): string {
  return BREADCRUMB_LABELS[pathname] ?? "Tedarikçi Paneli";
}

export function isSupplierItemActive(
  href: string,
  pathname: string | null,
): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
