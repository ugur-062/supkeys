// @vitest-environment jsdom
/**
 * ÜST ÇUBUK AÇILIR LİSTELERİ (zil, mesajlar) ve MESAJLAR GELEN KUTUSU — liste
 * durumları (canlı doğrulama 2026-10-09 taraması, LİSTE DURUMLARI).
 *
 * GERÇEK `useNotifications` / `useThreads` / `useConnections` kancaları + gerçek
 * QueryClient; yalnız `companyApi` sahte. Üçü de iskeleti `isLoading`e bağlıyordu:
 * çevrimdışı duraklayan sorguda (istek yok, hata yok, veri yok) "Henüz
 * bildiriminiz yok" / "Henüz mesajınız yok" / "önce bir firmayla bağlantı kur"
 * çiziliyordu.
 */
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn<(url: string) => Promise<{ data: unknown }>>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/mesajlar",
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get, post: vi.fn(), patch: vi.fn() } }));

import { CompanyInboxView } from "@/components/messaging/company-inbox-view";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { MessagesPopover } from "../messages-popover";
import { NotificationBell } from "../notification-bell";

const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });

let client: QueryClient;
const mount = (ui: ReactElement) => render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
const apiDown = () => h.get.mockRejectedValue(networkError);
/** Listeler boş, sayaçlar sıfır — API ayakta. */
const apiUpEmpty = () =>
  h.get.mockImplementation(async (url: string) => ({ data: url.includes("unread-count") ? { count: 0 } : [] }));

beforeEach(() => {
  h.get.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useCompanyAuthStore.setState({
    user: { id: "u1", isOwner: true, roles: ["SAHIP"], permissions: ["buy:view", "sell:view"] },
    company: { id: "co1", name: "Demo A.Ş.", tier: "GOLD", country: "TR" },
    permissionsSynced: true,
  } as never);
  window.history.replaceState(null, "", "/company/mesajlar");
});
afterEach(() => {
  onlineManager.setOnline(true);
  client.clear();
});

describe.each([
  {
    name: "Zil (NotificationBell)",
    ui: () => <NotificationBell />,
    button: "Bildirimler",
    emptyText: "Henüz bildiriminiz yok.",
    errorText: "Bildirimler yüklenemedi.",
  },
  {
    name: "Mesajlar (MessagesPopover)",
    ui: () => <MessagesPopover />,
    button: "Mesajlar",
    emptyText: "Henüz mesajınız yok.",
    errorText: "Mesajlar yüklenemedi.",
  },
])("$name — açılır liste", ({ ui, button, emptyText, errorText }) => {
  it("çevrimdışı duraklayan sorguda 'henüz yok' çizilmez", async () => {
    onlineManager.setOnline(false);
    apiDown();
    mount(ui());
    await userEvent.setup().click(screen.getByRole("button", { name: button }));
    await act(async () => {});
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.queryByText(emptyText)).toBeNull();
    expect(screen.queryByText(errorText)).toBeNull();
  });

  it("kesinti: hata + Tekrar dene; 'henüz yok' değil", async () => {
    apiDown();
    mount(ui());
    await userEvent.setup().click(screen.getByRole("button", { name: button }));
    expect(await screen.findByText(errorText)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
    expect(screen.queryByText(emptyText)).toBeNull();
  });

  it("BAŞARILI ve boş yanıt boş durumu çizer", async () => {
    apiUpEmpty();
    mount(ui());
    await userEvent.setup().click(screen.getByRole("button", { name: button }));
    expect(await screen.findByText(emptyText)).toBeInTheDocument();
  });
});

describe("Mesajlar gelen kutusu (CompanyInboxView) — konuşma listesi", () => {
  const EMPTY = "Mesajlaşmak için önce bir firmayla bağlantı kur.";

  it("çevrimdışı duraklayan sorguda 'önce bağlantı kur' çizilmez (iskelet)", async () => {
    onlineManager.setOnline(false);
    apiDown();
    const { container } = mount(<CompanyInboxView />);
    await act(async () => {});
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("konuşma yok ve bağlantı listesi OKUNAMADI: 'önce bağlantı kur' değil hata + Tekrar dene", async () => {
    h.get.mockImplementation(async (url: string) => {
      if (url.startsWith("/company/messages/threads")) return { data: [] };
      throw networkError;
    });
    mount(<CompanyInboxView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Konuşmalar yüklenemedi");
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("BAŞARILI ve boş yanıt (konuşma da bağlantı da yok) boş durumu çizer", async () => {
    apiUpEmpty();
    mount(<CompanyInboxView />);
    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
  });
});
