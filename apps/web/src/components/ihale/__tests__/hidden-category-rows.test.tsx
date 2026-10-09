// @vitest-environment jsdom
/**
 * PANEL TALEP SATIRLARI — GİZLİ SEGMENT (2026-10-09, sahip kararı: "anasayfada
 * olmayan kategori talepte de gösterilmesin"; arayüz denetimi W-07).
 *
 * Eski talep (46 = kolluk/emniyet segmentinde açılmış) listede KALIR; gizli
 * kategorisi Açık Talepler satırında (maskeli satır dahil) ve Taleplerim
 * satırında — yani talebin SAHİBİNE de — çizilmez: Kategori sütunu, ipucu,
 * "+N kategori", genişletilmiş çipler, açılır özet. Görünür kategorisi
 * kalmayan talep "—" gösterir. Eşleşme rozetleri (`categoryMatch`) sunucuda
 * saklanan kodların tamamından gelir; dokunulmaz.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  maskedRowToSellerRow,
  withVisibleRowCategories,
  type MaskedTenderApiRow,
  type SellerTenderRow,
} from "@/hooks/use-seller-tenders";
import type { TenderListItem } from "@/hooks/use-company-tenders";
import { rowSegments, searchHaystack } from "@/lib/company/request-facets";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satis",
}));
vi.mock("../IhaleItemsPanel", () => ({ IhaleItemsPanel: () => <div data-testid="items-panel" /> }));

import { BrowseTenderRow } from "../BrowseTenderRow";
import { IhaleListRow } from "../IhaleListRow";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
const HIDDEN = { code: "46181500", name: "Koruyucu giysi" };
const VISIBLE = { code: "31161500", name: "Vidalar" };
const HIDDEN_TEXT = /Koruyucu giysi|46181500/;

function sellerRow(over: Partial<SellerTenderRow> = {}): SellerTenderRow {
  return {
    id: "l1",
    number: "ROT-000823",
    title: "Eski talep",
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
    myBidStatus: null,
    myBidSubmitCount: null,
    categoryMatch: true,
    categories: [VISIBLE],
    extraCategoryCount: 0,
    ...over,
  };
}

/** "Kategori" sütununun değer hücresi. */
function categoryCell(container: HTMLElement): HTMLElement {
  const dt = Array.from(container.querySelectorAll("dt")).find((el) => /kategori/i.test(el.textContent ?? ""))!;
  return dt.parentElement!.querySelector("dd")!;
}

beforeEach(() => {
  useCompanyAuthStore.setState({ company: { tier: "SILVER", companyVerificationStatus: "VERIFIED" } as never });
});

describe("Açık Talepler satırı (BrowseTenderRow)", () => {
  it("gizli kategori sütunda, ipucunda ve '+N'de yok; ilk GÖRÜNÜR kategori yazılır", () => {
    // API süzmüyorsa (eski yanıt): gizli + görünür + ham sayaç 2.
    const { container } = render(<BrowseTenderRow t={sellerRow({ categories: [HIDDEN, VISIBLE], extraCategoryCount: 2 })} />);
    const cell = categoryCell(container);
    expect(cell.textContent).toBe("Vidalar");
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    expect(container.querySelector('[title*="Koruyucu"]')).toBeNull();
    // Sayaç ham listeden sayılmıştı (gizliler dahil olabilir) → gösterilmez.
    expect(container.textContent).not.toMatch(/\+\d+ kategori/);
  });

  it("görünür kategorisi kalmayan talep: '—'; eşleşme rozeti yerinde kalır", () => {
    const { container } = render(<BrowseTenderRow t={sellerRow({ categories: [HIDDEN], extraCategoryCount: 0 })} />);
    expect(categoryCell(container).textContent).toBe("—");
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    // Eşleştirme saklanan kodların tamamını kullanır — rozet düşmez.
    expect(screen.getAllByText("Profilinizle eşleşti").length).toBeGreaterThan(0);
  });

  it("genişletilmiş ayrıntıda gizli kategori çipi yok", async () => {
    const user = userEvent.setup();
    const { container } = render(<BrowseTenderRow t={sellerRow({ categories: [HIDDEN, VISIBLE], extraCategoryCount: 1 })} />);
    await user.click(screen.getByRole("button", { name: "Detayları göster" }));
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    expect(container.textContent).not.toContain("+1");
    expect(screen.getAllByText("Vidalar").length).toBeGreaterThan(1); // sütun + ayrıntı çipi
  });

  it("süzen API'de (güncel) liste ve '+N' aynen çizilir", () => {
    const { container } = render(<BrowseTenderRow t={sellerRow({ categories: [VISIBLE], extraCategoryCount: 2 })} />);
    expect(categoryCell(container).textContent).toContain("+2 kategori");
  });
});

describe("Taleplerim satırı (IhaleListRow) — talebin sahibine de gösterilmez", () => {
  const ROW = {
    id: "l55",
    tenderNumber: "ROT-000055",
    title: "Eski talep",
    type: "ALIM",
    format: null,
    status: "OPEN",
    isInternational: false,
    categoryIds: ["46181500", "31161500"],
    categories: [HIDDEN, VISIBLE],
    extraCategoryCount: 0,
    createdById: "u1",
    createdBy: { firstName: "Ada", lastName: "Yılmaz" },
    invitationCount: 0,
    bidCount: 0,
    publishedAt: "2026-08-20T09:00:00.000Z",
    bidsCloseAt: future,
    createdAt: "2026-08-19T09:00:00.000Z",
  } as unknown as TenderListItem;

  it("sütun ve açılır özet yalnız görünür kategoriyi yazar", async () => {
    const user = userEvent.setup();
    const { container } = render(<IhaleListRow t={ROW} favorite={false} onToggleFavorite={vi.fn()} />);
    expect(categoryCell(container).textContent).toBe("Vidalar");
    await user.click(screen.getByRole("button", { name: "Detayları göster" }));
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
  });

  it("yalnız gizli kategorisi olan talep: sütun ve özet '—'", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <IhaleListRow
        t={{ ...ROW, categoryIds: ["46181500"], categories: [HIDDEN], extraCategoryCount: 0 } as TenderListItem}
        favorite={false}
        onToggleFavorite={vi.fn()}
      />,
    );
    expect(categoryCell(container).textContent).toBe("—");
    await user.click(screen.getByRole("button", { name: "Detayları göster" }));
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
  });
});

describe("satır kaynağı (use-seller-tenders) — tek geçiş noktası", () => {
  it("withVisibleRowCategories: gizli kategori düşer; satırı okuyan arama ve sektör sayacı da görmez", () => {
    const raw = sellerRow({ categories: [HIDDEN, VISIBLE], extraCategoryCount: 1 });
    // Süzülmemiş satırda gizli ad aranabilir ve gizli sektör sayılırdı.
    expect(searchHaystack(raw)).toContain("koruyucu giysi");
    expect(rowSegments(raw)).toContain("46000000");

    const row = withVisibleRowCategories(raw);
    expect(row.categories).toEqual([VISIBLE]);
    expect(row.extraCategoryCount).toBe(0);
    expect(searchHaystack(row)).not.toContain("koruyucu");
    expect(rowSegments(row)).toEqual(["31000000"]);
    // Eşleşme bayrağı sunucudan geldiği gibi kalır.
    expect(row.categoryMatch).toBe(true);
  });

  it("withVisibleRowCategories: süzülü satır AYNI nesnedir (gereksiz yeniden çizim yok)", () => {
    const clean = sellerRow({ categories: [VISIBLE], extraCategoryCount: 2 });
    expect(withVisibleRowCategories(clean)).toBe(clean);
  });

  it("maskeli satır (ücretsiz üye): gizli kategori satıra girmez, '+N' yalnız görünürleri sayar", () => {
    const api = {
      number: "ROT-000900",
      title: "Maskeli",
      status: "OPEN",
      primaryCurrency: "TRY",
      isInternational: false,
      targetCountries: [],
      company: { country: "TR", verified: true, activities: [], industry: null, city: null },
      closesAt: future,
      publishedAt: null,
      itemCount: 1,
      coverImageUrl: null,
      masked: true,
      format: "RFQ",
      itemNames: [],
      categoryMatch: false,
      productMatch: false,
      matchedProduct: null,
      categories: [
        { id: "46181500", name: "Koruyucu giysi", level: 3 },
        { id: "31161500", name: "Vidalar", level: 3 },
        { id: "10151500", name: "Tohumlar", level: 3 },
        { id: "39121600", name: "Devre kesiciler", level: 3 },
        { id: "40141700", name: "Borular", level: 3 },
      ],
    } as unknown as MaskedTenderApiRow;
    const row = maskedRowToSellerRow(api);
    expect(row.categories).toEqual([
      { code: "31161500", name: "Vidalar" },
      { code: "39121600", name: "Devre kesiciler" },
    ]);
    expect(row.extraCategoryCount).toBe(1); // 3 görünür − 2 gösterilen
  });
});
