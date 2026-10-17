// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { usePortalStore } from "@/lib/company/portal-store";
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
    sessionStorage.setItem("rothern:quick-ai-suppliers", '{"rows":[{"email":"a@b.com"}]}');
    sessionStorage.setItem("rothern:quick-ai-suppliers:auto", "k");
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
    // Derin denetim S092: AI tedarikçi keşfi sonuçları da firma verisidir.
    expect(sessionStorage.getItem("rothern:quick-ai-suppliers")).toBeNull();
    expect(sessionStorage.getItem("rothern:quick-ai-suppliers:auto")).toBeNull();
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

  // Arayüz testi 2026-10 relogin-2: "son ziyaret edilen panel" çıkışta
  // silinmiyordu — aynı tarayıcıda sonra giriş yapan kişi önceki kullanıcının
  // paneline (`/company/satis`) düşüyordu.
  describe("hatırlanan panel", () => {
    const stored = () => JSON.parse(localStorage.getItem("rothern-company-portal") ?? "null") as {
      state: { lastPortal: string | null; sidebarPinned: boolean };
    } | null;

    beforeEach(() => {
      usePortalStore.setState({ lastPortal: "satis", sidebarPinned: false });
    });

    it("açık çıkış: hatırlanan panel sıfırlanır (bellekte ve kalıcı kayıtta); kenar çubuğu tercihi kalır", () => {
      expect(stored()?.state.lastPortal).toBe("satis");
      clearTenantSessionData();
      expect(usePortalStore.getState().lastPortal).toBeNull();
      expect(stored()?.state.lastPortal).toBeNull();
      // Cihaz tercihi: kimin girdiğinden bağımsız.
      expect(usePortalStore.getState().sidebarPinned).toBe(false);
      expect(stored()?.state.sidebarPinned).toBe(false);
    });

    it("oturum düşüp aynı sekmede FARKLI kullanıcı girerse de sıfırlanır; aynı kullanıcıda korunur", () => {
      bindSessionOwner("u1");
      bindSessionOwner("u1");
      expect(usePortalStore.getState().lastPortal).toBe("satis");
      bindSessionOwner("u2");
      expect(usePortalStore.getState().lastPortal).toBeNull();
    });
  });
});
