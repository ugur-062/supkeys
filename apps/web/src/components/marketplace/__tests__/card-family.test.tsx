// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CompanyCard } from "../company-card";
import { ProductCard } from "../product-card";

/**
 * KART AİLESİ SÖZLEŞMESİ (PROMPT 5) — rozetler tek kaynaktan gelir ve kartın
 * İÇİNDE durur. Regresyon: kapak rozeti (`badge`) konumlandırılmamış bir atada
 * `absolute` idi; kart `<a>` olduğu için `relative` alamıyordu ve panel rozeti
 * kartın dışına düşüyordu.
 */
const product = {
  slug: "celik-boru",
  name: "Çelik boru DN50",
  images: [] as string[],
  categoryId: "40170000",
  unit: "adet",
  priceMode: "ON_REQUEST" as const,
};

const company = { name: "Demir Metal", city: "Kocaeli", verified: true, gold: true };

describe("ProductCard", () => {
  it("kapak rozetini kartın içinde konumlandırır", () => {
    const { container } = render(
      <ProductCard product={product} companySlug="demir-metal" badge={<span>Eşleşiyor</span>} />,
    );
    const card = container.querySelector("article");
    expect(card?.className).toContain("relative");
    const badge = screen.getByText("Eşleşiyor");
    expect(card?.contains(badge)).toBe(true);
  });

  it("ROZET HİYERARŞİSİ: kapakta EN FAZLA BİR rozet, firma sinyalleri firma satırında", () => {
    // 2026-09-07 (kullanıcı bulgusu): "Gold Üye" METİN rozeti paketli firma
    // çok olduğu için neredeyse her kartta çıkıyor, ayırt ediciliğini
    // yitiriyordu — metin olarak kaldırıldı.
    // Aynı gün ikinci tur: "Doğrulanmış" da kapaktan indi. Firma özelliği,
    // firma satırında ikon olarak duruyor; kapakta da basmak aynı olguyu
    // iki kez yazmaktı. Kapak artık ürüne ait tek sinyali taşır (çağıranın
    // rozeti ya da "Yeni").
    const { container } = render(<ProductCard product={product} companySlug="d" company={company} />);
    // GÖRÜNEN metin rozeti yok — ikisi de yalnız ikon (+ sr-only etiket).
    const verified = screen.getByText("Doğrulanmış firma");
    const gold = screen.getByText("Gold Üye");
    expect(verified.className).toContain("sr-only");
    expect(gold.className).toContain("sr-only");
    const cover = container.querySelector("article > div:first-child");
    expect(cover?.contains(verified)).toBe(false);
    expect(cover?.contains(gold)).toBe(false);
    expect(screen.getByText(company.name).parentElement?.contains(verified)).toBe(true);
  });

  it("kapakta çağıranın rozeti 'Yeni'nin YERİNE geçer (tek rozet)", () => {
    const fresh = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const { container } = render(
      <ProductCard
        product={{ ...product, publishedAt: fresh }}
        companySlug="d"
        company={company}
        badge={<span>Eşleşiyor</span>}
      />,
    );
    const cover = container.querySelector("article > div:first-child");
    expect(cover?.contains(screen.getByText("Eşleşiyor"))).toBe(true);
    expect(screen.queryByText("Yeni")).toBeNull();
  });

  it("CTA kartın bağlantısından AYRI bir hedefe gider ve tıklaması karta sızmaz", () => {
    // Kart → ürün sayfası; CTA → aynı sayfanın bilgi isteme çapası. Aynı
    // yere gitselerdi "ayrı düğme" olduğu yalan olurdu.
    render(<ProductCard product={product} companySlug="demir-metal" cta="Bilgi iste" />);
    const title = screen.getByRole("link", { name: product.name });
    const ctaLink = screen.getByRole("link", { name: "Bilgi iste" });
    expect(title.getAttribute("href")).toBe("/firma/demir-metal/urun/celik-boru");
    expect(ctaLink.getAttribute("href")).toBe("/firma/demir-metal/urun/celik-boru#bilgi-iste");

    const bubbled = vi.fn();
    const { container } = render(
      <div onClick={bubbled}>
        <ProductCard product={product} companySlug="demir-metal" cta="Bilgi iste" />
      </div>,
    );
    fireEvent.click(container.querySelectorAll('a[href$="#bilgi-iste"]')[0]!);
    expect(bubbled).not.toHaveBeenCalled();
  });

  it("'Karşılaştır' yalnız istenince çizilir ve yerel durumu tutar", () => {
    expect(screen.queryByLabelText(/Karşılaştır/)).toBeNull();
    const onCompare = vi.fn();
    render(<ProductCard product={product} companySlug="d" compare onCompare={onCompare} />);
    const box = screen.getByRole("checkbox");
    expect((box as HTMLInputElement).checked).toBe(false);
    fireEvent.click(box);
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(onCompare).toHaveBeenCalledWith(true);
  });

  it("yayın tarihi 7 günden yeniyse 'Yeni' rozeti basar, eskiyse basmaz", () => {
    const fresh = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { rerender } = render(
      <ProductCard product={{ ...product, publishedAt: fresh }} companySlug="d" />,
    );
    expect(screen.getByText("Yeni")).toBeTruthy();
    rerender(<ProductCard product={{ ...product, publishedAt: old }} companySlug="d" />);
    expect(screen.queryByText("Yeni")).toBeNull();
  });

  it("faaliyet tipini ÜRÜN kartında göstermez (karar kriteri değil)", () => {
    render(
      <ProductCard product={product} companySlug="d" company={{ ...company, activities: ["URETICI"] }} />,
    );
    expect(screen.queryByText("Üretici")).toBeNull();
  });
});

describe("CompanyCard", () => {
  const base = {
    name: "Demir Metal",
    slug: "demir-metal",
    city: "Kocaeli",
    country: "TR",
    industry: null,
    activities: ["URETICI", "DISTRIBUTOR_BAYI", "HIZMET_SAGLAYICI", "ITHALATCI_IHRACATCI"],
    logoUrl: null,
    verified: true,
    mainCategory: null,
    productCount: 3,
    productPreview: [],
  };

  it("en çok 3 faaliyet rozeti + kalanı sayar", () => {
    render(<CompanyCard company={base} />);
    expect(screen.getByText("+1")).toBeTruthy();
  });

  it("kuruluş ve çalışan bilgisini olgu satırında birleştirir", () => {
    render(<CompanyCard company={{ ...base, foundedYear: 2008, employeeCount: "50-100" }} />);
    expect(screen.getByText("3 ürün · Kuruluş 2008 · 50-100 çalışan")).toBeTruthy();
  });

  it("eski dizin yanıtında yeni alanlar yoksa çökmez", () => {
    render(<CompanyCard company={base} />);
    expect(screen.getByText("3 ürün")).toBeTruthy();
    expect(screen.queryByText("Gold Üye")).toBeNull();
  });
});
