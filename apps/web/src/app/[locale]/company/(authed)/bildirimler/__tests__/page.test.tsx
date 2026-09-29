// @vitest-environment jsdom
/**
 * Derin denetim S057 — Bildirimler sayfası yalnız son 30 satırı görüyordu:
 * "Daha fazla yükle" yoktu ve "Tümünü okundu işaretle" yalnız yüklü satırlara
 * bakıyordu (en yeni 30 okunmuşken eskide okunmamış kalsa düğme gizleniyordu).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pages: [] as unknown[][],
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  unread: 0 as number | undefined,
  markAll: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/hooks/use-notifications", () => ({
  useNotificationFeed: () => ({
    data: { pages: h.pages },
    isLoading: false,
    hasNextPage: h.hasNextPage,
    fetchNextPage: h.fetchNextPage,
    isFetchingNextPage: false,
  }),
  useUnreadCount: () => ({ data: h.unread }),
  useMarkNotificationsRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: h.markAll, isPending: false }),
}));

import BildirimlerPage from "../page";

function n(id: string, readAt: string | null = "2026-09-01T00:00:00.000Z") {
  return {
    id,
    type: "x",
    portal: null,
    title: `Bildirim ${id}`,
    body: "govde",
    ctaUrl: null,
    ctaLabel: null,
    listingId: null,
    readAt,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.pages = [];
  h.hasNextPage = false;
  h.unread = 0;
});

describe("BildirimlerPage", () => {
  it("yüklü satırların hepsi okunmuşken sunucuda okunmamış varsa 'Tümünü okundu' görünür", async () => {
    h.pages = [[n("a"), n("b")]];
    h.unread = 3;
    render(<BildirimlerPage />);
    const btn = screen.getByRole("button", { name: "Tümünü okundu işaretle" });
    await userEvent.setup().click(btn);
    expect(h.markAll).toHaveBeenCalled();
  });

  it("okunmamış yoksa 'Tümünü okundu' gizli", () => {
    h.pages = [[n("a")]];
    render(<BildirimlerPage />);
    expect(screen.queryByRole("button", { name: "Tümünü okundu işaretle" })).toBeNull();
  });

  it("sonraki sayfa varsa 'Daha fazla yükle' imleçli çekimi tetikler; sayfalar birleşir", async () => {
    h.pages = [[n("a")], [n("b")]];
    h.hasNextPage = true;
    render(<BildirimlerPage />);
    expect(screen.getByText("Bildirim a")).toBeInTheDocument();
    expect(screen.getByText("Bildirim b")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Daha fazla yükle" }));
    expect(h.fetchNextPage).toHaveBeenCalled();
  });

  it("son sayfadaysa 'Daha fazla yükle' yok", () => {
    h.pages = [[n("a")]];
    render(<BildirimlerPage />);
    expect(screen.queryByRole("button", { name: "Daha fazla yükle" })).toBeNull();
  });
});
