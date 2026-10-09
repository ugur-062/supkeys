// @vitest-environment jsdom
/**
 * GİZLİ SEGMENTTEKİ ESKİ ÜRÜN (2026-10-09, sahip kararı: "anasayfada olmayan
 * kategori üründe de gösterilmesin"; arayüz denetimi W-05, W-17, W-19).
 *
 * Ürün YAYINDA KALIR; yalnız gizli kategorisi görünmez: başlığın üstündeki
 * hap, kırıntı adımı (kategori sayfası 404), "… içinde yeni" başlığı, görselsiz
 * kartın yedek fotoğrafı. API `category`/`segment`i boş döner — bu sınamalar
 * web'in İKİNCİ katını kilitler (API hâlâ gönderse bile ekrana çıkmaz) ve
 * kategorisiz ürün sayfasının düzgün kaldığını gösterir.
 */
import { render, screen } from "@testing-library/react";
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

import { ProductDetail, ProductDetailBody, RelatedRows } from "../product-detail";
import { PopularChips } from "../popular-chips";
import { CompanyCard } from "../company-card";
import { CategoryImage } from "../category-image";

const HIDDEN_TEXT = /Koruyucu giysi|Kolluk|46181500|46000000/;

const base = {
  slug: "is-eldiveni",
  name: "Kesilmeye dayanıklı iş eldiveni",
  images: ["a.webp"],
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: null,
  unit: "adet",
  categoryId: "46181500",
  description: "EN 388 seviye 5.",
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
  // Eski API ikisini de dolu gönderebilir.
  category: { id: "46181500", name: "Koruyucu giysi" },
  segment: { id: "46000000", name: "Kolluk ve Emniyet Ekipmanları", slug: "kolluk-ve-emniyet-ekipmanlari" },
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
});

describe("herkese açık ürün sayfası (ProductDetail) — kırıntı ve ilişkili satır — W-05", () => {
  it("gizli segment kırıntı adımı olmaz (kategori sayfası 404); başlık 'kategoride yeni'ye düşer", () => {
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
  it("gizli segmentin ikonu/tonu kullanılmaz (kalkan = kolluk): nötr yedek; görünür segment kendi ikonunu korur", () => {
    const { container, unmount } = render(<CategoryImage categoryIds={["46181500"]} alt="x" />);
    expect(container.innerHTML).toContain("lucide-package");
    expect(container.innerHTML).toContain("bg-zinc-100");
    expect(container.innerHTML).not.toContain("lucide-shield");
    expect(container.innerHTML).not.toContain("violet");
    unmount();
    const visible = render(<CategoryImage categoryIds={["39121000"]} alt="x" />);
    expect(visible.container.innerHTML).toContain("lucide-lightbulb");
    expect(visible.container.innerHTML).toContain("bg-sky-50");
  });
});

describe("bugün bağlı olmayan 'Popüler kategoriler' çipleri — W-19", () => {
  it("gizli segmentin alt kategorisi çip olmaz; hiç kalmadıysa bölüm çizilmez", () => {
    const { container, unmount } = render(
      <PopularChips
        items={[
          { id: "46181500", name: "Koruyucu giysi", count: 40 },
          { id: "39121000", name: "Panolar", count: 12 },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /Panolar/ })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    expect(container.querySelector('a[href*="kategori=46"]')).toBeNull();
    unmount();
    const empty = render(<PopularChips items={[{ id: "46181500", name: "Koruyucu giysi", count: 40 }]} />);
    expect(empty.container).toBeEmptyDOMElement();
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
    mainCategory: { id: "46000000", name: "Kolluk ve Emniyet Ekipmanları" },
    topCategories: [
      { id: "46181500", name: "Koruyucu giysi", count: 9 },
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
