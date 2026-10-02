// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PublicListingDetail } from "@/lib/public/marketplace-api";

vi.mock("../public-layout", () => ({ PublicLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/seo/json-ld", () => ({ JsonLd: () => null }));

import { ListingDetail } from "../listing-detail";

/**
 * Herkese açık talep sayfası (arayüz testi D-061, D-073, D-334): kategori
 * çipi adıyla aynı kategoriye gider; erken kapanmış talepte ileri tarihli
 * "Son teklif tarihi" ve teklif çağrısı yok; bilgi tablosunda tek tarih biçimi.
 */
const future = new Date(Date.now() + 5 * 86_400_000).toISOString();

const base = {
  number: "ROT-000295",
  slug: "celik-levha",
  type: "ALIM",
  title: "Çelik levha alımı",
  status: "OPEN",
  coverImageUrl: null,
  closesAt: future,
  publishedAt: "2026-09-11T09:00:00.000Z",
  primaryCurrency: "TRY",
  isInternational: false,
  targetCountries: [],
  itemCount: 1,
  itemSummary: { count: 1, totalQuantity: "10", unit: "adet" },
  company: { verified: true, activities: [], industry: null, city: null },
  categories: [{ id: "31161500", name: "Vidalar", level: 4 }],
  description: null,
  format: "RFQ",
  allowedCurrencies: ["TRY"],
  categoryIds: ["31161500"],
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
  items: [{ lineNo: 1, name: "S235 levha", quantity: "10", unit: "adet" }],
} as unknown as PublicListingDetail;

describe("ListingDetail", () => {
  it("kategori çipi yaprağın kendisine bağlanır (segmente yuvarlanmaz)", () => {
    render(<ListingDetail listing={base} />);
    expect(screen.getByRole("link", { name: "Vidalar" }).getAttribute("href")).toMatch(/\?kategori=31161500$/);
  });

  it("açık talep: son teklif tarihi ve yayın tarihi aynı (kısa) biçimde, teklif çağrısı var", () => {
    render(<ListingDetail listing={base} />);
    const info = screen.getByRole("heading", { name: "Talep bilgileri" }).parentElement as HTMLElement;
    expect(within(info).getByText("Son teklif tarihi")).toBeInTheDocument();
    expect(within(info).getByText("11 Eyl 2026")).toBeInTheDocument();
    expect(screen.getByText(/teklif vermek Silver paketiyle açılır/)).toBeInTheDocument();
  });

  it("erken kapanmış talep: ileri tarihli son teklif tarihi ve teklif çağrısı yok", () => {
    render(<ListingDetail listing={{ ...base, status: "AWARDED" }} />);
    const info = screen.getByRole("heading", { name: "Talep bilgileri" }).parentElement as HTMLElement;
    expect(within(info).queryByText("Son teklif tarihi")).toBeNull();
    expect(screen.queryByText(/teklif vermek Silver paketiyle/)).toBeNull();
    expect(screen.getByText(/belgeleri görmek Silver paketiyle açılır/)).toBeInTheDocument();
    expect(screen.getByText("Bu talep teklife kapalı.")).toBeInTheDocument();
  });
});
