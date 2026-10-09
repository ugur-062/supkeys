// @vitest-environment jsdom
/**
 * TALEP DETAYI › GENEL BİLGİ — GİZLİ SEGMENT (2026-10-09, sahip kararı:
 * "anasayfada olmayan kategori talepte de gösterilmesin"; arayüz denetimi
 * W-08). Eski talebin (46 = kolluk/emniyet) gizli kategorisi talebin SAHİBİNE
 * ve teklif verene de yazılmaz. Görünür kategorisi kalmayan talepte "Kategori"
 * satırı HİÇ çizilmez — başlıksız boş satır ya da bitmeyen yükleme olmaz.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingDetail } from "@/hooks/use-company-listings";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: h.get } }));

import { GeneralInfoTab } from "../general-info-tab";

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const NAMES: Record<string, string> = {
  "39121600": "Devre kesiciler",
  "31161500": "Vidalar",
  // Eski API gizli kodun adını da çözerdi.
  "46181500": "Koruyucu giysi",
};

function listing(categoryIds: string[]): ListingDetail {
  return {
    id: "l1",
    title: "Eski talep",
    type: "ALIM",
    format: "RFQ",
    status: "OPEN",
    visibility: "PUBLIC",
    isOwner: true,
    owner: { name: "Alıcı A.Ş." },
    categoryIds,
    targetCountries: [],
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    paymentCategory: "CASH",
    createdAt: "2026-08-01T09:00:00.000Z",
    bidsOpenAt: null,
    closesAt: "2026-12-01T09:00:00.000Z",
    isSealedBid: true,
    isLogistics: false,
    items: [],
  } as unknown as ListingDetail;
}

beforeEach(() => {
  h.get.mockReset();
  h.get.mockImplementation(async (_url: string, opts: { params: { ids: string } }) => ({
    data: opts.params.ids
      .split(",")
      .filter(Boolean)
      .map((id) => ({ id, code: id, nameTr: NAMES[id] ?? id, level: 3, breadcrumb: "" })),
  }));
});

describe("GeneralInfoTab — kategori satırı", () => {
  it("gizli kategori yazılmaz ve adı sorulmaz; görünür kategori tekil etiketle yazılır", async () => {
    render(<GeneralInfoTab l={listing(["46181500", "39121600"])} />);
    expect(await screen.findByText("Devre kesiciler")).toBeInTheDocument();
    expect(screen.queryByText("Koruyucu giysi")).toBeNull();
    expect(h.get).toHaveBeenCalledWith("/categories/by-ids", { params: { ids: "39121600" } });
    // Tek görünür kategori → "Kategori" (çoğul "Kategoriler" değil: gizli sayılmaz).
    expect(screen.getByText("Kategori")).toBeInTheDocument();
    expect(screen.queryByText("Kategoriler")).toBeNull();
  });

  it("yalnız gizli kategorisi olan talep: 'Kategori' satırı HİÇ çizilmez, istek atılmaz", async () => {
    render(<GeneralInfoTab l={listing(["46181500"])} />);
    // Sekmenin geri kalanı çizilir.
    expect(await screen.findByText("Alıcı A.Ş.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/^Kategori(ler)?$/)).toBeNull());
    expect(screen.queryByText("Koruyucu giysi")).toBeNull();
    expect(screen.queryByText("46181500")).toBeNull();
    expect(h.get).not.toHaveBeenCalled();
  });
});
