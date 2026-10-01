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
  isError: false,
  refetch: vi.fn(),
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
    data: h.isError ? undefined : { pages: h.pages },
    isLoading: false,
    isError: h.isError,
    refetch: h.refetch,
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
  h.isError = false;
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

  it("filtre yüklü sayfalarda eşleşme bulamazsa ama eski sayfa varsa açıklama görünür", async () => {
    h.pages = [[{ ...n("a"), portal: "satis" }]];
    h.hasNextPage = true;
    render(<BildirimlerPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Satınalma" }));
    expect(screen.queryByText("Bildirim a")).toBeNull();
    expect(
      screen.getByText(/Yüklenen bildirimler arasında bu filtreye uyan yok/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Daha fazla yükle" })).toBeInTheDocument();
  });

  it("son sayfadaysa 'Daha fazla yükle' yok", () => {
    h.pages = [[n("a")]];
    render(<BildirimlerPage />);
    expect(screen.queryByRole("button", { name: "Daha fazla yükle" })).toBeNull();
  });
});

describe("Bildirimler — kesinti (arayüz testi D-070)", () => {
  it("liste isteği düşerse 'Henüz bildiriminiz yok' yerine hata + Tekrar dene", async () => {
    const user = userEvent.setup();
    h.isError = true;
    render(<BildirimlerPage />);
    expect(screen.queryByText(/Henüz bildiriminiz yok/)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Bir şeyler ters gitti");
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });
});

