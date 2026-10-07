// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: {
    user: { roles: [] as string[] } as { roles: string[] } | null,
    company: { tier: "STANDART" } as { tier?: string } | undefined,
  },
  canAct: false,
  pathname: "/company/satinalma",
  replace: vi.fn(),
  setLastPortal: vi.fn(),
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => h.auth,
  useHasCompanyPermission: () => h.canAct,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
  usePathname: () => h.pathname,
}));
vi.mock("@/lib/company/portal-store", () => ({
  usePortalStore: (sel: (s: { setLastPortal: typeof h.setLastPortal }) => unknown) =>
    sel({ setLastPortal: h.setLastPortal }),
}));

import { PortalGuard } from "../portal-guard";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

beforeEach(() => {
  vi.clearAllMocks();
  h.canAct = false;
  h.pathname = "/company/satinalma";
});

describe("PortalGuard", () => {
  it("rol + tier uygun → içerik render, son portal kaydedilir", () => {
    h.auth.user = { roles: ["YONETICI"] };
    h.auth.company = { tier: "GOLD" };
    render(
      <PortalGuard portal="satis">
        <div data-testid="child">SATIŞ</div>
      </PortalGuard>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(h.setLastPortal).toHaveBeenCalledWith("satis");
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("satınalma rolü var ama efektif kademe yetmiyor → doğrulama kapısı (yönlendirme yok)", () => {
    h.auth.user = { roles: ["YONETICI"] };
    h.auth.company = { tier: "STANDART" };
    render(
      <PortalGuard portal="satinalma">
        <div data-testid="child">SATINALMA</div>
      </PortalGuard>,
    );
    expect(screen.getByTestId("verification-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("sadece Satışçı → Satınalma'da 'yetkiniz yok' ekranı (yönlendirme YOK)", () => {
    h.auth.user = { roles: ["SATISCI"] };
    h.auth.company = { tier: "GOLD" };
    render(
      <PortalGuard portal="satinalma">
        <div data-testid="child">SATINALMA</div>
      </PortalGuard>,
    );
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    expect(screen.getByText(/erişim yetkiniz yok/i)).toBeInTheDocument();
    expect(screen.getByText(/Satın Almacı/)).toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("sadece Satın Almacı → Satış'ta 'yetkiniz yok' ekranı", () => {
    h.auth.user = { roles: ["SATIN_ALMACI"] };
    h.auth.company = { tier: "GOLD" };
    render(
      <PortalGuard portal="satis">
        <div data-testid="child">SATIŞ</div>
      </PortalGuard>,
    );
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    expect(screen.getByText(/erişim yetkiniz yok/i)).toBeInTheDocument();
    expect(screen.getByText(/Satışçı/)).toBeInTheDocument();
  });
});

describe("PortalGuard — onaylayıcı-only (minimal kabuk)", () => {
  it("ONAYLAYICI-only: denied ekranı + panel-dönüş linki YOK + Onaylar'a Git VAR", () => {
    h.auth.user = { roles: ["ONAYLAYICI"] };
    h.auth.company = { tier: "GOLD" };
    h.canAct = true;
    render(
      <PortalGuard portal="satis">
        <div data-testid="child">SATIŞ</div>
      </PortalGuard>,
    );
    expect(screen.getByText(/erişim yetkiniz yok/)).toBeInTheDocument();
    expect(screen.queryByText(/paneline dön/)).not.toBeInTheDocument();
    expect(screen.getByText(/Onaylar'a Git/)).toBeInTheDocument();
  });

  it("rolsüz üye: denied ekranı + yalnız Ayarlar linki (Onaylar yok)", () => {
    h.auth.user = { roles: [] };
    h.auth.company = { tier: "GOLD" };
    h.canAct = false;
    render(
      <PortalGuard portal="satinalma">
        <div data-testid="child">X</div>
      </PortalGuard>,
    );
    expect(screen.getByText(/erişim yetkiniz yok/)).toBeInTheDocument();
    expect(screen.queryByText(/Onaylar'a Git/)).not.toBeInTheDocument();
    expect(screen.getByText("Ayarlar")).toBeInTheDocument();
  });
});

describe("PortalGuard — satınalma erişimi olmayan firma (T-06, O-008) ve eski adres (D-264)", () => {
  it("STANDART + buy:view: Taleplerim listesi doğrulama bandıyla AÇILIR (paket adı yok)", () => {
    h.auth.user = { roles: ["YONETICI"] };
    h.auth.company = { tier: "STANDART" };
    h.pathname = "/company/satinalma/taleplerim";
    render(
      <PortalGuard portal="satinalma">
        <div data-testid="child">LISTE</div>
      </PortalGuard>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("verification-gate")).not.toBeInTheDocument();
    expect(screen.getByText("Satınalma paneli firma doğrulamasıyla açılır")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Firmanızı doğrulayın" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    expect(screen.getByRole("status").textContent).not.toMatch(/gold|silver|paket/i);
    // Açık portal sayılmaz — son portal kaydı yapılmaz.
    expect(h.setLastPortal).not.toHaveBeenCalled();
  });

  it("bant telefonda dikey: düğme metnin altına iner, sm'de yan yana (webC-2)", () => {
    h.auth.user = { roles: ["YONETICI"] };
    h.auth.company = { tier: "SILVER" };
    h.pathname = "/company/satinalma/taleplerim";
    render(
      <PortalGuard portal="satinalma">
        <div data-testid="child">LISTE</div>
      </PortalGuard>,
    );
    const banner = screen.getByRole("status");
    expect(banner).toHaveClass("flex-col", "sm:flex-row");
    // Düğme metin sütununun KARDEŞİ (aynı satırı paylaşan esnek öğe değil).
    const link = screen.getByRole("link", { name: "Firmanızı doğrulayın" });
    expect(link.closest("div.shrink-0")?.parentElement).toBe(banner);
    expect(
      screen.getByText("Satınalma paneli firma doğrulamasıyla açılır").closest("div")?.parentElement?.parentElement,
    ).toBe(banner);
  });

  it.each([
    ["PENDING", "Doğrulama durumunu gör", /Doğrulamanız inceleniyor/],
    ["REJECTED", "Yeniden başvurun", /yeniden başvurun/],
  ])("bant doğrulama durumunu ayrı metinle söyler: %s", (status, cta, note) => {
    h.auth.user = { roles: ["YONETICI"] };
    h.auth.company = { tier: "STANDART" };
    h.pathname = "/company/satinalma/taleplerim";
    useCompanyAuthStore.setState({ company: { companyVerificationStatus: status } as never } as never);
    try {
      render(
        <PortalGuard portal="satinalma">
          <div data-testid="child">LISTE</div>
        </PortalGuard>,
      );
      expect(screen.getByRole("link", { name: cta })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
      expect(screen.getByRole("status")).toHaveTextContent(note);
    } finally {
      useCompanyAuthStore.setState({ company: null } as never);
    }
  });

  it("SILVER + buy:view: Siparişlerim de açık", () => {
    h.auth.user = { roles: ["YONETICI"] };
    h.auth.company = { tier: "SILVER" };
    h.pathname = "/company/satinalma/siparisler";
    render(
      <PortalGuard portal="satinalma">
        <div data-testid="child">SIPARIS</div>
      </PortalGuard>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("yeni talep formu ve pano doğrulama kapısında kalır; kapı ekranı mevcut listelere bağlantı verir", () => {
    h.auth.user = { roles: ["YONETICI"] };
    h.auth.company = { tier: "STANDART" };
    for (const path of ["/company/satinalma/taleplerim/yeni", "/company/satinalma"]) {
      h.pathname = path;
      const { unmount } = render(
        <PortalGuard portal="satinalma">
          <div data-testid="child">X</div>
        </PortalGuard>,
      );
      expect(screen.getByTestId("verification-gate")).toBeInTheDocument();
      expect(screen.queryByTestId("child")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Taleplerim" })).toHaveAttribute("href", "/company/satinalma/taleplerim");
      expect(screen.getByRole("link", { name: "Siparişlerim" })).toHaveAttribute("href", "/company/satinalma/siparisler");
      unmount();
    }
  });

  it("satınalma izni olmayan kullanıcıya liste açılmaz (rol kontrolü erişim kademesine bağlı değil)", () => {
    h.auth.user = { roles: ["SATISCI"] };
    h.auth.company = { tier: "STANDART" };
    h.pathname = "/company/satinalma/taleplerim";
    render(
      <PortalGuard portal="satinalma">
        <div data-testid="child">X</div>
      </PortalGuard>,
    );
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    expect(screen.getByText(/erişim yetkiniz yok/)).toBeInTheDocument();
  });

  it("eski /satinalma/mesajlar yönlendiricisi doğrulama kapısına takılmaz", () => {
    h.auth.user = { roles: ["SATISCI"] };
    h.auth.company = { tier: "SILVER" };
    h.pathname = "/company/satinalma/mesajlar";
    render(
      <PortalGuard portal="satinalma">
        <div data-testid="child">REDIRECT</div>
      </PortalGuard>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("verification-gate")).not.toBeInTheDocument();
  });
});
