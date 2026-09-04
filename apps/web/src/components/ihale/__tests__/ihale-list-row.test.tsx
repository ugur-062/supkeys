// @vitest-environment jsdom
/**
 * İlan satırı — KART SÖZLEŞMESİ (2026-09-03).
 *
 * Kilit: bilgi sırası sabit (kod + ad üstte, durum rozeti aynı satırda,
 * altta Davetli / Kapsam / Yayın / Kapanış), soldaki "›" oku yok, TÜM kart
 * tıklanır ama favori/kalemler düğmeleri sayfayı değiştirmez.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenderListItem } from "@/hooks/use-company-tenders";

const h = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  usePathname: () => "/company/satis/ilanlarim",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../IhaleItemsPanel", () => ({
  IhaleItemsPanel: () => <div data-testid="items-panel" />,
}));

import { IhaleListRow, statusStyle } from "../IhaleListRow";

const ROW = {
  id: "l55",
  tenderNumber: "ROT-000055",
  title: "Paslanmaz çelik boru satışı",
  type: "ALIM",
  format: null,
  status: "IN_AWARD",
  isInternational: false,
  categoryIds: ["40171501"],
  categories: [{ code: "40171501", name: "Çelik boru" }],
  extraCategoryCount: 0,
  createdById: "u1",
  createdBy: { firstName: "Ada", lastName: "Yılmaz" },
  invitationCount: 4,
  bidCount: 2,
  publishedAt: "2026-08-20T09:00:00.000Z",
  bidsCloseAt: "2026-09-01T09:00:00.000Z",
  createdAt: "2026-08-19T09:00:00.000Z",
} as unknown as TenderListItem;

beforeEach(() => {
  h.push.mockReset();
});

describe("IhaleListRow", () => {
  it("kart sırası: kod+ad, rozet, sonra Davetli / Kapsam / Yayın / Kapanış; '›' oku yok", () => {
    render(
      <IhaleListRow t={ROW} favorite={false} onToggleFavorite={vi.fn()} />,
    );
    expect(screen.getByText("ROT-000055")).toBeInTheDocument();
    expect(screen.getByText("Paslanmaz çelik boru satışı")).toBeInTheDocument();
    expect(screen.getByText(statusStyle("IN_AWARD").label)).toBeInTheDocument();
    // Kapanış geçmiş + karar yok → zaman notu (4d).
    expect(screen.getByText(/Süresi doldu/)).toBeInTheDocument();

    // Sabit sütunlar bu SIRAYLA (v2 7c): Sorumlu · Davetli · Kapsam · Yayın ·
    // Kapanış · Kategori; Teklifler sağ altta metrik.
    const card = document.querySelector("dl")!;
    const labels = within(card)
      .getAllByRole("term")
      .map((dt) => dt.textContent?.trim());
    expect(labels).toEqual(["Sorumlu", "Davetli", "Kapsam", "Yayın", "Kapanış", "Kategori"]);
    expect(screen.getByText("Teklifler:")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Detayı genişlet" })).toBeNull();
  });

  it("tüm kart detaya götürür; favori ve Kalemler düğmeleri sayfayı DEĞİŞTİRMEZ", async () => {
    const user = userEvent.setup();
    const onFav = vi.fn();
    render(
      <IhaleListRow t={ROW} favorite={false} onToggleFavorite={onFav} />,
    );

    await user.click(screen.getByRole("button", { name: "Favorilere ekle" }));
    expect(onFav).toHaveBeenCalledWith("l55");
    expect(h.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Kalemler" }));
    expect(screen.getByTestId("items-panel")).toBeInTheDocument();
    expect(h.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("row"));
    expect(h.push).toHaveBeenCalledWith(expect.stringContaining("/company/ilan/l55"));
  });
});
