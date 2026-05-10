import {
  FileText,
  LayoutDashboard,
  type LucideIcon,
  MessageCircle,
  Package,
  Settings,
  User,
} from "lucide-react";

export interface SupplierNavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  /** "Yakında" rozeti gösterilsin mi */
  placeholder?: boolean;
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
    placeholder: true,
  },
  {
    icon: MessageCircle,
    label: "Mesajlar",
    href: "/supplier/mesajlar",
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
    placeholder: true,
  },
];

const BREADCRUMB_LABELS: Record<string, string> = {
  "/supplier/dashboard": "Ana Sayfa",
  "/supplier/ihaleler": "İhaleler",
  "/supplier/siparisler": "Siparişler",
  "/supplier/mesajlar": "Mesajlar",
  "/supplier/profil": "Profilim",
  "/supplier/ayarlar": "Ayarlar",
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
