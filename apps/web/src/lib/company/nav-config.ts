import { PORTALS } from "./portals";

const EXTRA: Record<string, string> = {
  "/company/ayarlar": "Ayarlar",
  "/company/profil": "Profil",
  "/company/bildirimler": "Bildirimler",
  "/company/onaylar": "Onaylar",
  "/company/premium": "Premium",
};

/** Navbar breadcrumb etiketi — portal nav tanımlarından + birkaç sabit yoldan. */
export function getCompanyBreadcrumb(pathname: string): string {
  for (const p of Object.values(PORTALS)) {
    if (pathname === p.basePath) return `${p.label} · Anasayfa`;
    for (const item of p.nav) {
      if (pathname === item.href) return item.label;
    }
  }
  if (pathname.startsWith("/company/ilan/")) return "İlan Detayı";
  if (pathname.startsWith("/company/siparis/")) return "Sipariş Detayı";
  return EXTRA[pathname] ?? "Anasayfa";
}
