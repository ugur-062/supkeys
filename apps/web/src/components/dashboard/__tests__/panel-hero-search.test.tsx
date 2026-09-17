// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sparkles } from "lucide-react";
import { PanelHeroSearch } from "../panel-hero-search";

const push = vi.fn();
const h = vi.hoisted(() => ({
  pathname: "/company/satinalma",
  search: "",
  mutate: vi.fn(),
  isPending: false,
}));
vi.mock("@/hooks/use-ai-search-intent", () => ({
  useAiSearchIntent: () => ({ mutate: h.mutate, isPending: h.isPending }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => h.pathname,
  useSearchParams: () => new URLSearchParams(h.search),
}));

describe("PanelHeroSearch — Europages 'Ne arıyorsunuz?' kutusu", () => {
  it("JS'siz de çalışır: form GET ile sonuç sayfasına ?q= gönderir", () => {
    render(<PanelHeroSearch title="Ne arıyorsunuz?" lead="x" placeholder="p" action="/company/satinalma/urunler" />);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/company/satinalma/urunler");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("searchbox")).toHaveAttribute("name", "q");
  });

  it("JS'de tam sayfa yenilemez: router.push ile ?q= (boş terimde sade sonuç sayfası)", () => {
    render(<PanelHeroSearch title="Ne arıyorsunuz?" lead="x" placeholder="p" action="/company/satinalma/urunler" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  çelik boru " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenLastCalledWith("/company/satinalma/urunler?q=%C3%A7elik%20boru");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenLastCalledWith("/company/satinalma/urunler");
  });

  it("sektör kısayolları en fazla 9 ve verilen hedefe gider; kısayol yoksa nav çizilmez", () => {
    // 2026-09-08 (kullanıcı tasarımı): çip şeridi ikonlu KARO ızgarasına
    // döndü; kaynak tasarımdaki gibi 8 sektör + "Tüm Sektörler" sığar.
    const chips = Array.from({ length: 12 }, (_, i) => ({
      id: `${10 + i}000000`,
      name: `Kat ${i}`,
      count: i + 1,
      href: `/x?kategori=${i}`,
    }));
    const { rerender } = render(<PanelHeroSearch title="T" lead="x" placeholder="p" action="/x" chips={chips} chipsLabel="Popüler" />);
    expect(screen.getByRole("navigation", { name: "Popüler" }).querySelectorAll("a")).toHaveLength(9);
    expect(screen.getByRole("link", { name: /Kat 0/ })).toHaveAttribute("href", "/x?kategori=0");
    rerender(<PanelHeroSearch title="T" lead="x" placeholder="p" action="/x" chips={[]} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("sonuç listesi AYNI sayfadaysa seçili süzgeçler korunur, yalnız q ve sayfa değişir", () => {
    h.pathname = "/company/satis";
    h.search = "durum=tumu&alici=c1&sayfa=3&q=eski";
    render(<PanelHeroSearch title="T" lead="x" placeholder="p" action="/company/satis" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "kablo" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenLastCalledWith("/company/satis?durum=tumu&alici=c1&q=kablo");
    // Boş terim: q düşer, süzgeçler kalır.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenLastCalledWith("/company/satis?durum=tumu&alici=c1");
    h.pathname = "/company/satinalma";
    h.search = "";
  });

  it("AI ile ara: anahtar, çok satırlı kutu, Enter gönderir, sonuç sayfaya iletilir; öneri kapalı", () => {
    const onResult = vi.fn();
    render(
      <PanelHeroSearch
        title="T"
        lead="x"
        placeholder="p"
        action="/company/satinalma"
        ai={{ portal: "satinalma", enabled: true, onResult }}
        suggestions={[{ label: "Ürünler", rows: [{ key: "a", label: "Pano", href: "/x" }] }]}
      />,
    );
    // Varsayılan klasik mod.
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /AI ile ara/ }));
    const box = screen.getByRole("textbox", { name: "AI ile ara" });
    expect(box.tagName).toBe("TEXTAREA");
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(box, { target: { value: "İstanbul'a 50 adet pano" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(h.mutate).toHaveBeenCalledWith(
      { text: "İstanbul'a 50 adet pano", portal: "satinalma" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    // Sonuç → sayfa (URL'yi sayfa kurar, kutu kurmaz).
    const r = { portal: "satinalma", summary: "Anladığım: pano" };
    h.mutate.mock.calls[0][1].onSuccess(r);
    expect(onResult).toHaveBeenCalledWith(r);
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining("pano"));
    // Kısa metin gönderilmez.
    h.mutate.mockClear();
    fireEvent.change(box, { target: { value: "ab" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("Silver altı: AI anahtarı devre dışı, 'Silver ile açılır' bağlantısı", () => {
    render(<PanelHeroSearch title="T" lead="x" placeholder="p" action="/x" ai={{ portal: "satis", enabled: false, onResult: vi.fn() }} />);
    expect(screen.getByRole("button", { name: /AI ile ara/ })).toBeDisabled();
    // PANELDEN ÇIKMAZ (2026-09-15): premium çağrıları panel içindeki paket
    // sayfasına gider; Ayarlar hub'ı da pazarlama sayfası da doğru yer değil.
    expect(screen.getByRole("link", { name: "Silver ile açılır" })).toHaveAttribute("href", "/company/premium");
  });
});

describe("PanelHeroSearch — görünüm sözleşmesi (2026-09-08 kullanıcı tasarımı)", () => {
  it("başlık iki tonlu, 'Ara' düğmesi çubuğun içinde ve 'Filtrele' YOK", () => {
    render(
      <PanelHeroSearch
        eyebrow="Tedarikçi ürün vitrini"
        title="Ne arıyorsunuz?"
        lead="Ürün, marka, parça numarası veya firma"
        placeholder="Ürün, marka, parça numarası veya firma arayın"
        action="/company/satinalma/urunler"
        accent="blue"
      />,
    );
    const h1 = screen.getByRole("heading", { level: 1, name: "Ne arıyorsunuz?" });
    // İlk sözcük koyu, kalanı portal renginde — tek başlık, bölünmüş metin değil.
    expect(h1.querySelector(".text-blue-600")?.textContent).toBe("arıyorsunuz?");
    const submit = screen
      .getAllByRole("button", { name: /^Ara/ })
      .find((b) => b.getAttribute("type") === "submit") as HTMLElement;
    expect(submit).toBeTruthy();
    // Süzgeçler sonuç sayfasının kenar rayında — hero'da "Filtrele" yok.
    expect(screen.queryByRole("button", { name: /Filtrele/ })).toBeNull();
  });

  it("'Ara' düğmesi PORTALIN rengindedir, siyah DEĞİL", () => {
    // 2026-09-08 (kullanıcı): satış hero'sunda da siyah yerine yeşil. İki
    // portalın birincil eylemi kendi vurgu renginde; siyah dolgu buraya geri
    // sızarsa bu test kırılır.
    const submit = () =>
      screen
        .getAllByRole("button", { name: /^Ara/ })
        .find((b) => b.getAttribute("type") === "submit") as HTMLElement;

    const { unmount } = render(
      <PanelHeroSearch title="T" lead="x" placeholder="p" action="/x" accent="blue" />,
    );
    expect(submit().className).toContain("bg-blue-600");
    expect(submit().className).not.toMatch(/bg-(zinc-950|black)/);
    unmount();

    render(<PanelHeroSearch title="T" lead="x" placeholder="p" action="/x" accent="emerald" />);
    expect(submit().className).toContain("bg-emerald-700");
    expect(submit().className).not.toMatch(/bg-(zinc-950|black)/);
  });
});

describe("PanelHeroSearch — kapsam seçici (Ürün / Firma)", () => {
  it("Firma seçilince form FİRMA dizinine gider, yer tutucu değişir ve çağıran haberdar olur", async () => {
    const onScopeChange = vi.fn();
    // 2026-09-08 (kullanıcı tasarımı): kapsam artık ÇUBUĞUN İÇİNDE açılır
    // seçici; iki pilli satır kalktı.
    const user = userEvent.setup();
    render(
      <PanelHeroSearch
        title="Ne arıyorsunuz?"
        lead="l"
        placeholder="Ürün, marka, parça numarası veya firma arayın"
        action="/company/satinalma/urunler"
        accent="blue"
        supplierScope={{
          action: "/company/satinalma/firmalar",
          placeholder: "Firma adı, sektör ya da sattığı ürün arayın",
          label: "Firma",
        }}
        onScopeChange={onScopeChange}
        ai={{ portal: "satinalma", enabled: true, onResult: () => {} }}
      />,
    );
    // 2026-09-08 (kullanıcı tasarımı): kapsam açılır seçici değil PİL.
    await user.click(screen.getByRole("button", { name: "Firma" }));
    expect(onScopeChange).toHaveBeenLastCalledWith("suppliers");
    expect(screen.getByPlaceholderText("Firma adı, sektör ya da sattığı ürün arayın")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "medikal");
    const submit = screen
      .getAllByRole("button", { name: /^Ara/ })
      .find((b) => b.getAttribute("type") === "submit") as HTMLElement;
    await user.click(submit);
    expect(push).toHaveBeenLastCalledWith("/company/satinalma/firmalar?q=medikal");
  });

  it("AI modunda kapsam pilleri ÇİZİLMEZ (AI yorumu ürün süzgeci üretir)", async () => {
    const user = userEvent.setup();
    render(
      <PanelHeroSearch
        title="Ne arıyorsunuz?"
        lead="l"
        placeholder="p"
        action="/company/satinalma/urunler"
        accent="blue"
        supplierScope={{ action: "/company/satinalma/firmalar", placeholder: "f" }}
        ai={{ portal: "satinalma", enabled: true, onResult: () => {} }}
      />,
    );
    expect(screen.getByRole("group", { name: "Arama kapsamı" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /AI ile ara/ }));
    expect(screen.queryByRole("group", { name: "Arama kapsamı" })).toBeNull();
  });
});

describe("PanelHeroSearch — arka plan (2026-09-17: fotoğraf YOK, bant beyaz)", () => {
  it("`backdrop` ile de görsel yüklenmez; bant düz beyaz, tam genişlik düzeni korunur", () => {
    // Kullanıcı kararı: "arama kısmının arkasındaki fotoğrafı tamamen
    // kaldır, beyaz olsun" — sahne, renk yayılımı ve nokta deseni kalktı.
    const { container } = render(
      <PanelHeroSearch title="Ne arıyorsunuz?" lead="x" placeholder="p" action="/x" accent="blue" backdrop />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    const band = container.querySelector("section") as HTMLElement;
    expect(band.className).toContain("bg-white");
    expect(band.className).not.toMatch(/from-transparent|gradient/);
    expect(band.className).toContain("min-h-[30rem]");
    // Arama kutusu ve başlık yerinde (yapı değişmedi).
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("`widgets`: köşe kartları dekoratif (aria-hidden, tıklanmaz) ve yalnız backdrop bandında", () => {
    // 2026-09-17, kullanıcı: referans görseldeki "arkadaki küçük kutu tarzı
    // görseller" — sayı/istatistik taşımaz, ekran okuyucuya görünmez.
    const widgets = [{ icon: Sparkles, title: "AI ile tedarikçi bul", hint: "Kalemlerinizden öneri", at: "tl" as const }];
    const { container, unmount } = render(
      <PanelHeroSearch title="T" lead="x" placeholder="p" action="/x" accent="blue" backdrop widgets={widgets} />,
    );
    const card = container.querySelector('[aria-hidden="true"].pointer-events-none');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("AI ile tedarikçi bul");
    expect(screen.queryByText("AI ile tedarikçi bul")).not.toBeNull();
    unmount();
    const { container: c2 } = render(
      <PanelHeroSearch title="T" lead="x" placeholder="p" action="/x" accent="blue" widgets={widgets} />,
    );
    expect(c2.textContent).not.toContain("AI ile tedarikçi bul");
  });

  it("`backdrop` verilmezse de görsel yok (kompakt hero)", () => {
    const { container } = render(
      <PanelHeroSearch title="T" lead="x" placeholder="p" action="/x" accent="emerald" />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });
});
