// @vitest-environment jsdom
/**
 * İş Analizi — satış paneline giden bağlantılar yalnız satış görüntüleme
 * izninde (arayüz testi webC-06, yeniden doğrulama NEW-3): sayfa yalnız
 * "Ziyaret edenler ve iş analizi" (insights:view) tikli kişiye de açık; ona
 * "Satış paneline erişim yetkiniz yok" ekranına giden bağlantı çizilmez.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InsightsResponse } from "@/hooks/use-company-views";

const h = vi.hoisted(() => ({
  user: { isOwner: false, permissions: ["insights:view"] as string[] },
}));

const data: InsightsResponse = {
  days: 30,
  generatedAt: "2026-09-30T00:00:00Z",
  series: [],
  views: {
    profile: { current: 1, previous: 0 },
    product: { current: 2, previous: 0 },
    identifiedVisitors: { current: 0, previous: 0 },
  },
  topProducts: [{ id: "p1", name: "Rulman 6204", slug: null, views: 2 }],
  viewerCities: [],
  inquiries: { received: 1, replied: 1, medianFirstReplyHours: 2, replyWindowDays: 90 },
  connections: { invitesReceived: 1, accepted: 0 },
  listingInvitations: 1,
  bids: { submitted: 1, won: 0 },
};

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ company: { name: "Satıcı AŞ", tier: "SILVER" }, user: h.user }),
}));
vi.mock("@/hooks/use-company-views", () => ({
  useInsights: () => ({ data, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { InsightsView } from "../insights-view";

const sellLinks = () =>
  Array.from(document.querySelectorAll("a"))
    .map((a) => a.getAttribute("href") ?? "")
    .filter((href) => href.includes("/company/satis"));

beforeEach(() => {
  h.user = { isOwner: false, permissions: ["insights:view"] };
});

describe("InsightsView — satış bağlantıları izne bağlı", () => {
  it("yalnız insights:view: satış paneline bağlantı YOK, Ziyaret Edenler bağlantısı VAR", () => {
    render(<InsightsView />);
    expect(sellLinks()).toEqual([]);
    expect(screen.queryByRole("link", { name: /Ürünlerim/ })).toBeNull();
    expect(document.querySelector('a[href="/company/sirketim/ziyaretciler"]')).not.toBeNull();
  });

  it("sell:view ile Ürünlerim ve satış KPI bağlantıları çizilir", () => {
    h.user = { isOwner: false, permissions: ["insights:view", "sell:view"] };
    render(<InsightsView />);
    expect(screen.getByRole("link", { name: /Ürünlerim/ })).toHaveAttribute("href", "/company/satis/urunlerim");
    expect(sellLinks()).toEqual(
      expect.arrayContaining([
        "/company/satis/bilgi-talepleri",
        "/company/satis/musterilerim",
        "/company/satis/tekliflerim",
      ]),
    );
  });
});
