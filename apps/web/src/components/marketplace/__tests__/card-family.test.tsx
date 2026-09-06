// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

  it("Doğrulanmış ve Gold rozetlerini firma verisinden basar", () => {
    render(<ProductCard product={product} companySlug="d" company={company} />);
    expect(screen.getByText("Doğrulanmış firma")).toBeTruthy();
    expect(screen.getByText("Gold Üye")).toBeTruthy();
  });

  it("çağıranın rozeti Gold rozetinin yerini alır (tek kapak rozeti)", () => {
    render(
      <ProductCard product={product} companySlug="d" company={company} badge={<span>Eşleşiyor</span>} />,
    );
    expect(screen.queryByText("Gold Üye")).toBeNull();
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
