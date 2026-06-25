import {
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  HomeIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  ShoppingBagIcon,
  TagIcon,
} from "@heroicons/react/20/solid";
import type { ComponentType, SVGProps } from "react";

type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { "data-slot"?: string }>;

export interface CompanyNavItem {
  icon: NavIcon;
  label: string;
  href: string;
  /** Yalnızca PAKET üyelikte aktif (STANDARD'da kilitli teaser). */
  paidOnly?: boolean;
}

// Birleşik panel — tek menü. Alım/satım ayrımı yok; satırlar etiketli.
export const companyNavConfig: CompanyNavItem[] = [
  { icon: HomeIcon, label: "İşlerim", href: "/company" },
  { icon: ClipboardDocumentListIcon, label: "İlanlar", href: "/company/ilanlar" },
  { icon: TagIcon, label: "Teklifler", href: "/company/teklifler" },
  { icon: ShoppingBagIcon, label: "Siparişler", href: "/company/siparisler" },
  { icon: LinkIcon, label: "Bağlantılar", href: "/company/baglantilar" },
  {
    icon: MagnifyingGlassIcon,
    label: "Keşfet",
    href: "/company/kesfet",
    paidOnly: true,
  },
  { icon: Cog6ToothIcon, label: "Ayarlar", href: "/company/ayarlar" },
];

const BREADCRUMB_LABELS: Record<string, string> = {
  "/company": "İşlerim",
  "/company/ilanlar": "İlanlar",
  "/company/teklifler": "Teklifler",
  "/company/siparisler": "Siparişler",
  "/company/baglantilar": "Bağlantılar",
  "/company/kesfet": "Keşfet",
  "/company/ayarlar": "Ayarlar",
};

export function getCompanyBreadcrumb(pathname: string): string {
  return BREADCRUMB_LABELS[pathname] ?? "Panel";
}

export function isCompanyItemActive(
  href: string,
  pathname: string | null,
): boolean {
  if (!pathname) return false;
  if (href === "/company") return pathname === "/company";
  return pathname === href || pathname.startsWith(`${href}/`);
}
