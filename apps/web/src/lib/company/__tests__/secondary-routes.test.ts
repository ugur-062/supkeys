import { describe, expect, it } from "vitest";
import { getCompanyBreadcrumb } from "../nav-config";
import { routeLabel } from "../terms";
import { COMPANY_AREA, PORTALS, PORTAL_SECONDARY_HREFS, allPortalRoutes } from "../portals";

/**
 * 2026-08-22 menü sadeleştirmesi: Raporlar/Şablonlar/Profilim sol menüden
 * kalktı (secondaryNav) ama breadcrumb + routeLabel sözlüğü adlarını KORUR —
 * sayfa başlığı/geri linki "Anasayfa"ya düşmez.
 */
describe("ikincil rotalar — menü dışı ama etiketli", () => {
  it("secondaryNav menü nav'ında yok", () => {
    for (const p of Object.values(PORTALS)) {
      const navHrefs = new Set(p.nav.map((i) => i.href));
      for (const s of p.secondaryNav) expect(navHrefs.has(s.href)).toBe(false);
    }
    // Profilim ŞİRKETİM alanında (2026-09-05): hiçbir portal menüsünde yok.
    for (const p of Object.values(PORTALS)) {
      expect(allPortalRoutes(p).some((i) => i.href.endsWith("/profilim"))).toBe(false);
      expect(allPortalRoutes(p).some((i) => i.label === "Raporlar")).toBe(false);
    }
  });

  it("breadcrumb + routeLabel ikincil ve Şirketim rotalarını çözer", () => {
    expect(getCompanyBreadcrumb("/company/satinalma/sablonlar")).toBe("Şablonlar");
    expect(routeLabel("/company/satinalma/sablonlar")).toBe("Şablonlar");
    expect(getCompanyBreadcrumb("/company/sirketim")).toBe("Şirketim · Genel Bakış");
    expect(getCompanyBreadcrumb("/company/sirketim/profil")).toBe("Profil");
    expect(getCompanyBreadcrumb("/company/sirketim/raporlar")).toBe("Raporlar");
    expect(getCompanyBreadcrumb("/company/sirketim/raporlar/tasarruf")).toBe("Raporlar");
    expect(routeLabel("/company/sirketim/raporlar")).toBe("Raporlar");
    expect(routeLabel("/company/sirketim/profil")).toBe("Profil");
  });

  it("PORTAL_SECONDARY_HREFS Şirketim rotalarına işaret eder; satışta ikincil rota yok", () => {
    const ca = new Set(COMPANY_AREA.nav.map((i) => i.href));
    expect(ca.has(PORTAL_SECONDARY_HREFS.satinalma.profilim)).toBe(true);
    expect(ca.has(PORTAL_SECONDARY_HREFS.satinalma.raporlar)).toBe(true);
    expect(ca.has(PORTAL_SECONDARY_HREFS.satis.profilim)).toBe(true);
    const sa = new Set(allPortalRoutes(PORTALS.satinalma).map((i) => i.href));
    expect(sa.has(PORTAL_SECONDARY_HREFS.satinalma.sablonlar)).toBe(true);
    expect(PORTALS.satis.secondaryNav).toEqual([]);
    // Şirketim menüsü: Genel Bakış › Profil › Ziyaret Edenler › Raporlar.
    expect(COMPANY_AREA.nav.map((i) => i.label)).toEqual(["Genel Bakış", "Profil", "Ziyaret Edenler", "Raporlar"]);
  });
});
