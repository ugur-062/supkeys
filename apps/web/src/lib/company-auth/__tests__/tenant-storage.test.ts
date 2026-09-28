// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { bindSessionOwner, clearTenantSessionData } from "../tenant-storage";

// Yayın denetimi 2026-09-28 Bölüm 5: çıkış tarayıcıdaki firma verisini silmiyordu.
describe("tarayıcıdaki firma verisi", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem("quick-request-draft", '{"title":"Gizli talep"}');
    sessionStorage.setItem("quick-request-member-invites:lst1", "[]");
    sessionStorage.setItem("rothern:invite-prefill", '{"email":"x@y.com"}');
    sessionStorage.setItem("ai-tender-draft", "{}");
    sessionStorage.setItem("rothern.hero-scope:buy", "products"); // firma verisi değil
    localStorage.setItem("rothern.panel.recent-searches", "{}");
    localStorage.setItem("rothern.market.view", "grid"); // görünüm tercihi, kalır
  });

  it("açık çıkış: taslaklar, davet ön doldurma ve son aramalar silinir; nötr tercihler kalır", () => {
    clearTenantSessionData();
    expect(sessionStorage.getItem("quick-request-draft")).toBeNull();
    expect(sessionStorage.getItem("quick-request-member-invites:lst1")).toBeNull();
    expect(sessionStorage.getItem("rothern:invite-prefill")).toBeNull();
    expect(sessionStorage.getItem("ai-tender-draft")).toBeNull();
    expect(localStorage.getItem("rothern.panel.recent-searches")).toBeNull();
    expect(sessionStorage.getItem("rothern.hero-scope:buy")).toBe("products");
    expect(localStorage.getItem("rothern.market.view")).toBe("grid");
  });

  it("aynı kullanıcı yeniden girerse taslak KORUNUR; farklı kullanıcı girerse silinir", () => {
    bindSessionOwner("u1");
    bindSessionOwner("u1");
    expect(sessionStorage.getItem("quick-request-draft")).not.toBeNull();
    bindSessionOwner("u2");
    expect(sessionStorage.getItem("quick-request-draft")).toBeNull();
    expect(sessionStorage.getItem("rothern.session-owner")).toBe("u2");
  });
});
