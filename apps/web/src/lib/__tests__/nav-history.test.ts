// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { cameFromInApp, markNavEntry, noteNavigation, resetNavHistoryForTest } from "../nav-history";

describe("nav-history — uygulama içi geri izi (arayüz testi D-156, webA-04)", () => {
  beforeEach(() => {
    resetNavHistoryForTest();
  });

  it("doğrudan açılış: geçmişe girdi eklenmediyse uygulama içi değil", () => {
    window.history.replaceState(null, "", "/company/firma/RTH-1");
    markNavEntry();
    expect(cameFromInApp()).toBe(false);
  });

  it("dil yönlendirmesi (replace) adresi değiştirse de uygulama içi sayılmaz", () => {
    window.history.replaceState(null, "", "/en/company/companies/RTH-1");
    markNavEntry();
    // LocaleUrlSync → router.replace (hesap dili tr): adres değişir, girdi eklenmez.
    window.history.replaceState(null, "", "/company/firma/RTH-1");
    noteNavigation();
    expect(cameFromInApp()).toBe(false);
  });

  it("istemci tarafı gezinme (push) sonrası uygulama içi", () => {
    window.history.replaceState(null, "", "/company/satinalma/firmalar");
    markNavEntry();
    window.history.pushState(null, "", "/company/firma/RTH-1");
    noteNavigation();
    expect(cameFromInApp()).toBe(true);
  });

  it("giriş işaretlenmeden çağrılırsa (çocuk efekti önce) girişi kendisi kaydeder", () => {
    window.history.replaceState(null, "", "/company/firma/RTH-1");
    expect(cameFromInApp()).toBe(false);
    noteNavigation();
    expect(cameFromInApp()).toBe(false);
  });
});
