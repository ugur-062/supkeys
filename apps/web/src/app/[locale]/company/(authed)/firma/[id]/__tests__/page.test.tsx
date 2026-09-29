// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const h = vi.hoisted(() => ({
  profile: null as unknown,
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
  useCompanyProfile: () => ({ data: h.profile, isLoading: false }),
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
