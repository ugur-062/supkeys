// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  unread: 0,
  items: [] as unknown[],
  isLoading: false,
  markRead: vi.fn(),
  markAll: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
}));
vi.mock("@/hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: h.unread }),
  useNotifications: () => ({ data: h.items, isLoading: h.isLoading }),
  useMarkNotificationsRead: () => ({ mutate: h.markRead }),
  useMarkAllNotificationsRead: () => ({ mutate: h.markAll }),
}));

import { NotificationBell } from "../notification-bell";

beforeEach(() => {
  vi.clearAllMocks();
  h.unread = 0;
  h.items = [];
  h.isLoading = false;
});

describe("NotificationBell", () => {
  it("okunmamış yoksa rozet göstermez, aria-label sade", () => {
    render(<NotificationBell />);
    expect(
      screen.getByRole("button", { name: "Bildirimler" }),
    ).toBeInTheDocument();
  });

  it("okunmamış sayısını rozet + aria-label'da gösterir (>9 → 9+)", () => {
    h.unread = 12;
    render(<NotificationBell />);
    expect(
      screen.getByRole("button", { name: /12 okunmamış/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("açılınca bildirimleri listeler; tıklayınca okundu + yönlendirir", async () => {
    const user = userEvent.setup();
    h.unread = 1;
    h.items = [
      {
        id: "n1",
        type: "listing_category_match",
        title: "Kategorinize uygun yeni ihale",
        body: "Eşleşen ihale yayınlandı",
        ctaUrl: "https://app.local/company/satis/acik-ihaleler",
        ctaLabel: "Açık İhaleleri Gör",
        listingId: "l1",
        readAt: null,
        createdAt: new Date().toISOString(),
      },
    ];
    render(<NotificationBell />);
    await user.click(screen.getByRole("button", { name: /Bildirimler/ }));

    expect(
      await screen.findByText("Kategorinize uygun yeni ihale"),
    ).toBeInTheDocument();

    await user.click(screen.getByText("Kategorinize uygun yeni ihale"));
    expect(h.markRead).toHaveBeenCalledWith(["n1"]);
    // Mutlak URL host'u soyulur → SPA path'i push edilir.
    expect(h.push).toHaveBeenCalledWith("/company/satis/acik-ihaleler");
  });

  it("boşken 'bildiriminiz yok' mesajı", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(screen.getByRole("button", { name: /Bildirimler/ }));
    expect(await screen.findByText(/Henüz bildiriminiz yok/)).toBeInTheDocument();
  });
});
