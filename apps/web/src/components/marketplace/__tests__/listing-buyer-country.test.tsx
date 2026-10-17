// @vitest-environment jsdom
/**
 * ALIM TALEBİNDE KONUM = TALEBİN AÇILDIĞI ÜLKE (2026-10-04, kullanıcı: "alıcı
 * talebinde şehir yerine açılan ülke yazılsın, İstanbul yerine Türkiye").
 * Herkese açık talep satırı (anasayfa tedarikçi yüzü, /alim-talepleri, ilgili
 * talepler), teaser kartı, pazar yeri kartı ve talep detayı alıcının şehrini
 * değil firmasının ülkesini bayrakla basar.
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PublicListingCard, PublicListingDetail } from "@/lib/public/marketplace-api";

vi.mock("../public-layout", () => ({ PublicLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/seo/json-ld", () => ({ JsonLd: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { ListingTeaserRow } from "../listing-teaser-row";
import { ListingTeaserCard } from "../listing-teaser-card";
import { ListingCard } from "../listing-card";
import { ListingDetail } from "../listing-detail";

const future = new Date(Date.now() + 5 * 86_400_000).toISOString();

const card: PublicListingCard = {
  number: "ROT-000301",
  slug: "celik-boru",
  type: "ALIM",
  title: "Çelik boru alımı",
  status: "OPEN",
  coverImageUrl: null,
  closesAt: future,
  publishedAt: "2026-09-11T09:00:00.000Z",
  primaryCurrency: "TRY",
  isInternational: false,
  targetCountries: [],
  itemCount: 2,
  itemSummary: { count: 2, totalQuantity: null, unit: null },
  excerpt: null,
  company: { city: "İstanbul", country: "AZ", industry: null, activities: ["MANUFACTURER"], verified: true },
  categories: [{ id: "40141700", name: "Borular", level: 3 }],
} as unknown as PublicListingCard;

const detail = {
  ...card,
  description: null,
  format: "RFQ",
  allowedCurrencies: ["TRY"],
  categoryIds: ["40141700"],
  preferredActivities: [],
  keywords: [],
  requireAllItems: false,
  requireBidDocument: false,
  requireGuaranteeLetter: false,
  isSealedBid: true,
  isLogistics: false,
  deliveryTerm: null,
  paymentCategory: "CASH",
  paymentTiming: "ON_DELIVERY",
  advancePercent: null,
  paymentDays: null,
  lcType: null,
  lcConfirmed: false,
  updatedAt: "2026-09-11T09:00:00.000Z",
  indexable: true,
  items: [{ lineNo: 1, name: "Dikişsiz boru", quantity: "10", unit: "adet" }],
} as unknown as PublicListingDetail;

function expectCountryNotCity(container: HTMLElement) {
  expect(screen.getAllByText("Azerbaycan").length).toBeGreaterThan(0);
  expect(container.querySelector('img[src="/flags/4x3/az.svg"]')).not.toBeNull();
  expect(container.textContent).not.toContain("İstanbul");
}

describe("alım talebi konumu: alıcının şehri değil talebin açıldığı ülke", () => {
  it("talep satırı (ListingTeaserRow): faaliyet tipi · bayrak + ülke", () => {
    const { container } = render(<ListingTeaserRow listing={card} />);
    expectCountryNotCity(container);
    expect(screen.getByText("Üretici")).toBeInTheDocument();
  });

  it("teaser kartı (ListingTeaserCard)", () => {
    const { container } = render(<ListingTeaserCard listing={card} />);
    expectCountryNotCity(container);
  });

  it("pazar yeri kartı (ListingCard listing=…)", () => {
    const { container } = render(<ListingCard listing={card} />);
    expectCountryNotCity(container);
  });

  it("talep detayı alıcı kutusu (ListingDetail)", () => {
    const { container } = render(<ListingDetail listing={detail} />);
    expectCountryNotCity(container);
  });

  it("talep detayı: hedef ülke küre değil BAYRAKLA; alıcı ülkesiyle aynı tek hedef tek satır (son toparlama)", () => {
    const { container, unmount } = render(<ListingDetail listing={{ ...detail, targetCountries: ["DE"] } as PublicListingDetail} />);
    expect(container.querySelector('img[src="/flags/4x3/de.svg"]')).not.toBeNull();
    expect(screen.getAllByText("Almanya").length).toBeGreaterThan(0);
    unmount();
    render(<ListingDetail listing={{ ...detail, targetCountries: ["AZ"] } as PublicListingDetail} />);
    expect(screen.getAllByText("yalnız yurt içi tedarikçiler").length).toBe(1);
  });

  it("ülkesi olmayan eski kayıt: konum satırı çizilmez, şehir de basılmaz", () => {
    const { container } = render(
      <ListingTeaserRow listing={{ ...card, company: { ...card.company, country: null } }} />,
    );
    expect(container.textContent).not.toContain("İstanbul");
    expect(container.querySelector('img[src^="/flags/"]')).toBeNull();
  });
});
