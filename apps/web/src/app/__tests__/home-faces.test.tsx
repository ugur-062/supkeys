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
import { useCompanyAuthStore } from "@/lib/company-auth/store";

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
  it("sunucu varsayılanı TEDARİKÇİ yüzü (2026-09-21): sipariş başlığı, yeşil 'Ara', kapsam pili YOK", () => {
    hero();
    // Başlık 2026-10-08'de değişti (kullanıcı kararı): soru kipi kalktı,
    // tedarikçi yüzü "Yeni siparişler bulun", alıcı yüzü "Yeni tedarikçiler bulun".
    expect(screen.getByRole("heading", { level: 1, name: "Yeni siparişler bulun" })).toBeInTheDocument();
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

  it("anahtar ALICI yüzüne geçirir: tedarikçi başlığı, mavi 'Ara', firma pili yine YOK", async () => {
    const user = userEvent.setup();
    hero();
    await user.click(screen.getByRole("radio", { name: "Alıcıyım" }));
    expect(screen.getByRole("heading", { level: 1, name: "Yeni tedarikçiler bulun" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Yeni siparişler bulun" })).toBeNull();
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
    expect(document.getElementById("kategoriler")!.closest("[hidden]")).toBeNull();
  });

  it("AI ile ara ANONİMDE ÇİZİLMEZ (oturum ∧ koltuk izni ister)", async () => {
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
    // Misafir etiketi yalın (ücretsiz dönem 2026-10-07): paket/doğrulama eki yok.
    expect(screen.getByRole("link", { name: "Talep aç" })).toHaveAttribute(
      "href",
      "/company/kayit?intent=talep",
    );
  });

  it("hero metinleri (ücretsiz dönem 2026-10-07): talep açmak ve teklif vermek tamamen ücretsiz; paket adı ve doğrulama şartı yazmaz", async () => {
    const user = userEvent.setup();
    const { container } = hero();
    // Giriş cümlesi ve eylem notu: ücretsiz der, doğrulama ŞARTI koşmaz.
    // (Dekor kartındaki "Doğrulanmış rozeti — Doğrulama ücretsiz" bir şart değil.)
    const supplierLead = screen.getByText(/Teklif vermek tamamen ücretsiz\./);
    const supplierNote = screen.getByText("Taleplere teklif vermek tamamen ücretsiz").closest("p")!;
    for (const el of [supplierLead, supplierNote]) expect(el.textContent).not.toMatch(/doğrulama/i);
    expect(container.textContent).not.toMatch(/Gold|Silver|paket|premium/i);
    await user.click(screen.getByRole("radio", { name: "Alıcıyım" }));
    const buyerLead = screen.getByText(/Alım talebi açmak tamamen ücretsiz\./);
    const buyerNote = screen.getByText(/Alım talebi açmak ücretsiz\./).closest("p")!;
    for (const el of [buyerLead, buyerNote]) expect(el.textContent).not.toMatch(/doğrulama/i);
    expect(container.textContent).not.toMatch(/Gold|Silver|paket|premium/i);
  });

  it("oturumlu üyede alıcı 'Talep aç' notu firmanın doğrulamasına göre (T-02): doğrulanmamış kilitli, incelemede 'inceleniyor', doğrulanmış sihirbaz", async () => {
    const user = userEvent.setup();
    useCompanyAuthStore.setState({
      isHydrated: true,
      user: { id: "u", permissions: ["buy:view", "buy:listing:manage"], roles: [] } as never,
      company: { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" } as never,
    });
    try {
      const { unmount } = hero();
      await user.click(screen.getByRole("radio", { name: "Alıcıyım" }));
      expect(screen.getByRole("link", { name: "Talep aç · Doğrulama gerekli" })).toHaveAttribute(
        "href",
        "/company/ayarlar/dogrulama",
      );
      unmount();
      useCompanyAuthStore.setState({ company: { tier: "STANDART", companyVerificationStatus: "PENDING" } as never });
      const pending = hero();
      expect(screen.getByRole("link", { name: "Talep aç · Doğrulama inceleniyor" })).toHaveAttribute(
        "href",
        "/company/ayarlar/dogrulama",
      );
      pending.unmount();
      // Doğrulanmış firmanın `/me` kademesi efektif olarak en üst kademedir.
      useCompanyAuthStore.setState({ company: { tier: "GOLD", companyVerificationStatus: "VERIFIED" } as never });
      hero();
      expect(screen.getByRole("link", { name: /^Talep aç/ })).toHaveAttribute(
        "href",
        "/company/satinalma/taleplerim/yeni",
      );
    } finally {
      useCompanyAuthStore.setState({ user: null, company: null });
    }
  });

  it("oturumlu üyede tedarikçi notu 'Ücretsiz kaydolun' DEMEZ (webA-1): doğrulanmış ∧ izin panel, doğrulanmamış '· Doğrulama gerekli', izinsiz not yok", () => {
    const signIn = (tier: string, status: string, permissions: string[]) =>
      useCompanyAuthStore.setState({
        isHydrated: true,
        user: { id: "u", permissions, roles: [] } as never,
        company: { tier, companyVerificationStatus: status } as never,
      });
    try {
      signIn("GOLD", "VERIFIED", ["sell:view", "sell:bid:submit"]);
      let r = hero();
      expect(screen.queryByRole("link", { name: /Ücretsiz kaydolun/ })).toBeNull();
      expect(screen.getByRole("link", { name: /^Açık talepleri görün$/ })).toHaveAttribute(
        "href",
        "/company/satis#acik-talepler",
      );
      r.unmount();

      signIn("STANDART", "PENDING", ["sell:view", "sell:bid:submit"]);
      r = hero();
      expect(screen.queryByRole("link", { name: /Ücretsiz kaydolun/ })).toBeNull();
      expect(screen.getByRole("link", { name: "Açık talepleri görün · Doğrulama inceleniyor" })).toHaveAttribute(
        "href",
        "/company/ayarlar/dogrulama",
      );
      r.unmount();

      signIn("STANDART", "UNVERIFIED", ["sell:view", "sell:bid:submit"]);
      r = hero();
      expect(screen.queryByRole("link", { name: /Ücretsiz kaydolun/ })).toBeNull();
      expect(screen.getByRole("link", { name: "Açık talepleri görün · Doğrulama gerekli" })).toHaveAttribute(
        "href",
        "/company/ayarlar/dogrulama",
      );
      r.unmount();

      // Doğrulanmış ama teklif izni yok (Satın Almacı / Görüntüleyici): teklif çağrısı yok.
      signIn("GOLD", "VERIFIED", ["buy:view"]);
      hero();
      expect(screen.queryByRole("link", { name: /Ücretsiz kaydolun/ })).toBeNull();
      expect(screen.queryByRole("link", { name: /Açık talepleri görün/ })).toBeNull();
      // Notun YERİ durur (kapanış kontrolü CL-01: kabuğun ayırdığı yuva kaybolunca
      // başlık zıplıyordu) — metin yalnız görünmez, okunmayan ölçü hücresindedir.
      const callTexts = screen.queryAllByText("Taleplere teklif vermek tamamen ücretsiz");
      expect(callTexts.length).toBeGreaterThan(0);
      for (const el of callTexts) {
        expect(el).toHaveAttribute("aria-hidden", "true");
        expect(el.className).toContain("invisible");
        expect(el.querySelector("a")).toBeNull();
      }
    } finally {
      useCompanyAuthStore.setState({ user: null, company: null });
    }
  });

  it("ALICI gövdesi: 'size uygun' ve 'öne çıkan' YOK — hero'dan sonra DOĞRUDAN kategoriler (2026-09-22)", () => {
    render(
      <HomeBuyer
        newest={[product(2)] as any}
        showcase={[{ id: "39000000", name: "Elektrik", count: 5, imageSrc: null } as any]}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Öne çıkan ürünler" })).toBeNull();
    expect(document.getElementById("one-cikan-urunler")).toBeNull();
    expect(screen.queryByText(/Size uygun/)).toBeNull();
    expect(screen.queryByText(/Alım kategorilerinizle/)).toBeNull();
    // İlk bölüm kategori vitrini, ardından yeni eklenenler.
    const main = screen.getByRole("heading", { name: "Yeni eklenen ürünler" }).closest("section")!;
    const kategoriler = document.getElementById("kategoriler")!;
    expect(kategoriler.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Ürün bağlantısı HERKESE AÇIK rota — panel rotası sızmamalı.
    const link = screen.getAllByRole("link", { name: /Ürün 2/ })[0];
    expect(link).toHaveAttribute("href", "/firma/firma-2/urun/urun-2");
  });

  it("kategori kartı: ürünü OLMAYAN dal 404 veren sayfaya değil süzülmüş dizine gider", () => {
    render(
      <HomeBuyer
        newest={[] as any}
        showcase={[
          { id: "39000000", name: "Elektrik", count: 5, imageSrc: null },
          { id: "41000000", name: "Laboratuvar", count: 0, imageSrc: null },
        ] as any}
      />,
    );
    expect(screen.getAllByRole("link", { name: /Elektrik/ })[0]).toHaveAttribute(
      "href",
      "/urunler/kategori/39000000-elektrik",
    );
    expect(screen.getAllByRole("link", { name: /Laboratuvar/ })[0]).toHaveAttribute(
      "href",
      "/urunler?kategori=41000000",
    );
  });

  it("kategori vitrini: tek segment kalsa da çizilir (tanıtım kartı), boş ızgara listesi yok", () => {
    const { container } = render(
      <HomeBuyer newest={[] as any} showcase={[{ id: "39000000", name: "Elektrik", count: 5, imageSrc: null }] as any} />,
    );
    const block = screen.getByRole("region", { name: "Elektrik" });
    expect(block.querySelector('a[href="/urunler/kategori/39000000-elektrik"]')).not.toBeNull();
    expect(block.querySelector("ul")).toBeNull();
    expect(container.textContent).toContain("Elektrik");
  });

  // 2026-10-09 (sahip kararı): 46 ve 77 anasayfadan kalktı. Vitrin verisi
  // süzülü gelir (`buildShowcase`); kart çizimi son kattır — gizli segment
  // girdide olsa bile anasayfada kartı, adı ve bağlantısı çıkmaz.
  it("kategori vitrini: gizli segment (46, 77, 10) kart olarak çizilmez", () => {
    const { container } = render(
      <HomeBuyer
        newest={[] as any}
        showcase={[
          { id: "39000000", name: "Elektrik", count: 5, imageSrc: null },
          { id: "46000000", name: "Kolluk ve Emniyet", count: 9, imageSrc: null },
          { id: "23000000", name: "Makine", count: 2, imageSrc: null },
          { id: "77000000", name: "Çevre Hizmetleri", count: 0, imageSrc: null },
          { id: "10000000", name: "Canlı Bitki", count: 0, imageSrc: null },
        ] as any}
      />,
    );
    expect(screen.getAllByRole("link", { name: /Elektrik/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Makine/ }).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/Kolluk|Çevre Hizmetleri|Canlı Bitki/);
    expect(container.querySelector('a[href*="46000000"], a[href*="77000000"], a[href*="10000000"]')).toBeNull();
  });

  it("kategori vitrini FOTOĞRAFSIZ — çizgisel segment ikonu (2026-09-21, kullanıcı kararı)", () => {
    render(
      <HomeBuyer
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
    // Tanıtım kartı (mockup 2026-09-21): slogan + tam genişlik düğme.
    expect(within(vitrin).getByText("Daha aydınlık, daha verimli işletmeler için çözümler.")).toBeInTheDocument();
    expect(within(vitrin).getByText("Şimdi tedarikçi bulun")).toBeInTheDocument();
  });

  it("TEDARİKÇİ gövdesi: talep kartı alıcı adını ve kalem adlarını TAŞIMAZ", () => {
    render(<HomeSupplier demands={[demand(1), demand(2), demand(3)] as any} total={16} />);
    const list = screen.getByRole("heading", { name: /Alıcılar şu an/ }).closest("section")!;
    expect(within(list).getByRole("link", { name: /Tüm talepler \(16\)/ })).toBeInTheDocument();
    // Kapalı zarf: kart yalnız ölçek ve kapsam taşır.
    expect(within(list).queryByText(/Firma /)).toBeNull();
    expect(within(list).getAllByText(/şartname ve belgeler doğrulanmış firmalara/).length).toBe(3);
    expect(list.textContent).not.toMatch(/Gold|Silver|paket|premium/i);
    // SATIR düzeni (2026-09-10): kategori GÖRSELİ yok (v3 2026-09-19: sütun
    // ikon karoları var, fotoğraf yine yok), sütunlar panelle aynı.
    const rows = list.querySelector("ul")!;
    expect(within(rows).queryAllByRole("img")).toHaveLength(0);
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getAllByText("Alıcı")).toHaveLength(3);
    // Misafir etiketi yalın (ücretsiz dönem 2026-10-07): davetli tedarikçi
    // doğrulama olmadan da teklif verir; paket/doğrulama eki yok.
    const teklif = within(list).getAllByRole("link", { name: "Teklif ver" });
    expect(teklif).toHaveLength(3);
    // Tedarikçi yüzünde YEŞİL dolgulu düğme (2026-09-18, kullanıcı).
    expect(teklif[0]!.className).toContain("bg-emerald-600");
    // Dönüş PANEL karşılığına (O-113): herkese açık talep sayfası değil.
    expect(teklif[0]!.getAttribute("href")).toContain("intent=teklif&redirect=%2Fcompany%2Fsatis%3Fq%3D");
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

  it("oturumlu üyeye tedarikçi gövdesi kayıt çağrısı yapmaz (S-PUB-ADMIN): boş talep satırı ve 'Ürün ekle' panele", () => {
    useCompanyAuthStore.setState({
      isHydrated: true,
      user: { id: "u", permissions: ["sell:view", "sell:product:manage"], roles: [] } as never,
      company: { tier: "GOLD", companyVerificationStatus: "VERIFIED" } as never,
    });
    try {
      const { unmount } = render(<HomeSupplier demands={[demand(1)] as any} total={1} />);
      expect(screen.queryByRole("link", { name: "Ücretsiz kaydolun" })).toBeNull();
      expect(screen.queryByText(/kaydolduktan sonra/)).toBeNull();
      expect(screen.getByRole("link", { name: "Panelde açın" })).toHaveAttribute("href", "/company/satis#acik-talepler");
      expect(screen.getByRole("link", { name: "Ürün ekle" })).toHaveAttribute("href", "/company/satis/urunlerim?yeni=1");
      unmount();
      // Vitrin yetkisi olmayan üyeye "Ürün ekle" çizilmez (önce firmanın yetkisi, sonra izin; vitrin doğrulama istemez).
      useCompanyAuthStore.setState({ user: { id: "u", permissions: ["buy:view"], roles: [] } as never });
      render(<HomeSupplier demands={[demand(1)] as any} total={1} />);
      expect(screen.queryByRole("link", { name: "Ürün ekle" })).toBeNull();
    } finally {
      useCompanyAuthStore.setState({ user: null, company: null });
    }
  });
});
