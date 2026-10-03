import { COMPANY_AREA, PORTALS, allPortalRoutes, isCompanyAreaPath } from "./portals";

const EXTRA: Record<string, string> = {
  "/company/ayarlar": "extra.ayarlar",
  "/company/profil": "extra.profil",
  "/company/bildirimler": "extra.bildirimler",
  "/company/onaylar": "extra.onaylar",
  "/company/premium": "extra.premium",
  "/company/premium/satin-al": "extra.premiumSatinAl",
};

/** Navbar breadcrumb etiketi — portal nav tanımlarından + birkaç sabit yoldan. */
export function getCompanyBreadcrumb(pathname: string): string {
  if (isCompanyAreaPath(pathname)) {
    if (pathname === COMPANY_AREA.basePath) return "sirketim.overviewCrumb";
    const hit = [...COMPANY_AREA.nav, ...COMPANY_AREA.secondaryNav].find((i) => i.href === pathname);
    if (hit) return hit.label;
    if (pathname.startsWith(`${COMPANY_AREA.basePath}/raporlar/`)) return "sirketim.reports";
    return COMPANY_AREA.label;
  }
  for (const p of Object.values(PORTALS)) {
    if (pathname === p.basePath) return `${p.label}Home`;
    for (const item of allPortalRoutes(p)) {
      if (pathname === item.href) return item.label;
    }
  }
  if (pathname.startsWith("/company/ilan/")) return "extra.ilanDetayi";
  if (pathname.startsWith("/company/siparis/")) return "extra.siparisDetayi";
  return EXTRA[pathname] ?? "common.home";
}
