import { describe, expect, it } from "vitest";
import { getCompanyBreadcrumb } from "../nav-config";
import { routeLabel } from "../terms";
import { PORTALS, PORTAL_SECONDARY_HREFS } from "../portals";

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
      expect(p.nav.some((i) => i.href.endsWith("/profilim"))).toBe(false);
    }
  });

  it("breadcrumb + routeLabel ikincil rotaları çözer", () => {
    expect(getCompanyBreadcrumb("/company/satinalma/raporlar")).toBe("Raporlar");
    expect(getCompanyBreadcrumb("/company/satis/sablonlar")).toBe("Şablonlar");
    expect(getCompanyBreadcrumb("/company/satis/profilim")).toBe("Profilim");
    expect(routeLabel("/company/satinalma/sablonlar")).toBe("Şablonlar");
    expect(routeLabel("/company/satis/raporlar")).toBe("Raporlar");
  });

  it("PORTAL_SECONDARY_HREFS secondaryNav ile tutarlı", () => {
    for (const key of ["satinalma", "satis"] as const) {
      const hrefs = new Set(PORTALS[key].secondaryNav.map((i) => i.href));
      const s = PORTAL_SECONDARY_HREFS[key];
      expect(hrefs.has(s.profilim)).toBe(true);
      expect(hrefs.has(s.raporlar)).toBe(true);
      expect(hrefs.has(s.sablonlar)).toBe(true);
    }
  });
});
