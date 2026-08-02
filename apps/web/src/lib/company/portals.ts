import { tierAtLeast } from "@rothern/shared";
import type { CompanyRole } from "@/lib/company-auth/types";
import {
  BuildingStorefrontIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  DocumentDuplicateIcon,
  HomeIcon,
  IdentificationIcon,
  InboxArrowDownIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  TagIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";
import type { ComponentType, SVGProps } from "react";

type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { "data-slot"?: string }>;

export type PortalKey = "satinalma" | "satis";

export interface PortalNavItem {
  icon: NavIcon;
  label: string;
  href: string;
  /** En az bu kademede aktif (altındakine kilitli teaser). Faz T. */
  minTier?: "BRONZ" | "SILVER";
}

export interface PortalDef {
  key: PortalKey;
  label: string;
  /** Bu portala erişim veren operasyon rolü. */
  role: CompanyRole;
  basePath: string;
  accent: "blue" | "emerald";
  nav: PortalNavItem[];
}

export const PORTALS: Record<PortalKey, PortalDef> = {
  satinalma: {
    key: "satinalma",
    label: "Satınalma",
    role: "SATIN_ALMACI",
    basePath: "/company/satinalma",
    accent: "blue",
    nav: [
      { icon: HomeIcon, label: "Anasayfa", href: "/company/satinalma" },
      {
        icon: ClipboardDocumentListIcon,
        label: "İhalelerim",
        href: "/company/satinalma/ihalelerim",
      },
      {
        icon: ShoppingCartIcon,
        label: "Satın Al",
        href: "/company/satinalma/satin-al",
        minTier: "SILVER",
      },
      {
        icon: TagIcon,
        label: "Tekliflerim",
        href: "/company/satinalma/tekliflerim",
      },
      {
        icon: ShoppingBagIcon,
        label: "Siparişlerim",
        href: "/company/satinalma/siparisler",
      },
      {
        icon: ChartBarIcon,
        label: "Raporlar",
        href: "/company/satinalma/raporlar",
        minTier: "SILVER",
      },
      {
        icon: DocumentDuplicateIcon,
        label: "Şablonlar",
        href: "/company/satinalma/sablonlar",
        minTier: "SILVER",
      },
      {
        icon: UsersIcon,
        label: "Bağlantılar",
        href: "/company/satinalma/tedarikcilerim",
      },
      {
        icon: IdentificationIcon,
        label: "Profilim",
        href: "/company/satinalma/profilim",
      },
    ],
  },
  satis: {
    key: "satis",
    label: "Satış",
    role: "SATISCI",
    basePath: "/company/satis",
    accent: "emerald",
    nav: [
      { icon: HomeIcon, label: "Anasayfa", href: "/company/satis" },
      {
        icon: TagIcon,
        label: "Satış İhalelerim",
        href: "/company/satis/ilanlarim",
        // Satış ilanı açma Silver+ (kilit ikonu + segment layout kapısı).
        minTier: "SILVER",
      },
      {
        icon: InboxArrowDownIcon,
        label: "Açık İhaleler",
        href: "/company/satis/acik-ihaleler",
      },
      {
        icon: ClipboardDocumentListIcon,
        label: "Tekliflerim",
        href: "/company/satis/tekliflerim",
      },
      {
        icon: ShoppingBagIcon,
        label: "Satışlarım",
        href: "/company/satis/siparisler",
      },
      {
        icon: ChartBarIcon,
        label: "Raporlar",
        href: "/company/satis/raporlar",
        minTier: "SILVER",
      },
      {
        icon: DocumentDuplicateIcon,
        label: "Şablonlar",
        href: "/company/satis/sablonlar",
        minTier: "SILVER",
      },
      {
        icon: BuildingStorefrontIcon,
        label: "Bağlantılar",
        href: "/company/satis/musterilerim",
      },
      {
        icon: IdentificationIcon,
        label: "Profilim",
        href: "/company/satis/profilim",
        // Herkese açık profil/dizin görünürlüğü Bronz'dan başlar.
        minTier: "BRONZ",
      },
    ],
  },
};

export const PORTAL_ORDER: PortalKey[] = ["satinalma", "satis"];

/** URL'den aktif portalı türetir (kaynak: pathname). */
export function activePortalFromPath(pathname: string | null): PortalKey | null {
  if (!pathname) return null;
  if (pathname.startsWith("/company/satinalma")) return "satinalma";
  if (pathname.startsWith("/company/satis")) return "satis";
  return null;
}

/**
 * Kullanıcının rollerine göre erişebildiği portallar. YONETICI ikisini de görür;
 * SATIN_ALMACI → satınalma, SATISCI → satış. Bir kişi YÖNETİCİ olmadan iki role
 * birden sahip olabilir (ikisi de açılır).
 */
/**
 * Erişilebilir portallar. Satınalma (alıcı/ihale açma) = **Silver+**;
 * altındaki kademeler yalnızca satış (teklif) tarafına erişir.
 */
export function accessiblePortals(
  roles: CompanyRole[],
  tier?: string,
): PortalKey[] {
  // Kurucu (SAHIP) ⊇ Yönetici — her iki portalı da görür.
  const isManager = roles.includes("YONETICI") || roles.includes("SAHIP");
  const out: PortalKey[] = [];
  if (
    (isManager || roles.includes("SATIN_ALMACI")) &&
    tierAtLeast(tier ?? "STANDART", "SILVER")
  )
    out.push("satinalma");
  if (isManager || roles.includes("SATISCI")) out.push("satis");
  return out;
}

/**
 * Mesajlaşma = operasyon rolü işi: portalın işlem rolü (satınalma→Satın
 * Almacı, satış→Satışçı) olmayan kullanıcı — Kurucu/Yönetici dahil — o
 * portalda mesajlaşamaz ve gelen kutusunu göremez (API aynası: 403).
 */
export function canUseMessaging(
  roles: CompanyRole[],
  portal: PortalKey,
): boolean {
  return roles.includes(PORTALS[portal].role);
}

export function isPortalItemActive(
  href: string,
  pathname: string | null,
): boolean {
  if (!pathname) return false;
  const base =
    href === "/company/satinalma" || href === "/company/satis";
  if (base) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
