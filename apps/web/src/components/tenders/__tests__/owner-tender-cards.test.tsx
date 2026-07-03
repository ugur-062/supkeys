// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OwnerTenderList } from "../owner-tender-cards";
import { LISTING_STATUS_LABELS } from "../status-badge";
import type { TenderListItem } from "@/hooks/use-company-tenders";

// Kart, hızlı "Yayınla" aksiyonu için QueryClient ister.
function render(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

const item: TenderListItem = {
  id: "l1",
  tenderNumber: "ROT-0001",
  title: "Çelik alımı ihalesi",
  type: "ALIM",
  format: "RFQ",
  status: "OPEN",
  createdBy: { firstName: "Ali", lastName: "Veli" },
  invitationCount: 3,
  bidCount: 1,
  publishedAt: "2026-07-01T08:00:00.000Z",
  bidsCloseAt: "2026-07-20T08:00:00.000Z",
  createdAt: "2026-07-01T08:00:00.000Z",
} as TenderListItem;

const base = { onRetry: vi.fn() };

describe("OwnerTenderList durumları", () => {
  it("hata: mesaj + 'Tekrar dene' onRetry çağırır", async () => {
    const onRetry = vi.fn();
    render(
      <OwnerTenderList items={[]} isLoading={false} isError onRetry={onRetry} />,
    );
    expect(screen.getByText("Veri alınamadı.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("boş: 'Henüz ihale yok' + CTA adı gösterir", () => {
    render(
      <OwnerTenderList
        items={[]}
        isLoading={false}
        isError={false}
        emptyCtaLabel="Yeni Satış İhalesi"
        {...base}
      />,
    );
    expect(screen.getByText("Henüz ihale yok")).toBeInTheDocument();
    expect(
      screen.getByText(/Yeni Satış İhalesi/),
    ).toBeInTheDocument();
  });

  it("yükleniyor: hata/boş mesajı göstermez (iskelet)", () => {
    render(
      <OwnerTenderList items={[]} isLoading isError={false} {...base} />,
    );
    expect(screen.queryByText("Henüz ihale yok")).not.toBeInTheDocument();
    expect(screen.queryByText("Veri alınamadı.")).not.toBeInTheDocument();
  });

  it("veri: kart başlık + durum + davet/teklif sayaçları render edilir", () => {
    render(
      <OwnerTenderList
        items={[item]}
        isLoading={false}
        isError={false}
        {...base}
      />,
    );
    expect(screen.getByText("Çelik alımı ihalesi")).toBeInTheDocument();
    expect(
      screen.getByText(LISTING_STATUS_LABELS.OPEN),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText((_, el) => {
        const t = el?.textContent?.replace(/\s+/g, "") ?? "";
        return t === "3davetli";
      }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, el) => {
        const t = el?.textContent?.replace(/\s+/g, "") ?? "";
        return t === "1teklif";
      }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Ali Veli")).toBeInTheDocument();
    // Kart detaya linkler.
    expect(
      screen.getByRole("link"),
    ).toHaveAttribute("href", expect.stringContaining("/company/ilan/l1"));
  });

  it("SATIS: İngiliz usulü 'Açık Artırma' rozetiyle gösterilir", () => {
    render(
      <OwnerTenderList
        items={[
          {
            ...item,
            id: "l2",
            type: "SATIS",
            format: "ENGLISH_AUCTION",
          } as TenderListItem,
        ]}
        isLoading={false}
        isError={false}
        listingType="SATIS"
        {...base}
      />,
    );
    expect(screen.getByText("Açık Artırma")).toBeInTheDocument();
  });
});
