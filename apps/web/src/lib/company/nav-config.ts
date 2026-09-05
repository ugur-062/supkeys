import { COMPANY_AREA, PORTALS, allPortalRoutes, isCompanyAreaPath } from "./portals";

const EXTRA: Record<string, string> = {
  "/company/ayarlar": "Ayarlar",
  "/company/profil": "Profil",
  "/company/bildirimler": "Bildirimler",
  "/company/onaylar": "Onaylar",
  "/company/premium": "Premium",
};

/** Navbar breadcrumb etiketi — portal nav tanımlarından + birkaç sabit yoldan. */
export function getCompanyBreadcrumb(pathname: string): string {
  if (isCompanyAreaPath(pathname)) {
    if (pathname === COMPANY_AREA.basePath) return `${COMPANY_AREA.label} · Genel Bakış`;
    const hit = [...COMPANY_AREA.nav, ...COMPANY_AREA.secondaryNav].find((i) => i.href === pathname);
    if (hit) return hit.label;
    if (pathname.startsWith(`${COMPANY_AREA.basePath}/raporlar/`)) return "Raporlar";
    return COMPANY_AREA.label;
  }
  for (const p of Object.values(PORTALS)) {
    if (pathname === p.basePath) return `${p.label} · Anasayfa`;
    for (const item of allPortalRoutes(p)) {
      if (pathname === item.href) return item.label;
    }
  }
  if (pathname.startsWith("/company/ilan/")) return "İlan Detayı";
  if (pathname.startsWith("/company/siparis/")) return "Sipariş Detayı";
  return EXTRA[pathname] ?? "Anasayfa";
}
