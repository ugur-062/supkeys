// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductDetailBody, RelatedRows } from "../product-detail";
import type { PublicProduct, PublicProductCompany } from "@/lib/public/marketplace-api";

/**
 * ÜRÜN SAYFASI GÖVDESİ (PROMPT 7) — sekmeler, satıcı paneli, nitelik tablosu.
 * Gövde public sayfa ile PANEL arasında paylaşılır; sözleşme ikisini birden
 * kilitler.
 */
const product = {
  slug: "pano",
  name: "Kompanzasyon Panosu 400 kVAr",
  images: ["a.webp", "b.webp"],
  priceMode: "FIXED",
  priceAmount: "185000",
  priceTiers: null,
  priceCurrency: "TRY",
  moq: "1",
  unit: "adet",
  categoryId: "39121000",
  description: "Reaktif güç kompanzasyon panosu.",
  specification: null,
  brand: null,
  mpn: null,
  unitCode: null,
  videoUrl: null,
  externalUrl: null,
  documents: null,
  keywords: ["kompanzasyon", "pano"],
  attributes: null,
  attributeList: [],
  category: { id: "39121000", name: "Panolar" },
  publishedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as PublicProduct;

const company: PublicProductCompany = {
  name: "Karadeniz Enerji A.Ş.",
  slug: "karadeniz-enerji",
  city: "Samsun",
  country: "TR",
  logoUrl: null,
  industry: "Enerji ve elektrik",
  activities: ["SERVICE_PROVIDER"],
  verified: true,
  gold: true,
  foundedYear: 2008,
  employeeCount: "50-100",
  certifications: ["ISO 9001", "ISO 45001"],
};

function Body(extra: Partial<React.ComponentProps<typeof ProductDetailBody>> = {}) {
  return (
    <ProductDetailBody
      product={product}
      company={company}
      companyHref="/firma/karadeniz-enerji"
      cta={<button type="button">Bilgi iste</button>}
      {...extra}
    />
  );
}

describe("ProductDetailBody", () => {
  it("satıcı paneli niteliği gösterir: rozet, sertifika, kuruluş, çalışan", () => {
    render(Body());
    expect(screen.getAllByText("Karadeniz Enerji A.Ş.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Doğrulanmış firma").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gold Üye").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ISO 9001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Kuruluş 2008 · 50-100 çalışan").length).toBeGreaterThan(0);
  });

  it("fiyat, KDV notu ve minimum sipariş panelde", () => {
    render(Body());
    expect(screen.getAllByText("185.000 ₺ / adet").length).toBeGreaterThan(0);
    expect(screen.getByText("KDV hariç")).toBeTruthy();
    expect(screen.getByText("Minimum sipariş: 1 adet")).toBeTruthy();
  });

  it("SEKME YOK: 'Bu ürün hakkında' doğrudan okunur, nitelik yoksa özellik bloğu çizilmez", () => {
    // 2026-09-08 (kullanıcı referansı): açıklama ve nitelik tablosu sekme
    // arkasından çıkarıldı — ürünün iki temel bilgisi tıklama istemeden
    // görünür. Nitelik yoksa blok HİÇ basılmaz (açıklamadan ayrıştırılmaz).
    render(Body());
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("heading", { name: "Bu ürün hakkında" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ürün özellikleri" })).toBeNull();
  });

  it("nitelik VARSA 'Ürün özellikleri' tablosu doğrudan basılır", () => {
    render(
      Body({
        product: {
          ...product,
          attributeList: [{ key: "guc", label: "Güç", value: "400", unit: "kVAr" }],
        } as PublicProduct,
      }),
    );
    expect(screen.getByRole("heading", { name: "Ürün özellikleri" })).toBeTruthy();
    expect(screen.getByText("Güç")).toBeTruthy();
    expect(screen.getByText("400 kVAr")).toBeTruthy();
  });

  it("ilişkili satır BAŞKA TEDARİKÇİLERİN ürünlerini basar (aynı firma değil)", () => {
    render(
      <RelatedRows
        related={{
          fromCompany: { items: [{
  slug: "kendi-1",
  name: "kendi-1",
  images: [],
  priceMode: "ON_REQUEST",
  unit: "adet",
  categoryId: "39121000",
  company: { slug: "karadeniz-enerji", name: "karadeniz-enerji", verified: true },
} as never], total: 1 },
          similar: [{
  slug: "rakip-1",
  name: "rakip-1",
  images: [],
  priceMode: "ON_REQUEST",
  unit: "adet",
  categoryId: "39121000",
  company: { slug: "ege-pano", name: "ege-pano", verified: true },
} as never],
          popular: [{
  slug: "kendi-2",
  name: "kendi-2",
  images: [],
  priceMode: "ON_REQUEST",
  unit: "adet",
  categoryId: "39121000",
  company: { slug: "karadeniz-enerji", name: "karadeniz-enerji", verified: true },
} as never],
        }}
        categoryName="Panolar"
        hrefFor={(c) => `/firma/${c.company.slug}/urun/${c.slug}`}
      />,
    );
    expect(screen.getByText("Benzer ürünler — diğer tedarikçilerden")).toBeInTheDocument();
    expect(screen.getByText("rakip-1")).toBeInTheDocument();
    // Aynı firmanın ürünü bu satırda YOK — o "Firma" sekmesinde yaşıyor.
    expect(screen.queryByText("kendi-1")).toBeNull();
    expect(screen.queryByText("kendi-2")).toBeNull();
  });

  it("benzer yoksa kategoride yeniye düşer (dar dalda tek tedarikçi)", () => {
    render(
      <RelatedRows
        related={{ fromCompany: { items: [], total: 0 }, similar: [], popular: [{
  slug: "yeni-1",
  name: "yeni-1",
  images: [],
  priceMode: "ON_REQUEST",
  unit: "adet",
  categoryId: "39121000",
  company: { slug: "ege-pano", name: "ege-pano", verified: true },
} as never] }}
        categoryName="Panolar"
        hrefFor={(c) => `/urun/${c.slug}`}
      />,
    );
    expect(screen.getByText("Panolar içinde yeni")).toBeInTheDocument();
    expect(screen.getByText("yeni-1")).toBeInTheDocument();
  });

  it("yapışkan şerit YALNIZ eylem verildiğinde çizilir ve BAŞLANGIÇTA gizlidir", () => {
    const { container, rerender } = render(Body());
    expect(container.querySelector(".fixed.inset-x-0.bottom-0")).toBeNull();
    rerender(Body({ stickyCta: <button type="button">Bilgi iste</button> }));
    const bar = container.querySelector(".fixed.inset-x-0.bottom-0");
    expect(bar).toBeTruthy();
    // Asıl eylem ekrandayken şerit KAPALI — aynı düğme iki kez durmaz
    // (nöbetçi yukarı çıkınca IntersectionObserver açar).
    expect(bar).toHaveAttribute("hidden");
  });

  it("başlığın üstünde kategori HAPI, altında satıcı kimliği (faaliyet ikonlu, şehir)", () => {
    // 2026-09-07 (kullanıcı referansı): kategori · faaliyet · şehir üçlüsü
    // başlığın üstünde tek satırdı ve faaliyet+şehir hemen altındaki satıcı
    // özetinde İKİNCİ KEZ okunuyordu. Artık üstte yalnız kategori hapı,
    // firma bilgisi tek yerde (satıcı özeti).
    render(Body());
    expect(screen.getByText("Panolar")).toBeInTheDocument();
    const seller = screen.getByText("Karadeniz Enerji A.Ş.").closest("div");
    expect(seller?.textContent).toContain("Samsun");
    expect(screen.getByText("Hizmet sağlayıcı")).toBeInTheDocument();
  });
});
