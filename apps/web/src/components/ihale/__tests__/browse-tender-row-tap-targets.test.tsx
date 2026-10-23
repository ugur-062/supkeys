// @vitest-environment jsdom
/**
 * Mobil denetim 2026-10 (g08-seller-requests-tap-targets, kalan kısım):
 * /company/satis satırında "Teklifim: Geri çekildi" bağlantısı 61×14 px,
 * açılan satırdaki "Kalemler ve tüm detay →" 146×18 px idi.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satis",
}));
vi.mock("../IhaleItemsPanel", () => ({ IhaleItemsPanel: () => <div data-testid="items-panel" /> }));

import { BrowseTenderRow } from "../BrowseTenderRow";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const future = new Date(Date.now() + 5 * 86_400_000).toISOString();

function sellerRow(over: Partial<SellerTenderRow> = {}): SellerTenderRow {
  return {
    id: "l1",
    number: "ROT-000823",
    title: "Rulman alımı",
    status: "OPEN",
    visibility: "PUBLIC",
    format: "RFQ",
    currency: "TRY",
    isInternational: false,
    targetCountries: [],
    ownerCountry: "TR",
    closesAt: future,
    createdAt: new Date().toISOString(),
    itemCount: 2,
    owner: { id: "c1", name: "Alıcı A.Ş." },
    canBid: true,
    invited: false,
    connected: false,
    myBidStatus: "WITHDRAWN",
    myBidSubmitCount: 1,
    categoryMatch: false,
    categories: [{ code: "31161500", name: "Vidalar" }],
    extraCategoryCount: 0,
    ...over,
  };
}

const cls = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/);

beforeEach(() => {
  useCompanyAuthStore.setState({ company: { tier: "SILVER", companyVerificationStatus: "VERIFIED" } as never });
});

describe("BrowseTenderRow — dokunma hedefleri", () => {
  it("'Teklifim' bağlantısı satır içi kalır; satır yüksekliği + dikey dolgu dokunma alanını büyütür (telefonda ~30, geniş ekranda 24 px)", () => {
    render(<BrowseTenderRow t={sellerRow()} />);
    const link = screen.getByRole("link", { name: "Geri çekildi" });
    expect(cls(link)).toEqual(expect.arrayContaining(["py-2", "leading-8", "sm:py-[5px]", "sm:leading-6"]));
    // inline-block / inline-flex olmaz: kart metriği `truncate`; atomik kutu dar
    // satırda üç noktanın arkasında bütünüyle kaybolurdu. Eksi kenar boşluğu da
    // yok (kırpılan çerçeve tıklanmaz).
    expect(cls(link).some((c) => /^(sm:)?inline-(block|flex)$/.test(c))).toBe(false);
    expect(cls(link).some((c) => /^-m[xy]?-/.test(c))).toBe(false);
  });

  it("açılan satırda 'Kalemler ve tüm detay' telefonda 44 px satır, sm'den eski satır içi bağlantı", async () => {
    render(<BrowseTenderRow t={sellerRow()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Detayları göster" }));
    const link = screen.getByRole("link", { name: /Kalemler ve tüm detay/ });
    expect(cls(link)).toEqual(
      expect.arrayContaining(["inline-flex", "min-h-11", "items-center", "sm:inline-block", "sm:min-h-0", "sm:mt-2"]),
    );
  });
});
