// @vitest-environment jsdom
/**
 * GİZLİ KATEGORİDEKİ ESKİ ÜRÜN (2026-10-09, sahip kararı: "anasayfada olmayan
 * kategori üründe de gösterilmesin"; arayüz denetimi W-05, W-17, W-19).
 *
 * Ürün YAYINDA KALIR; yalnız gizli kategorisi görünmez: başlığın üstündeki
 * hap, kırıntı adımı, "… içinde yeni" başlığı, görselsiz
 * kartın yedek fotoğrafı. API `category`/`segment`i boş döner — bu sınamalar
 * web'in İKİNCİ katını kilitler (API hâlâ gönderse bile ekrana çıkmaz) ve
 * kategorisiz ürün sayfasının düzgün kaldığını gösterir.
 *
 * 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" adıyla
 * GÖRÜNÜR; yalnız silah ve kolluk dalları gizli. Gizli ürün bu yüzden görünür
 * sektörün GİZLİ ailesindedir (4615, kolluk ekipmanları): kategorisi gizli
 * ürün, segmenti görünür olsa da o sektörün kırıntısına, ikonuna ve
 * fotoğrafına BAĞLANMAZ. Aynı sektörün görünür ailesindeki ürün (koruyucu
 * giysi) sıradan bir üründür.
 */
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PublicProduct, PublicProductCompany } from "@/lib/public/marketplace-api";

vi.mock("../public-layout", () => ({ PublicLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/seo/json-ld", () => ({ JsonLd: () => null }));
vi.mock("../rfq-banner", () => ({ RfqBanner: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { ProductBreadcrumb, ProductDetail, ProductDetailBody, RelatedRows } from "../product-detail";
import { PopularChips } from "../popular-chips";
import { CompanyCard } from "../company-card";
import { CategoryImage } from "../category-image";

const HIDDEN_TEXT = /Kalabalık kontrol|Kamu Düzeni|İş Güvenliği ve Yangın|46151600|46000000|92000000/;

const base = {
  slug: "koruma-kalkani",
  name: "Polikarbonat koruma kalkanı",
  images: ["a.webp"],
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: null,
  unit: "adet",
  categoryId: "46151600",
  description: "4 mm, çift tutamaklı.",
  specification: null,
  brand: null,
  mpn: null,
  unitCode: null,
  videoUrl: null,
  externalUrl: null,
  documents: null,
  keywords: [],
  attributes: null,
  attributeList: [],
  publishedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const hiddenProduct = {
  ...base,
  // Eski API ikisini de dolu gönderebilir: kategori gizli ailede, segment GÖRÜNÜR.
  category: { id: "46151600", name: "Kalabalık kontrol ekipmanı" },
  segment: { id: "46000000", name: "İş Güvenliği ve Yangın Ekipmanları", slug: "is-guvenligi-ve-yangin-ekipmanlari" },
} as unknown as PublicProduct;
/** Aynı sektörün GÖRÜNÜR ailesindeki ürün (4618, kişisel koruyucu donanım). */
const gloveProduct = {
  ...base,
  slug: "is-eldiveni",
  name: "Kesilmeye dayanıklı iş eldiveni",
  categoryId: "46181500",
  category: { id: "46181500", name: "Koruyucu giysi" },
  segment: { id: "46000000", name: "İş Güvenliği ve Yangın Ekipmanları", slug: "is-guvenligi-ve-yangin-ekipmanlari" },
} as unknown as PublicProduct;
const visibleProduct = {
  ...base,
  categoryId: "39121000",
  category: { id: "39121000", name: "Panolar" },
  segment: { id: "39000000", name: "Elektrik Sistemleri", slug: "elektrik-sistemleri" },
} as unknown as PublicProduct;

const company: PublicProductCompany = {
  name: "Acme İş Güvenliği A.Ş.",
  slug: "acme",
  city: "İzmir",
  country: "TR",
  logoUrl: null,
  industry: null,
  activities: [],
  verified: true,
  gold: false,
  foundedYear: null,
  employeeCount: null,
  certifications: [],
};

const withQuery = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const popularCard = {
  slug: "yeni-1",
  name: "yeni-1",
  images: [],
  priceMode: "ON_REQUEST",
  unit: "adet",
  categoryId: "39121000",
  company: { slug: "ege-pano", name: "ege-pano", verified: true },
} as never;

describe("ürün gövdesi (ProductDetailBody) — dört yüzeyin ortak gövdesi — W-05", () => {
  it("gizli kategori başlığın üstünde hap olarak ÇİZİLMEZ; başlık doğrudan başlar", () => {
    const { container } = render(
      <ProductDetailBody product={hiddenProduct} company={company} companyHref="/firma/acme" cta={<span>cta</span>} />,
      { wrapper: withQuery },
    );
    expect(screen.getByRole("heading", { level: 1, name: hiddenProduct.name })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
  });

  it("görünür kategoride hap durur", () => {
    render(
      <ProductDetailBody product={visibleProduct} company={company} companyHref="/firma/acme" cta={<span>cta</span>} />,
      { wrapper: withQuery },
    );
    expect(screen.getByText("Panolar")).toBeInTheDocument();
  });

  it("46'nın görünür kategorisinde (koruyucu giysi) hap durur; gizli sınıfında (461825) çizilmez", () => {
    const visible = render(
      <ProductDetailBody product={gloveProduct} company={company} companyHref="/firma/acme" cta={<span>cta</span>} />,
      { wrapper: withQuery },
    );
    expect(screen.getByText("Koruyucu giysi")).toBeInTheDocument();
    visible.unmount();
    const spray = { ...gloveProduct, categoryId: "46182501", category: { id: "46182501", name: "Biber gazı" } } as unknown as PublicProduct;
    const { container } = render(
      <ProductDetailBody product={spray} company={company} companyHref="/firma/acme" cta={<span>cta</span>} />,
      { wrapper: withQuery },
    );
    expect(container.textContent).not.toMatch(/Biber gazı|46182501/);
  });
});

describe("herkese açık ürün sayfası (ProductDetail) — kırıntı ve ilişkili satır — W-05", () => {
  it("gizli kategorili üründe görünür sektör de kırıntı adımı olmaz; başlık 'kategoride yeni'ye düşer", () => {
    const { container } = render(
      <ProductDetail
        product={hiddenProduct}
        company={company}
        companySlug="acme"
        related={{ fromCompany: { items: [], total: 0 }, similar: [], popular: [popularCard] }}
      />,
      { wrapper: withQuery },
    );
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    expect(container.querySelector('a[href*="/kategori/46000000"]')).toBeNull();
    expect(container.querySelector('a[href*="kategori=46"]')).toBeNull();
    // Kırıntı: ev · firma · ürün — araya boş/sahipsiz adım girmez.
    const crumb = screen.getByRole("navigation", { name: "Yol" });
    expect(crumb.textContent).toContain(company.name);
    expect(crumb.querySelectorAll("a").length).toBe(2); // ev + firma
    // İlişkili satır başlığı kategori adını taşımaz.
    expect(screen.getByText("Kategoride yeni")).toBeInTheDocument();
  });

  it("görünür segmentte kırıntı adımı ve 'Panolar içinde yeni' başlığı durur", () => {
    const { container } = render(
      <ProductDetail
        product={visibleProduct}
        company={company}
        companySlug="acme"
        related={{ fromCompany: { items: [], total: 0 }, similar: [], popular: [popularCard] }}
      />,
      { wrapper: withQuery },
    );
    expect(container.querySelector('a[href*="/kategori/39000000-elektrik-sistemleri"]')).not.toBeNull();
    expect(screen.getByText("Panolar içinde yeni")).toBeInTheDocument();
  });

  // 2026-10-10: 46 geri açıldı — görünür ailesindeki ürünün kırıntısı sektörün
  // açılış sayfasına bağlanır.
  it("46'nın görünür kategorisindeki üründe sektör kırıntısı ve 'Koruyucu giysi içinde yeni' başlığı durur", () => {
    const { container } = render(
      <ProductDetail
        product={gloveProduct}
        company={company}
        companySlug="acme"
        related={{ fromCompany: { items: [], total: 0 }, similar: [], popular: [popularCard] }}
      />,
      { wrapper: withQuery },
    );
    expect(container.querySelector('a[href*="/kategori/46000000-is-guvenligi-ve-yangin-ekipmanlari"]')).not.toBeNull();
    const crumb = screen.getByRole("navigation", { name: "Yol" });
    expect(crumb.textContent).toContain("İş Güvenliği ve Yangın Ekipmanları");
    expect(crumb.querySelectorAll("a").length).toBe(3); // ev + sektör + firma
    expect(screen.getByText("Koruyucu giysi içinde yeni")).toBeInTheDocument();
  });

  /* 2026-10-10: sektör halkası 192 px tavanla "…" ile kesilir ("İş Güvenliği ve
     Yangın Ekip…") ve tam ad hiçbir yerden okunamıyordu. Tavanı olan halka tam
     adı `title` olarak taşır (jsdom yerleşim hesaplamaz: kesmenin kendisi
     tarayıcıda görülür, kilitlenen şey tavan + `title` birlikteliğidir). */
  it("sektör halkası 192 px tavanlı ve tam adı `title`da; firma ve ürün halkaları da", () => {
    render(
      <ProductDetail
        product={gloveProduct}
        company={company}
        companySlug="acme"
        related={{ fromCompany: { items: [], total: 0 }, similar: [], popular: [] }}
      />,
      { wrapper: withQuery },
    );
    const crumb = within(screen.getByRole("navigation", { name: "Yol" }));
    const sector = crumb.getByRole("link", { name: "İş Güvenliği ve Yangın Ekipmanları" });
    expect(sector.className.split(/\s+/)).toEqual(expect.arrayContaining(["max-w-[12rem]", "truncate"]));
    expect(sector).toHaveAttribute("title", "İş Güvenliği ve Yangın Ekipmanları");
    expect(crumb.getByRole("link", { name: company.name })).toHaveAttribute("title", company.name);
    const current = crumb.getByText(gloveProduct.name);
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveAttribute("title", gloveProduct.name);
  });
});

describe("panel ürün sayfalarının kırıntısı (ProductBreadcrumb) — herkese açık sayfayla AYNI bileşen", () => {
  // `/company/satinalma/urunler/<firma>/<ürün>` ve `/company/urun/<firma>/<ürün>`
  // kırıntıyı `ProductBreadcrumb` ile çizer (sayfa testleri onu sahteler); kategori
  // halkası aynı tavanı ve aynı `title`ı alır.
  it("kategori halkası tavanlı ve tam adı `title`da (mavi vurgulu panel kırıntısı)", () => {
    render(
      <ProductBreadcrumb
        home={{ href: "/company/satinalma", label: "Satınalma anasayfası" }}
        accent="blue"
        trail={[
          { label: "Ürün Ara", href: "/company/satinalma/urunler" },
          { label: "İş Güvenliği ve Yangın Ekipmanları", href: "/company/satinalma/kategori/46000000-is-guvenligi-ve-yangin-ekipmanlari" },
          { label: company.name, href: "/company/firma/acme" },
        ]}
        current={gloveProduct.name}
      />,
    );
    const category = screen.getByRole("link", { name: "İş Güvenliği ve Yangın Ekipmanları" });
    expect(category).toHaveAttribute("href", "/company/satinalma/kategori/46000000-is-guvenligi-ve-yangin-ekipmanlari");
    expect(category.className.split(/\s+/)).toEqual(expect.arrayContaining(["max-w-[12rem]", "truncate"]));
    expect(category).toHaveAttribute("title", "İş Güvenliği ve Yangın Ekipmanları");
    const current = screen.getByText(gloveProduct.name);
    expect(current).toHaveAttribute("title", gloveProduct.name);
    expect(current.className).toContain("text-blue-700");
  });
});

describe("ilişkili satır (RelatedRows) — çağıran gizli adı geçmez", () => {
  it("kategori adı verilmezse genel başlık", () => {
    render(
      <RelatedRows
        related={{ fromCompany: { items: [], total: 0 }, similar: [], popular: [popularCard] }}
        categoryName={null}
        hrefFor={(c) => `/urun/${c.slug}`}
      />,
    );
    expect(screen.getByText("Kategoride yeni")).toBeInTheDocument();
  });
});

describe("görselsiz ürünün yedek görseli — W-17", () => {
  it("gizli dalın ikonu/tonu kullanılmaz (görünür sektörün kalkanı da değil): nötr yedek; görünür segment kendi ikonunu korur", () => {
    for (const hidden of ["46151600", "46101500", "46182501", "77101500"]) {
      const { container, unmount } = render(<CategoryImage categoryIds={[hidden]} alt="x" />);
      expect(container.innerHTML, hidden).toContain("lucide-package");
      expect(container.innerHTML, hidden).toContain("bg-zinc-100");
      expect(container.innerHTML, hidden).not.toContain("lucide-shield");
      expect(container.innerHTML, hidden).not.toContain("violet");
      expect(container.innerHTML, hidden).not.toContain("/categories/");
      unmount();
    }
    const visible = render(<CategoryImage categoryIds={["39121000"]} alt="x" />);
    expect(visible.container.innerHTML).toContain("lucide-lightbulb");
    expect(visible.container.innerHTML).toContain("bg-sky-50");
  });

  // 2026-10-10: 46 görünür sektör — görünür dalındaki görselsiz ürün sektörün
  // kalkan ikonunu ve tonunu alır.
  it("46'nın görünür kategorisi sektörün ikonunu (kalkan) ve tonunu alır", () => {
    const { container } = render(<CategoryImage categoryIds={["46181500"]} alt="x" />);
    expect(container.innerHTML).toContain("lucide-shield");
    expect(container.innerHTML).toContain("bg-violet-50");
  });
});

describe("bugün bağlı olmayan 'Popüler kategoriler' çipleri — W-19", () => {
  it("gizli segmentin alt kategorisi çip olmaz; hiç kalmadıysa bölüm çizilmez", () => {
    const { container, unmount } = render(
      <PopularChips
        items={[
          { id: "46151600", name: "Kalabalık kontrol ekipmanı", count: 40 },
          { id: "39121000", name: "Panolar", count: 12 },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /Panolar/ })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    expect(container.querySelector('a[href*="kategori=46"]')).toBeNull();
    unmount();
    const empty = render(<PopularChips items={[{ id: "46151600", name: "Kalabalık kontrol ekipmanı", count: 40 }]} />);
    expect(empty.container).toBeEmptyDOMElement();
    empty.unmount();
    // 46'nın görünür kategorisi sıradan bir çiptir.
    render(<PopularChips items={[{ id: "46181500", name: "Koruyucu giysi", count: 4 }]} />);
    expect(screen.getByRole("link", { name: /Koruyucu giysi/ }).getAttribute("href")).toContain("kategori=46181500");
  });
});

describe("firma kartı (CompanyCard) — 'Ana kategoriler' — ikinci kat", () => {
  const card = {
    slug: "acme",
    name: "Acme",
    city: "İzmir",
    country: "TR",
    logoUrl: null,
    coverImageUrl: null,
    industry: null,
    about: null,
    activities: [],
    certifications: [],
    verified: true,
    gold: false,
    productCount: 3,
    productPreview: [],
    mainCategory: { id: "92000000", name: "Kamu Düzeni ve Güvenlik Hizmetleri" },
    topCategories: [
      { id: "46151600", name: "Kalabalık kontrol ekipmanı", count: 9 },
      { id: "39121000", name: "Panolar", count: 2 },
    ],
  } as never;

  it("geniş kart: gizli kategori adı ve ürün sayısıyla listelenmez", () => {
    const { container } = render(<CompanyCard company={card} href="/firma/acme" variant="wide" />);
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    expect(screen.getByText("Panolar")).toBeInTheDocument();
    expect(container.textContent).not.toContain("(9)");
  });
});
