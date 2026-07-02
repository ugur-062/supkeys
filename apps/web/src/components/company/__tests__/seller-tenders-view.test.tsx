// @vitest-environment jsdom
import {
  render,
  screen,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  isLoading: false,
  isError: false,
}));

vi.mock("@/hooks/use-seller-tenders", () => ({
  useSellerTenders: () => ({
    data: h.rows,
    isLoading: h.isLoading,
    isError: h.isError,
  }),
}));

import { SellerTendersView } from "../seller-tenders-view";

let seq = 0;
function row(over: Partial<SellerTenderRow> = {}): SellerTenderRow {
  seq++;
  return {
    id: `l${seq}`,
    number: `ROT-2026-000${seq}`,
    title: `İhale ${seq}`,
    status: "OPEN",
    visibility: "CONNECTIONS",
    format: "RFQ",
    currency: "TRY",
    isInternational: false,
    closesAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
    itemCount: 3,
    owner: { name: "Alıcı A.Ş." },
    masked: false,
    canBid: true,
    invited: true,
    myBidStatus: null,
    myBidVersion: null,
    categoryMatch: false,
    categories: [{ code: "10000000", name: "Canlı Hayvanlar" }],
    extraCategoryCount: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  h.rows = [];
  h.isLoading = false;
  h.isError = false;
});

describe("SellerTendersView", () => {
  it("kart: durum rozeti + alıcı + kategori + aciliyet render edilir", () => {
    h.rows = [row({ categoryMatch: true, myBidVersion: 2, myBidStatus: "SUBMITTED" })];
    render(<SellerTendersView />);

    expect(screen.getByText("İhale 1")).toBeInTheDocument();
    expect(screen.getByText("Teklif Gönderildi")).toBeInTheDocument();
    expect(screen.getByText("Alıcı A.Ş.")).toBeInTheDocument();
    expect(screen.getByText("Kategorine Uygun")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("5 gün kaldı")).toBeInTheDocument();
    expect(screen.getByText("3 kalem")).toBeInTheDocument();
  });

  it("maskeli kart 'Gizli firma' + Premium çipi gösterir", () => {
    h.rows = [row({ masked: true, owner: null, canBid: false, invited: false })];
    render(<SellerTendersView />);
    expect(screen.getByText("Gizli firma")).toBeInTheDocument();
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });

  it("varsayılan tab Aktif: geçmiş ilan gizli; Geçmiş'e geçince görünür", async () => {
    const user = userEvent.setup();
    h.rows = [
      row({ title: "Açık İhale" }),
      row({ title: "Biten İhale", status: "AWARDED", myBidStatus: "WON" }),
    ];
    render(<SellerTendersView />);

    expect(screen.getByText("Açık İhale")).toBeInTheDocument();
    expect(screen.queryByText("Biten İhale")).not.toBeInTheDocument();

    const durum = screen.getByLabelText("Durum");
    await user.selectOptions(within(durum.parentElement!).getByRole("combobox"), "past");
    expect(screen.getByText("Biten İhale")).toBeInTheDocument();
    expect(screen.queryByText("Açık İhale")).not.toBeInTheDocument();
    expect(screen.getByText("Kazandın")).toBeInTheDocument();
  });

  it("müşteri filtresi veriden türetilir ve uygulanır", async () => {
    const user = userEvent.setup();
    h.rows = [
      row({ owner: { name: "Firma X" }, title: "X'in ihalesi" }),
      row({ owner: { name: "Firma Y" }, title: "Y'nin ihalesi" }),
    ];
    render(<SellerTendersView />);

    const musteri = screen.getByLabelText("Müşteri");
    await user.selectOptions(
      within(musteri.parentElement!).getByRole("combobox"),
      "Firma X",
    );
    expect(screen.getByText("X'in ihalesi")).toBeInTheDocument();
    expect(screen.queryByText("Y'nin ihalesi")).not.toBeInTheDocument();
  });

  it("arama başlık/numara/alıcıda çalışır", async () => {
    const user = userEvent.setup();
    h.rows = [row({ title: "Çelik Boru Alımı" }), row({ title: "Kablo Alımı" })];
    render(<SellerTendersView />);

    await user.type(screen.getByPlaceholderText("İhale ara…"), "çelik");
    // SearchInput debounce'lı (300ms) → filtrenin uygulanmasını bekle.
    await waitForElementToBeRemoved(() => screen.queryByText("Kablo Alımı"));
    expect(screen.getByText("Çelik Boru Alımı")).toBeInTheDocument();
  });

  it("boş durum + hata durumu", () => {
    h.rows = [];
    const { unmount } = render(<SellerTendersView />);
    expect(screen.getByText("Henüz ihale yok")).toBeInTheDocument();
    unmount();

    h.isError = true;
    render(<SellerTendersView />);
    expect(screen.getByText("İhaleler yüklenemedi")).toBeInTheDocument();
  });
});
