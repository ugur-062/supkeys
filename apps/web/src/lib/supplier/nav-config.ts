import {
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  User,
} from "lucide-react";

export interface SupplierNavItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

export const supplierNavConfig: SupplierNavItem[] = [
  {
    icon: LayoutDashboard,
    label: "Ana Sayfa",
    href: "/supplier/dashboard",
  },
  {
    icon: FileText,
    label: "İhaleler",
    href: "/supplier/ihaleler",
  },
  {
    icon: Package,
    label: "Siparişler",
    href: "/supplier/siparisler",
  },
  {
    icon: User,
    label: "Profilim",
    href: "/supplier/profil",
  },
  {
    icon: Settings,
    label: "Ayarlar",
    href: "/supplier/ayarlar",
  },
];

const BREADCRUMB_LABELS: Record<string, string> = {
  "/supplier/dashboard": "Ana Sayfa",
  "/supplier/ihaleler": "İhaleler",
  "/supplier/siparisler": "Siparişler",
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
