// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { markNavEntry, noteNavigation, resetNavHistoryForTest } from "@/lib/nav-history";

const h = vi.hoisted(() => ({
  profile: null as unknown,
  profileError: null as unknown,
  refetch: vi.fn(),
  portal: "satinalma" as "satinalma" | "satis",
  replace: vi.fn(),
  block: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "RTH-OTHER" }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), replace: h.replace, back: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-active-portal", () => ({ useActivePortal: () => h.portal }));
vi.mock("@/hooks/use-company-directory", () => ({
  useCompanyProfile: () => ({
    data: h.profile,
    isLoading: false,
    isError: h.profileError != null,
    error: h.profileError,
    refetch: h.refetch,
  }),
}));
vi.mock("@/hooks/use-company-connections", () => ({
  useInviteConnection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBlockCompany: () => ({ mutateAsync: h.block, isPending: false }),
  useDisconnect: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-complaints", () => ({
  useFileComplaint: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/components/company/company-profile-view", () => ({
  CompanyProfileView: ({ actions, main }: { actions: ReactNode; main: ReactNode }) => (
    <div>
      {actions}
      {main}
    </div>
  ),
}));
vi.mock("@/components/marketplace/listing-card", () => ({
  ListingCard: ({ data }: { data: { title: string; action: { label: string } | null } }) => (
    <div>
      <span>{data.title}</span>
      {data.action ? <a>{data.action.label}</a> : null}
    </div>
  ),
}));
vi.mock("@/components/catalyst/dropdown", () => ({
  Dropdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownButton: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/tenders/reason-dialog", () => ({
  ReasonDialog: ({
    open,
    onSubmit,
    confirmLabel,
  }: {
    open: boolean;
    onSubmit: (r: string) => void;
    confirmLabel: string;
  }) =>
    open ? (
      <button type="button" onClick={() => onSubmit("")}>
        dialog:{confirmLabel}
      </button>
    ) : null,
}));

import CompanyProfilePage from "../page";

function profile(over: Record<string, unknown> = {}) {
  return {
    profile: { rothernId: "RTH-OTHER", name: "Örnek AŞ" },
    connectionStatus: "none",
    connectionId: null,
    connected: false,
    listings: [
      {
        id: "l1",
        number: "ROT-1",
        title: "Çelik Alımı",
        status: "OPEN",
        format: "RFQ",
        closesAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        categoryIds: [],
        itemCount: 1,
        targetCountries: [],
      },
    ],
    products: [],
    productCount: 0,
    ...over,
  };
}

function login(tier: string) {
  useCompanyAuthStore.setState({
    user: { isOwner: true, roles: ["SAHIP"], permissions: ["connections:manage", "buy:view", "sell:view"] },
    company: { tier, country: "TR" },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.portal = "satinalma";
  h.profile = profile();
  h.profileError = null;
  resetNavHistoryForTest();
  window.history.replaceState(null, "", "/company/firma/RTH-OTHER");
});

describe("Panel firma profili (derin denetim LU-20)", () => {
  it("ücretsiz firmada 'Bağlantı İsteği Gönder' yerine Paketler'e giden kilitli CTA", () => {
    login("STANDART");
    render(<CompanyProfilePage />);
    expect(screen.queryByRole("button", { name: "Bağlantı İsteği Gönder" })).not.toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Silver'a Geçin/ });
    expect(cta).toHaveAttribute("href", "/company/premium");
  });

  it("Silver firmada bağlantı düğmesi görünür", () => {
    login("SILVER");
    render(<CompanyProfilePage />);
    expect(screen.getByRole("button", { name: "Bağlantı İsteği Gönder" })).toBeInTheDocument();
  });

  it("engelleme başarılı olunca sayfadan Bağlantılar'a çıkılır", async () => {
    login("SILVER");
    h.block.mockResolvedValue({});
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    await user.click(screen.getByRole("button", { name: "Engelle" }));
    await user.click(screen.getByRole("button", { name: "dialog:Engelle" }));
    expect(h.block).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(h.replace).toHaveBeenCalledTimes(1));
  });

  it("kendi profilinde kendi açık talebinde 'Teklif ver' çıkmaz; başka firmada çıkar", () => {
    login("GOLD");
    h.portal = "satis";
    h.profile = profile({ connectionStatus: "self", connected: true });
    const { unmount } = render(<CompanyProfilePage />);
    expect(screen.getByText("Çelik Alımı")).toBeInTheDocument();
    expect(screen.queryByText("Teklif ver")).not.toBeInTheDocument();
    unmount();
    h.profile = profile();
    render(<CompanyProfilePage />);
    expect(screen.getByText("Teklif ver")).toBeInTheDocument();
  });
});

describe("Panel firma profili (arayüz testi webA-04)", () => {
  it("'Size istek gönderdi — Yanıtla' bulunulan portalın Gelen istekler görünümüne gider (D-328, D-069)", () => {
    login("GOLD");
    h.profile = profile({ connectionStatus: "incoming" });
    const { unmount } = render(<CompanyProfilePage />);
    expect(screen.getByRole("link", { name: /Yanıtla/ })).toHaveAttribute(
      "href",
      "/company/satinalma/tedarikcilerim?view=incoming",
    );
    unmount();
    h.portal = "satis";
    render(<CompanyProfilePage />);
    expect(screen.getByRole("link", { name: /Yanıtla/ })).toHaveAttribute(
      "href",
      "/company/satis/musterilerim?view=incoming",
    );
  });

  it("engelleme sonrası yönlendirme erişilebilir portaldan (satış-yalnız kullanıcı satınalma ret ekranına düşmez — D-069)", async () => {
    login("SILVER");
    h.portal = "satis";
    h.block.mockResolvedValue({});
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    await user.click(screen.getByRole("button", { name: "Engelle" }));
    await user.click(screen.getByRole("button", { name: "dialog:Engelle" }));
    await vi.waitFor(() => expect(h.replace).toHaveBeenCalledWith("/company/satis/musterilerim"));
  });

  it("menü öğeleri cümle düzeninde (D-269)", () => {
    login("SILVER");
    h.profile = profile({ connectionStatus: "active", connectionId: "k1", connected: true });
    render(<CompanyProfilePage />);
    expect(screen.getByRole("button", { name: "Bağlantıyı kaldır" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Şikayet et" })).toBeInTheDocument();
  });

  it("STANDART izleyen: gizlenen herkese açık talepler için gerçek sayılı kilit kartı; 'açık talep yok' ve 'Bağlanırsanız…' yazmaz (D-329)", () => {
    login("STANDART");
    h.portal = "satis";
    h.profile = profile({ listings: [], lockedListingCount: 3 });
    render(<CompanyProfilePage />);
    expect(screen.queryByText("Şu an açık satın alma talebi yok.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Bağlanırsanız/)).not.toBeInTheDocument();
    expect(screen.getByText("Bu firmanın açık alım talepleri var")).toBeInTheDocument();
    expect(screen.getByText("3 açık alım talebi")).toBeInTheDocument();
  });

  it("Silver izleyen bağsız: 'Bağlanırsanız…' ipucu kalır, kilit kartı yok", () => {
    login("SILVER");
    render(<CompanyProfilePage />);
    expect(screen.getByText(/Bağlanırsanız/)).toBeInTheDocument();
    expect(screen.queryByText("Bu firmanın açık alım talepleri var")).not.toBeInTheDocument();
  });

  it("geri bağlantısı: doğrudan açılışta 'Bağlantılar', uygulama içinden gelince 'Geri' (D-156)", async () => {
    login("SILVER");
    const { unmount } = render(<CompanyProfilePage />);
    expect(await screen.findByRole("link", { name: "Bağlantılar" })).toHaveAttribute(
      "href",
      "/company/satinalma/tedarikcilerim",
    );
    unmount();
    // Doğrudan açılış + dil yönlendirmesi (router.replace): adres değişir ama
    // geçmişe girdi eklenmez → "Geri" sekmeden çıkarırdı; Bağlantılar kalır.
    resetNavHistoryForTest();
    window.history.replaceState(null, "", "/en/company/companies/RTH-OTHER");
    markNavEntry();
    window.history.replaceState(null, "", "/company/firma/RTH-OTHER");
    noteNavigation();
    const second = render(<CompanyProfilePage />);
    expect(await screen.findByRole("link", { name: "Bağlantılar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Geri" })).not.toBeInTheDocument();
    second.unmount();
    // Sekme Firmalar'da açıldı, firmaya istemci tarafında gidildi (referrer değişmez).
    resetNavHistoryForTest();
    window.history.replaceState(null, "", "/company/satinalma/firmalar");
    markNavEntry();
    window.history.pushState(null, "", "/company/firma/RTH-OTHER");
    noteNavigation();
    render(<CompanyProfilePage />);
    expect(await screen.findByRole("button", { name: "Geri" })).toBeInTheDocument();
  });
});

describe("Panel firma profili — kesinti ≠ yok (arayüz testi D-070)", () => {
  it("5xx'te 'Firma profili bulunamadı' yerine hata + Tekrar dene", async () => {
    const user = userEvent.setup();
    h.profile = undefined;
    h.profileError = { response: { status: 500 } };
    render(<CompanyProfilePage />);
    expect(screen.queryByText(/Firma profili bulunamadı/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("404'te 'bulunamadı' kalır", () => {
    h.profile = undefined;
    h.profileError = { response: { status: 404 } };
    render(<CompanyProfilePage />);
    expect(screen.getByText(/Firma profili bulunamadı/)).toBeInTheDocument();
  });
});

