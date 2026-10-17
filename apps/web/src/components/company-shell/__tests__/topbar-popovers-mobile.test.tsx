// @vitest-environment jsdom
/**
 * MOBİL DENETİM 2026-10 (g04) — üst çubuk açılır panelleri (zil, mesajlar):
 *  · panel ekranın içinde kalır: boşluk ve ekran payı Headless'ın konum
 *    hesabında (`POPOVER_ANCHOR`; eski `mt-2` hesabın dışındaydı → panel
 *    ekranın altından taşıyor, sol kenara yapışıyordu); 30rem tavanı
 *    `--anchor-max-height` değişkeniyle (sınıf satır içi stile eziliyordu);
 *    telefonda ekran eni − 2×8 px.
 *  · zilde "Tümünü okundu işaretle" ve "Tüm bildirimleri gör" 44 px dokunma
 *    alanı (15-16 px idi).
 *  · mesaj satırında adın yanında yalnız tarih: rol rozeti önizleme
 *    satırında, ad iki satıra sarar (RU'da iki firma 'QA Ted…' oluyordu).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn<(url: string) => Promise<{ data: unknown }>>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satinalma",
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get, post: vi.fn(), patch: vi.fn() } }));

import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { MessagesPopover } from "../messages-popover";
import { NotificationBell } from "../notification-bell";
import { POPOVER_ANCHOR, POPOVER_MAX_HEIGHT_CLASS } from "../popover-anchor";

const NOTIF = {
  id: "n1",
  type: "bid_received",
  portal: "satinalma",
  title: "Teklif geçerlilikleri dolmak üzere",
  body: "gövde",
  ctaUrl: null,
  ctaLabel: null,
  listingId: null,
  readAt: null,
  createdAt: new Date().toISOString(),
};
const THREAD = {
  portal: "satinalma",
  threadId: "t1",
  otherPartyId: "c2",
  otherPartyName: "UI S1 Deneme Makina Ltd. Şti.",
  lastMessagePreview: "Merhaba, teklifinizi aldık",
  lastMessageAt: new Date().toISOString(),
  unread: true,
};

let client: QueryClient;
const mount = (ui: ReactElement) => render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

beforeEach(() => {
  h.get.mockReset();
  h.get.mockImplementation(async (url: string) => {
    if (url.includes("unread-count")) return { data: { count: 1 } };
    if (url === "/notifications") return { data: [NOTIF] };
    if (url === "/company/messages/threads") return { data: [THREAD] };
    return { data: [] };
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useCompanyAuthStore.setState({
    user: { id: "u1", isOwner: true, roles: ["SAHIP"], permissions: ["buy:view", "sell:view"] },
    company: { id: "co1", name: "Demo A.Ş.", tier: "GOLD", country: "TR" },
    permissionsSynced: true,
  } as never);
});
afterEach(() => client.clear());

/** Açık PopoverPanel kökü (Headless kimliği; çapalı panel portalda çizilir). */
function openPanel(): HTMLElement {
  const panel = document.querySelector<HTMLElement>('[id^="headlessui-popover-panel"]');
  if (!panel) throw new Error("panel bulunamadı");
  return panel;
}

describe("Üst çubuk panelleri — konum (g04 popover-edge)", () => {
  it("boşluk ve ekran payı konum hesabında: 12 px boşluk, 8 px kenar payı", () => {
    expect(POPOVER_ANCHOR).toEqual({ to: "bottom end", gap: 12, padding: 8 });
  });

  it.each([
    ["Zil", () => <NotificationBell />, /Bildirimler/],
    ["Mesajlar", () => <MessagesPopover />, /Mesajlar/],
  ])("%s paneli: telefonda ekran eni − 1rem, sm'de 22rem; tavan değişkenle; mt-2 yok", async (_n, ui, button) => {
    mount(ui());
    await userEvent.setup().click(screen.getByRole("button", { name: button }));
    const panel = openPanel();
    expect(panel).toHaveClass("w-[calc(100vw-1rem)]", "sm:w-[22rem]", POPOVER_MAX_HEIGHT_CLASS);
    expect(panel.className).not.toMatch(/(^|\s)mt-2(\s|$)/);
    // Satır içi `max-height` sınıfı ezer — tavan yalnız değişkenle işler.
    expect(panel.className).not.toMatch(/max-h-\[min/);
  });
});

describe("Üst çubuk panelleri — ana ekran çizgisi payı (doğrulama safe-area-shell#new1)", () => {
  it("tavan 30rem'i korur, alçak ekranda üst çubuk + alt güvenli alan payı düşülür", () => {
    // Yatay telefon (844×390, alt pay 21 px): Headless'ın tek sayılık
    // `padding`i alt payı bilmiyor; panel ana ekran çizgisi bandına giriyordu.
    expect(POPOVER_MAX_HEIGHT_CLASS).toBe(
      "[--anchor-max-height:min(30rem,calc(100dvh-var(--topbar-h)-var(--safe-bottom)-1rem))]",
    );
  });
});

describe("Zil — dokunma alanları (g04 bell-popover-small-links)", () => {
  it("'Tümünü okundu işaretle' 44 px, başlık yüksekliği negatif payla korunur", async () => {
    mount(<NotificationBell />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Bildirimler/ }));
    const markAll = await screen.findByRole("button", { name: "Tümünü okundu işaretle" });
    expect(markAll).toHaveClass("min-h-11", "-my-3", "-mx-2", "px-2");
  });

  it("'Tüm bildirimleri gör' satırın tamamı: telefonda 44 px, sm'de eski 40 px satır", async () => {
    mount(<NotificationBell />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Bildirimler/ }));
    const link = screen.getByRole("link", { name: "Tüm bildirimleri gör" });
    expect(link).toHaveClass("flex", "min-h-11", "sm:min-h-10");
    // Yalnız py-2 verilse satır 32 px'e inerdi (eski satır kutusu 24 px idi).
    expect(link.className).not.toMatch(/sm:min-h-0|sm:py-2/);
  });
});

describe("Mesajlar paneli — satır düzeni (g04 inbox-names-truncated)", () => {
  it("adın yanında yalnız tarih; rol rozeti önizleme satırında; ad iki satıra sarar", async () => {
    mount(<MessagesPopover />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Mesajlar/ }));
    const name = await screen.findByText(THREAD.otherPartyName);
    expect(name).toHaveClass("line-clamp-2");
    expect(name).not.toHaveClass("truncate");
    expect(name).toHaveAttribute("title", THREAD.otherPartyName);

    const chip = screen.getByText("Alıcısınız");
    const preview = screen.getByText(THREAD.lastMessagePreview);
    // Rozet önizlemeyle aynı satırda, adın satırında değil.
    expect(chip.parentElement).toBe(preview.parentElement);
    expect(name.parentElement).not.toContainElement(chip);
  });

  it("'Tüm mesajları gör' satırın tamamı: her genişlikte 44 px (eski satır yüksekliği)", async () => {
    mount(<MessagesPopover />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Mesajlar/ }));
    const link = screen.getByRole("link", { name: /Tüm mesajları gör/ });
    expect(link).toHaveClass("flex", "min-h-11");
    expect(link.className).not.toMatch(/sm:min-h-0|sm:py-/);
  });
});
