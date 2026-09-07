// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ProductBreadcrumb, ProductDetailBody, RelatedRows } from "../product-detail";
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

/**
 * YOL (kırıntı) — kaynak kalıptaki gibi EV İKONU + ">" ayraç (2026-09-08,
 * kullanıcı isteği). Ev ikonu "Anasayfa" metninin YERİNE geçer: aynı hedef
 * iki kez yazılmaz.
 */
describe("ProductBreadcrumb", () => {
  it("ev ikonu bağlantısı ve sıradaki adımlar", () => {
    render(
      <ProductBreadcrumb
        home={{ href: "/company/satinalma", label: "Satınalma anasayfası" }}
        trail={[
          { label: "Ürün Ara", href: "/company/satinalma/urunler" },
          { label: "Marmara Gıda Ltd. Şti.", href: "/company/firma/1" },
        ]}
        current="Kornişon Turşu 720 ml Cam Kavanoz"
        accent="blue"
      />,
    );
    expect(screen.getByRole("link", { name: "Satınalma anasayfası" })).toHaveAttribute(
      "href",
      "/company/satinalma",
    );
    expect(screen.getByRole("link", { name: "Ürün Ara" })).toBeInTheDocument();
    // Son adım bağlantı DEĞİL, mevcut sayfa — panelde MAVİ (tema rengi).
    const current = screen.getByText("Kornişon Turşu 720 ml Cam Kavanoz");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.className).toContain("text-blue-700");
  });
});

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

  it("SEKMELER: yalnız VERİSİ OLAN sekme çizilir (uydurma sekme yok)", async () => {
    // 2026-09-08 (kullanıcı tasarımı): gövde sekmelere döndü — Ürün
    // Özellikleri · Teknik Özellikler · Belgeler · Sertifikalar. Tasarımdaki
    // "Tedarik ve Ödeme" ve "Yorumlar (32)" BASILMAZ: o alanlar şemada yok,
    // boş sekme açmak ya da sayı uydurmak yanlış olurdu.
    const u = userEvent.setup();
    render(
      Body({
        product: {
          ...product,
          attributeList: [{ key: "guc", label: "Güç", value: "400", unit: "kVAr" }],
        } as PublicProduct,
      }),
    );
    expect(screen.getByRole("tab", { name: "Ürün Özellikleri" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Teknik Özellikler" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Tedarik ve Ödeme/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Yorumlar/ })).toBeNull();
    // Belge yok → "Belgeler" sekmesi de yok.
    expect(screen.queryByRole("tab", { name: "Belgeler" })).toBeNull();

    await u.click(screen.getByRole("tab", { name: "Teknik Özellikler" }));
    expect(await screen.findByText("Güç")).toBeTruthy();
    expect(screen.getByText("400 kVAr")).toBeTruthy();
  });

  it("nitelik YOKSA 'Teknik Özellikler' sekmesi çizilmez (açıklamadan ayrıştırılmaz)", () => {
    render(Body());
    expect(screen.queryByRole("tab", { name: "Teknik Özellikler" })).toBeNull();
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
