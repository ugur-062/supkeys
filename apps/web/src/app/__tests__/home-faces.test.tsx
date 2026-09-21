// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
}));
vi.mock("@/hooks/use-ai-search-intent", () => ({
  useAiSearchIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AudienceProvider } from "@/components/marketplace/audience-switch";
import { HomeHero } from "@/components/marketplace/home-hero";
import { HomeBuyer } from "@/components/marketplace/home-buyer";
import { HomeSupplier } from "@/components/marketplace/home-supplier";

const product = (i: number) => ({
  slug: `urun-${i}`,
  name: `Ürün ${i}`,
  categoryId: "39000000",
  images: [],
  priceMode: "ON_REQUEST" as const,
  company: { slug: `firma-${i}`, name: `Firma ${i}`, city: "Bursa", verified: true, activities: [] },
});

const demand = (i: number) => ({
  number: `ROT-00010${i}`,
  title: `Talep ${i}`,
  status: "OPEN",
  closesAt: new Date(Date.now() + i * 86_400_000).toISOString(),
  categories: [{ id: "39000000", name: "Elektrik", level: 1 }],
  itemSummary: { count: 2, totalQuantity: "500", unit: "adet" },
  company: { city: "Bursa", country: "TR", activities: ["MANUFACTURER"], verified: true },
  scope: "DOMESTIC",
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const hero = () => render(<AudienceProvider><HomeHero /></AudienceProvider>);

// Taraf tercihi `localStorage`ta yaşıyor ve jsdom onu dosya boyunca TAŞIR:
// temizlenmezse bir testteki "Tedarikçiyim" tıklaması sonraki testleri de
// tedarikçi yüzünde başlatır.
beforeEach(() => window.localStorage.clear());

describe("Anasayfa — panel ekranlarının anonim hâli", () => {
  it("sunucu varsayılanı TEDARİKÇİ yüzü (2026-09-21): talep sorusu, yeşil 'Ara', kapsam pili YOK", () => {
    hero();
    expect(screen.getByRole("heading", { level: 1, name: /Hangi talebe/ })).toBeInTheDocument();
    const ara = screen
      .getAllByRole("button", { name: /^Ara/ })
      .find((b) => b.getAttribute("type") === "submit") as HTMLElement;
    expect(ara.className).toContain("bg-emerald-700");
    // Firma arama anasayfadan KALKTI (2026-09-21, kullanıcı kararı): "Talep |
    // Firma" pili yok, arama yalnız talep dizinine gider.
    expect(screen.queryByRole("group", { name: "Arama kapsamı" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Firma" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Tedarikçiyim" })).toHaveAttribute("aria-checked", "true");
  });

  it("anahtarda Tedarikçiyim SOLDA, Alıcıyım SAĞDA (2026-09-21, kullanıcı kararı)", () => {
    hero();
    const radios = within(screen.getByRole("radiogroup", { name: "Hangi taraftasınız?" })).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Tedarikçiyim", "Alıcıyım"]);
  });

  it("anahtar ALICI yüzüne geçirir: ürün sorusu, mavi 'Ara', firma pili yine YOK", async () => {
    const user = userEvent.setup();
    hero();
    await user.click(screen.getByRole("radio", { name: "Alıcıyım" }));
    expect(screen.getByRole("heading", { level: 1, name: "Hangi ürünü arıyorsunuz?" })).toBeInTheDocument();
    const ara = screen
      .getAllByRole("button", { name: /^Ara/ })
      .find((b) => b.getAttribute("type") === "submit") as HTMLElement;
    expect(ara.className).toContain("bg-blue-600");
    expect(screen.queryByRole("group", { name: "Arama kapsamı" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Firma" })).toBeNull();
    // Yer tutucu da firmadan söz etmez.
    expect(screen.getByPlaceholderText("Ürün veya sektör arayın...")).toBeInTheDocument();
  });

  it("gövdelerde FİRMA LİSTESİ yok (alıcı ve tedarikçi yüzü)", () => {
    render(
      <AudienceProvider>
        <HomeBuyer
          featured={[product(1)] as any}
          newest={[] as any}
          showcase={[{ id: "39000000", name: "Elektrik", count: 5, imageSrc: null } as any]}
        />
        <HomeSupplier demands={[demand(1), demand(2), demand(3)] as any} total={16} />
      </AudienceProvider>,
    );
    expect(document.getElementById("firmalar")).toBeNull();
    expect(document.getElementById("firmalar-tedarikci")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Firmalar" })).toBeNull();
    expect(screen.queryByText(/\d+ firma$/)).toBeNull();
    // Ürün bölümleri her zaman görünür — kapsam pili yok, gizlenecek bir hâl yok.
    expect(document.getElementById("one-cikan-urunler")!.closest("[hidden]")).toBeNull();
  });

  it("AI ile ara ANONİMDE ÇİZİLMEZ (Silver+ ∧ koltuk izni ister)", async () => {
    const user = userEvent.setup();
    hero();
    expect(screen.queryByRole("button", { name: /AI ile ara/ })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Alıcıyım" }));
    expect(screen.queryByRole("button", { name: /AI ile ara/ })).toBeNull();
  });

  it("birincil eylemler PANELE değil KAYDA gider (niyetiyle)", async () => {
    const user = userEvent.setup();
    hero();
    expect(screen.getByRole("link", { name: /Ücretsiz kaydolun/ })).toHaveAttribute(
      "href",
      "/company/kayit?intent=teklif",
    );
    await user.click(screen.getByRole("radio", { name: "Alıcıyım" }));
    expect(screen.getByRole("link", { name: /Talep aç/ })).toHaveAttribute(
      "href",
      "/company/kayit?intent=talep",
    );
  });

  it("ALICI gövdesi: 'size uygun' YOK — ziyaretçinin kategorisi yok, ölçülebilir kesit var", () => {
    render(
      <HomeBuyer
        featured={[product(1)] as any}
        newest={[product(2)] as any}
        showcase={[{ id: "39000000", name: "Elektrik", count: 5, imageSrc: null } as any]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Öne çıkan ürünler" })).toBeInTheDocument();
    expect(screen.queryByText(/Size uygun/)).toBeNull();
    expect(screen.queryByText(/Alım kategorilerinizle/)).toBeNull();
    // Ürün bağlantısı HERKESE AÇIK rota — panel rotası sızmamalı.
    const link = screen.getAllByRole("link", { name: /Ürün 1/ })[0];
    expect(link).toHaveAttribute("href", "/firma/firma-1/urun/urun-1");
  });

  it("kategori kartı: ürünü OLMAYAN dal 404 veren sayfaya değil süzülmüş dizine gider", () => {
    render(
      <HomeBuyer
        featured={[] as any}
        newest={[] as any}
        showcase={[
          { id: "39000000", name: "Elektrik", count: 5, imageSrc: null },
          { id: "10000000", name: "Canlı Bitki", count: 0, imageSrc: null },
        ] as any}
      />,
    );
    expect(screen.getAllByRole("link", { name: /Elektrik/ })[0]).toHaveAttribute(
      "href",
      "/urunler/kategori/39000000-elektrik",
    );
    expect(screen.getAllByRole("link", { name: /Canlı Bitki/ })[0]).toHaveAttribute(
      "href",
      "/urunler?kategori=10000000",
    );
  });

  it("kategori vitrini FOTOĞRAFSIZ — çizgisel segment ikonu (2026-09-21, kullanıcı kararı)", () => {
    render(
      <HomeBuyer
        featured={[] as any}
        newest={[] as any}
        showcase={[
          { id: "39000000", name: "Elektrik", count: 5, imageSrc: "/categories/39000000.webp" },
          { id: "31000000", name: "Üretim Bileşenleri", count: 3, imageSrc: "/categories/31000000.webp" },
          { id: "23000000", name: "Endüstriyel Üretim", count: 2, imageSrc: "/categories/23000000.webp" },
        ] as any}
      />,
    );
    const vitrin = document.getElementById("kategoriler")!;
    // Fotoğraf verisi gelse de basılmaz: ne promo kartta ne ızgarada <img> var.
    expect(within(vitrin).queryAllByRole("img")).toHaveLength(0);
    expect(vitrin.querySelectorAll("img")).toHaveLength(0);
    // Her kartta bir lucide çizgi ikonu (SVG) var.
    const links = within(vitrin).getAllByRole("link");
    expect(links).toHaveLength(3);
    for (const l of links) expect(l.querySelector("svg")).not.toBeNull();
  });

  it("TEDARİKÇİ gövdesi: talep kartı alıcı adını ve kalem adlarını TAŞIMAZ", () => {
    render(<HomeSupplier demands={[demand(1), demand(2), demand(3)] as any} total={16} />);
    const list = screen.getByRole("heading", { name: /Alıcılar şu an/ }).closest("section")!;
    expect(within(list).getByRole("link", { name: /Tüm talepler \(16\)/ })).toBeInTheDocument();
    // Kapalı zarf: kart yalnız ölçek ve kapsam taşır.
    expect(within(list).queryByText(/Firma /)).toBeNull();
    expect(within(list).getAllByText(/şartname ve belgeler üyelere/).length).toBe(3);
    // SATIR düzeni (2026-09-10): kategori GÖRSELİ yok (v3 2026-09-19: sütun
    // ikon karoları var, fotoğraf yine yok), sütunlar panelle aynı.
    const rows = list.querySelector("ul")!;
    expect(within(rows).queryAllByRole("img")).toHaveLength(0);
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getAllByText("Alıcı")).toHaveLength(3);
    const teklif = within(list).getAllByRole("link", { name: "Teklif ver" });
    expect(teklif).toHaveLength(3);
    // Tedarikçi yüzünde YEŞİL dolgulu düğme (2026-09-18, kullanıcı).
    expect(teklif[0]!.className).toContain("bg-emerald-600");
  });

  it("TEDARİKÇİ gövdesi: üye verisi (KPI, sağlık kartları, uygunluk) YOK", () => {
    render(<HomeSupplier demands={[demand(1), demand(2), demand(3)] as any} total={16} />);
    for (const s of ["Davetlisiniz", "Ürününüzle eşleşti", "Profil tamamlanma", "Teklif verdiniz"]) {
      expect(screen.queryByText(s)).toBeNull();
    }
  });

  it("üç talepten AZ ise ızgara çizilmez — boş pazar görüntüsü basılmaz", () => {
    render(<HomeSupplier demands={[demand(1)] as any} total={1} />);
    expect(screen.queryByRole("link", { name: /Tüm talepler/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Ücretsiz kaydolun" })).toHaveAttribute(
      "href",
      "/company/kayit?intent=teklif",
    );
  });
});
