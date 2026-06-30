// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TendersTable } from "../tenders-table";
import { LISTING_STATUS_LABELS } from "../status-badge";
import type { TenderListItem } from "@/hooks/use-company-tenders";

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

const base = { pageSize: 20, onRetry: vi.fn() };

describe("TendersTable durumları", () => {
  it("hata: mesaj + 'Tekrar dene' onRetry çağırır", async () => {
    const onRetry = vi.fn();
    render(
      <TendersTable items={[]} isLoading={false} isError onRetry={onRetry} pageSize={20} />,
    );
    expect(screen.getByText("Veri alınamadı.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("boş: 'Henüz ihale yok' gösterir", () => {
    render(
      <TendersTable items={[]} isLoading={false} isError={false} {...base} />,
    );
    expect(screen.getByText("Henüz ihale yok")).toBeInTheDocument();
  });

  it("yükleniyor: hata/boş mesajı göstermez (iskelet)", () => {
    render(
      <TendersTable items={[]} isLoading isError={false} {...base} />,
    );
    expect(screen.queryByText("Veri alınamadı.")).not.toBeInTheDocument();
    expect(screen.queryByText("Henüz ihale yok")).not.toBeInTheDocument();
  });

  it("veri: ihale başlığı + durum etiketi render edilir", () => {
    render(
      <TendersTable items={[item]} isLoading={false} isError={false} {...base} />,
    );
    // Masaüstü + mobil iki kez render olabilir → getAllByText
    expect(screen.getAllByText("Çelik alımı ihalesi").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(LISTING_STATUS_LABELS.OPEN).length,
    ).toBeGreaterThan(0);
  });
});
