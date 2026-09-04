import { describe, expect, it } from "vitest";
import { getCompanyBreadcrumb } from "../nav-config";
import { routeLabel } from "../terms";
import { PORTALS, PORTAL_SECONDARY_HREFS, allPortalRoutes } from "../portals";

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
    // Profilim: satınalmada hesap menüsünde, SATIŞTA ana menüde (2026-09-03 —
    // satıcının vitrini günlük iş, Ayarlar'ın altında aranmamalı).
    expect(PORTALS.satinalma.nav.some((i) => i.href.endsWith("/profilim"))).toBe(false);
    expect(PORTALS.satis.nav.some((i) => i.href === "/company/satis/profilim")).toBe(true);
  });

  it("breadcrumb + routeLabel ikincil rotaları çözer", () => {
    expect(getCompanyBreadcrumb("/company/satinalma/raporlar")).toBe("Raporlar");
    expect(getCompanyBreadcrumb("/company/satinalma/sablonlar")).toBe("Şablonlar");
    expect(getCompanyBreadcrumb("/company/satis/profilim")).toBe("Profilim");
    expect(routeLabel("/company/satinalma/sablonlar")).toBe("Şablonlar");
    expect(routeLabel("/company/satinalma/raporlar")).toBe("Raporlar");
  });

  it("PORTAL_SECONDARY_HREFS rota kaydıyla tutarlı", () => {
    const sa = new Set(allPortalRoutes(PORTALS.satinalma).map((i) => i.href));
    expect(sa.has(PORTAL_SECONDARY_HREFS.satinalma.profilim)).toBe(true);
    expect(sa.has(PORTAL_SECONDARY_HREFS.satinalma.raporlar)).toBe(true);
    expect(sa.has(PORTAL_SECONDARY_HREFS.satinalma.sablonlar)).toBe(true);
    // Satışta Raporlar/Şablonlar YOK (satış ilanı kaldırıldı, 2026-09-04).
    const st = new Set(allPortalRoutes(PORTALS.satis).map((i) => i.href));
    expect(st.has(PORTAL_SECONDARY_HREFS.satis.profilim)).toBe(true);
    expect(PORTALS.satis.secondaryNav).toEqual([]);
  });
});
