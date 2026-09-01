// @vitest-environment jsdom
import type { CompanyOrder } from "@/hooks/use-company-orders";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  orders: {
    data: undefined as CompanyOrder[] | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/hooks/use-company-orders", () => ({
  useOrders: () => h.orders,
}));
// Faz 4.2 — OrdersList başlangıç filtresi için URL okur (drill-down).
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { OrdersList } from "../orders-list";

let seq = 0;
function order(over: Partial<CompanyOrder> = {}): CompanyOrder {
  seq += 1;
  return {
    id: `o${seq}`,
    number: `ORD-2026-000${seq}`,
    amount: "1000",
    currency: "TRY",
    status: "PENDING",
    role: "buyer",
    counterparty: "Karşı A.Ş.",
    counterpartyCompanyId: `c${seq}`,
    listingId: `l${seq}`,
    listingTitle: `İlan ${seq}`,
    listingType: "ALIM",
    listingNumber: `ROT-2026-000${seq}`,
    createdAt: new Date(Date.now() - seq * 86_400_000).toISOString(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  h.orders = {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
});

describe("OrdersList — durum katmanları", () => {
  it("yükleniyor + veri yok → iskelet gösterilir", () => {
    h.orders = {
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    };
    const { container } = render(<OrdersList role="buyer" />);
    // Başlık her durumda görünür.
    expect(screen.getByText("Siparişlerim")).toBeInTheDocument();
    // İskelet kartları animate-pulse taşır; hiç sipariş satırı yok.
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/Henüz sipariş yok/)).not.toBeInTheDocument();
  });

  it("HATA + veri yok → ErrorState + tekrar-dene refetch çağırır", async () => {
    const refetch = vi.fn();
    h.orders = { data: undefined, isLoading: false, isError: true, refetch };
    render(<OrdersList role="buyer" />);

    expect(
      screen.getByText("Siparişler yüklenemedi. Lütfen tekrar deneyin."),
    ).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Tekrar dene" });
    await userEvent.click(retry);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("boş liste (alıcı) → 'Henüz sipariş yok' + İhalelerime Git aksiyonu", () => {
    h.orders = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    render(<OrdersList role="buyer" />);
    expect(screen.getByText("Henüz sipariş yok")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "İhalelerime Git" }),
    ).toBeInTheDocument();
  });

  it("boş liste (satıcı) → satıcıya özel metin + Açık Taleplere Göz At", () => {
    h.orders = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    render(<OrdersList role="seller" />);
    expect(
      screen.getByText(/Satışlarınız — kazandığınız satın alma taleplerinden/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Açık Taleplere Göz At" }),
    ).toBeInTheDocument();
  });
});

describe("OrdersList — rol ayrımı + filtreleme", () => {
  it("yalnız kendi rolündeki siparişleri gösterir", () => {
    h.orders = {
      data: [
        order({ role: "buyer", listingTitle: "Alıcı Siparişi" }),
        order({ role: "seller", listingTitle: "Satıcı Siparişi" }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<OrdersList role="buyer" />);
    expect(screen.getByText("Alıcı Siparişi")).toBeInTheDocument();
    expect(screen.queryByText("Satıcı Siparişi")).not.toBeInTheDocument();
  });

  it("alıcı ALIM siparişi → 'Kendi Satın Alma Talebim' + 'Satıcı:' etiketi", () => {
    h.orders = {
      data: [
        order({
          role: "buyer",
          listingType: "ALIM",
          counterparty: "Tedarikçi X",
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<OrdersList role="buyer" />);
    expect(screen.getByText("Kendi Satın Alma Talebim")).toBeInTheDocument();
    // "Tedarikçi X" hem satır etiketinde hem karşı-taraf filtre <option>'unda
    // geçer; satır etiketini tam metinle eşleştirip tekilliği koru.
    expect(screen.getByText("Satıcı: Tedarikçi X")).toBeInTheDocument();
  });

  it("durum filtresi PENDING → yalnız onay bekleyen satır kalır", async () => {
    h.orders = {
      data: [
        order({ status: "PENDING", listingTitle: "Bekleyen Sipariş" }),
        order({ status: "COMPLETED", listingTitle: "Biten Sipariş" }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<OrdersList role="buyer" />);
    expect(screen.getByText("Bekleyen Sipariş")).toBeInTheDocument();
    expect(screen.getByText("Biten Sipariş")).toBeInTheDocument();

    // FilterSelect artık Listbox (P0): buton → seçenek tıklama.
    await userEvent.click(screen.getByRole("button", { name: "Durum filtresi" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /Onay bekl/i }),
    );
    expect(screen.getByText("Bekleyen Sipariş")).toBeInTheDocument();
    expect(screen.queryByText("Biten Sipariş")).not.toBeInTheDocument();
  });

  it("arama (debounced) → eşleşen ilan başlığına göre süzer", async () => {
    h.orders = {
      data: [
        order({ listingTitle: "Çelik Boru Alımı" }),
        order({ listingTitle: "Kablo Tedariği" }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<OrdersList role="buyer" />);
    const search = screen.getByPlaceholderText(
      "Sipariş no, ilan veya karşı taraf…",
    );
    await userEvent.type(search, "kablo");

    await waitFor(() =>
      expect(screen.queryByText("Çelik Boru Alımı")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Kablo Tedariği")).toBeInTheDocument();
  });

  it("KPI şeridi: Tamamlanan sayacı tıklanınca durum filtresi uygular", async () => {
    h.orders = {
      data: [
        order({ status: "COMPLETED", listingTitle: "Biten A" }),
        order({ status: "PENDING", listingTitle: "Bekleyen B" }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<OrdersList role="buyer" />);
    // "Tamamlanan" KPI kutusu (buton) → tıkla → yalnız COMPLETED kalır.
    const completedKpi = screen
      .getByText("Tamamlanan")
      .closest("button") as HTMLButtonElement;
    await userEvent.click(within(completedKpi).getByText("Tamamlanan"));
    expect(screen.getByText("Biten A")).toBeInTheDocument();
    expect(screen.queryByText("Bekleyen B")).not.toBeInTheDocument();
  });
});
