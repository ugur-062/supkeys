// @vitest-environment jsdom
/**
 * PANEL SEKME BAŞLIĞI (kayıt denetimi 2026-10 signup-tr-23): panel sayfaları
 * yalnız "Rothern" başlığıyla açılıyordu. Başlık kabukta, rota etiketi
 * kaynağından (`getCompanyBreadcrumb` + `SETTINGS_PAGES`) üretilir:
 * "<sayfa adı> · Rothern", arayüz dilinde.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { COMPANY_AREA, PORTALS, allPortalRoutes } from "@/lib/company/portals";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";
import { panelDocumentTitle, panelTitleRef, useCompanyDocumentTitle } from "../document-title";

afterEach(() => {
  document.title = "";
});

describe("panelTitleRef — yol → başlık kaynağı", () => {
  it("bulgudaki yedi sayfanın hepsinin bir adı var", () => {
    expect(panelTitleRef("/company/satis")).toEqual({ source: "nav", key: "portal.satisHome" });
    expect(panelTitleRef("/company/satinalma")).toEqual({ source: "nav", key: "portal.satinalmaHome" });
    expect(panelTitleRef("/company/sirketim")).toEqual({ source: "nav", key: "sirketim.overviewCrumb" });
    expect(panelTitleRef("/company/sirketim/profil")).toEqual({ source: "nav", key: "sirketim.profile" });
    expect(panelTitleRef("/company/ayarlar")).toEqual({ source: "nav", key: "extra.ayarlar" });
    expect(panelTitleRef("/company/ayarlar/dogrulama")).toEqual({ source: "settings", key: "dogrulama" });
    expect(panelTitleRef("/company/bildirimler")).toEqual({ source: "nav", key: "extra.bildirimler" });
  });

  it("rota kaydındaki her menü/ikincil sayfa kendi etiketini alır", () => {
    for (const portal of Object.values(PORTALS)) {
      for (const item of allPortalRoutes(portal)) {
        if (item.href === portal.basePath) continue;
        expect(panelTitleRef(item.href), item.href).toEqual({ source: "nav", key: item.label });
      }
    }
    for (const item of COMPANY_AREA.nav) {
      if (item.href === COMPANY_AREA.basePath) continue;
      expect(panelTitleRef(item.href), item.href).toEqual({ source: "nav", key: item.label });
    }
  });

  it("Ayarlar alt sayfaları sayfanın kendi başlığını alır; tanınmayan alt sayfa Ayarlar'a düşer", () => {
    for (const page of Object.values(SETTINGS_PAGES)) {
      if (!page.href.startsWith("/company/ayarlar/")) continue;
      expect(panelTitleRef(page.href), page.href).toEqual({ source: "settings", key: page.key });
    }
    expect(panelTitleRef("/company/ayarlar/bilinmeyen")).toEqual({ source: "nav", key: "extra.ayarlar" });
  });

  it("alt yol en yakın üst sayfanın adını alır; portal kökünde alan adı (\"· Anasayfa\" değil)", () => {
    expect(panelTitleRef("/company/satinalma/taleplerim/yeni")).toEqual({ source: "nav", key: "satinalma.taleplerim" });
    expect(panelTitleRef("/company/satinalma/taleplerim/abc123/duzenle")).toEqual({
      source: "nav",
      key: "satinalma.taleplerim",
    });
    expect(panelTitleRef("/company/satinalma/sablonlar/kalemler")).toEqual({ source: "nav", key: "satinalma.sablonlar" });
    expect(panelTitleRef("/company/satinalma/urunler/firma-a/urun-b")).toEqual({ source: "nav", key: "satinalma.urunler" });
    expect(panelTitleRef("/company/satinalma/kategori/39000000-elektrik")).toEqual({ source: "nav", key: "portal.satinalma" });
    expect(panelTitleRef("/company/sirketim/raporlar/tasarruf")).toEqual({ source: "nav", key: "sirketim.reports" });
    expect(panelTitleRef("/company/ilan/abc/teklif-ver")).toEqual({ source: "nav", key: "extra.ilanDetayi" });
    expect(panelTitleRef("/company/satis/acik-talep/42")).toEqual({ source: "nav", key: "extra.ilanDetayi" });
    expect(panelTitleRef("/company/siparis/o1")).toEqual({ source: "nav", key: "extra.siparisDetayi" });
    expect(panelTitleRef("/company/satis/")).toEqual({ source: "nav", key: "portal.satisHome" });
  });

  it("rota kaydında olmayan panel sayfaları var olan etiketle; hiçbiri yoksa null", () => {
    expect(panelTitleRef("/company/mesajlar")).toEqual({ source: "messages" });
    expect(panelTitleRef("/company/firma-dizini")).toEqual({ source: "nav", key: "common.companies" });
    expect(panelTitleRef("/company/firma/RTH-1")).toEqual({ source: "nav", key: "common.companies" });
    expect(panelTitleRef("/company/urun/firma-a/urun-b")).toEqual({ source: "nav", key: "satinalma.urunler" });
    expect(panelTitleRef("/company")).toBeNull();
    expect(panelTitleRef("/company/bilinmeyen-sayfa")).toBeNull();
    expect(panelTitleRef(null)).toBeNull();
  });

  it("panelDocumentTitle: kök şablonla aynı biçim; ad yoksa yalnız marka", () => {
    expect(panelDocumentTitle("Taleplerim")).toBe("Taleplerim · Rothern");
    expect(panelDocumentTitle(null)).toBe("Rothern");
  });
});

describe("useCompanyDocumentTitle", () => {
  it("sekme başlığını etkin sayfaya göre kurar ve gezinmede günceller (arayüz dilinde)", () => {
    document.title = "Rothern";
    const { rerender } = renderHook(({ p }) => useCompanyDocumentTitle(p), {
      initialProps: { p: "/company/satis" as string | null },
    });
    expect(document.title).toBe("Satış · Anasayfa · Rothern");
    rerender({ p: "/company/satinalma/taleplerim" });
    expect(document.title).toBe("Taleplerim · Rothern");
    rerender({ p: "/company/ayarlar/dogrulama" });
    expect(document.title).toBe("Doğrulama Belgeleri · Rothern");
    rerender({ p: "/company/sirketim/profil" });
    expect(document.title).toBe("Profil · Rothern");
    rerender({ p: "/company/mesajlar" });
    expect(document.title).toBe("Mesajlar · Rothern");
    // Adı olmayan sayfada önceki sayfanın adı kalmaz.
    rerender({ p: "/company/bilinmeyen-sayfa" });
    expect(document.title).toBe("Rothern");
  });

  it("Next başlığı yeniden yazarsa (akışla gelen meta) sayfa adı geri gelir", async () => {
    renderHook(() => useCompanyDocumentTitle("/company/bildirimler"));
    expect(document.title).toBe("Bildirimler · Rothern");
    // `<title>` öğesinin metni değişir.
    document.title = "Rothern";
    await waitFor(() => expect(document.title).toBe("Bildirimler · Rothern"));
    // `<title>` öğesi sökülüp yenisi takılır.
    document.head.querySelector("title")?.remove();
    const fresh = document.createElement("title");
    fresh.textContent = "Rothern";
    document.head.appendChild(fresh);
    await waitFor(() => expect(document.title).toBe("Bildirimler · Rothern"));
  });

  it("başlık öğesi <head> dışındaysa da (akışla gelen meta) yazılır ve izlenir", async () => {
    document.head.querySelector("title")?.remove();
    const stray = document.createElement("title");
    stray.textContent = "Rothern";
    document.body.appendChild(stray);
    try {
      renderHook(() => useCompanyDocumentTitle("/company/onaylar"));
      expect(document.title).toBe("Onaylar · Rothern");
      stray.textContent = "Rothern";
      await waitFor(() => expect(document.title).toBe("Onaylar · Rothern"));
    } finally {
      stray.remove();
    }
  });

  it("kabuk sökülünce başlık markaya döner; yeni sayfa kendi başlığını yazdıysa dokunulmaz", async () => {
    const first = renderHook(() => useCompanyDocumentTitle("/company/satis/tekliflerim"));
    expect(document.title).toBe("Tekliflerim · Rothern");
    first.unmount();
    expect(document.title).toBe("Rothern");

    // Panel dışına gezinme: yeni sayfanın metası başlığı AYNI işlemde yazar,
    // kabuk hemen ardından sökülür — yeni başlık ne markaya çevrilir ne de
    // eski sayfa adına geri alınır.
    const second = renderHook(() => useCompanyDocumentTitle("/company/satis/tekliflerim"));
    document.title = "Giriş · Rothern";
    second.unmount();
    await new Promise((r) => setTimeout(r, 20));
    expect(document.title).toBe("Giriş · Rothern");
  });
});
