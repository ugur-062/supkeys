// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Giriş sayfası kabuğu (arayüz testi 2026-10 login-1/8/11/12, code-auth-8):
 * oturum durumu bilinene dek form çizilmez, girişli ziyaretçi formu hiç
 * görmez, kod adımlarında dil seçici gizlenir, `next` yalnız panel içi yol.
 * Oturum yoklaması süresiz beklenmez (web-auth-4); giriş sayfasının kendisi
 * dönüş hedefi olamaz (web-auth-5).
 */
const h = vi.hoisted(() => ({
  state: { user: null as { id: string } | null, isHydrated: true },
  probe: "none" as "pending" | "found" | "none",
  search: "",
  replace: vi.fn(),
  step: null as null | ((s: "login" | "twoFactor" | "verify") => void),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/login",
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) => sel(h.state),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanySessionProbe: () => h.probe,
}));
vi.mock("../login-form", () => ({
  CompanyLoginForm: ({
    nextPath,
    onStepChange,
  }: {
    nextPath: string;
    onStepChange?: (s: "login" | "twoFactor" | "verify") => void;
  }) => {
    h.step = onStepChange ?? null;
    return <div data-testid="login-form" data-next={nextPath} />;
  },
}));

import { CompanyLoginClient, SESSION_PROBE_WAIT_MS } from "../login-page-client";

beforeEach(() => {
  vi.clearAllMocks();
  h.state = { user: null, isHydrated: true };
  h.probe = "none";
  h.search = "";
  h.step = null;
});

describe("CompanyLoginClient — oturum durumu bilinene dek form yok", () => {
  it("depo yüklenmeden: yükleme durumu, form yok", () => {
    h.state = { user: null, isHydrated: false };
    render(<CompanyLoginClient />);
    expect(screen.getByRole("status")).toHaveTextContent("Oturumunuz denetleniyor…");
    expect(screen.queryByTestId("login-form")).toBeNull();
  });

  it("`/me` yoklanırken ('hatırla' kapalı, yeni sekme): yükleme durumu, form yok, yönlendirme yok", () => {
    h.probe = "pending";
    render(<CompanyLoginClient />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("login-form")).toBeNull();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("girişli ziyaretçi formu GÖRMEZ: yükleme durumu + `next`e yönlendirme", () => {
    h.state = { user: { id: "u1" }, isHydrated: true };
    h.probe = "found";
    h.search = "next=%2Fcompany%2Fsatinalma%2Ftaleplerim";
    render(<CompanyLoginClient />);
    expect(screen.queryByTestId("login-form")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(h.replace).toHaveBeenCalledWith("/company/satinalma/taleplerim");
  });

  it("oturum yok kesinleşince form bağlanır", () => {
    render(<CompanyLoginClient />);
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

// Kayıt denetimi 2026-10 web-auth-4: `/me` yanıtsız kaldıkça (istek zaman
// aşımı 45 sn) sayfada e-posta ve şifre alanı yoktu.
describe("CompanyLoginClient — oturum yoklaması süresiz beklenmez (web-auth-4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("süre 4 sn (şifre sıfırlama sayfasındaki bağlantı denetimiyle aynı)", () => {
    expect(SESSION_PROBE_WAIT_MS).toBe(4000);
  });

  it("`/me` yanıtsız kalırsa süre dolunca form açılır; yönlendirme yok", () => {
    h.probe = "pending";
    render(<CompanyLoginClient />);
    act(() => {
      vi.advanceTimersByTime(SESSION_PROBE_WAIT_MS - 1);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("login-form")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("süre dolduktan SONRA gelen 'oturum var': form kalkar, `next`e yönlenir", () => {
    h.probe = "pending";
    h.search = "next=%2Fcompany%2Filan%2Fabc";
    const view = render(<CompanyLoginClient />);
    act(() => {
      vi.advanceTimersByTime(SESSION_PROBE_WAIT_MS);
    });
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
    // Geç gelen yanıt depoyu doldurur.
    h.state = { user: { id: "u1" }, isHydrated: true };
    h.probe = "found";
    view.rerender(<CompanyLoginClient />);
    expect(screen.queryByTestId("login-form")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(h.replace).toHaveBeenCalledWith("/company/ilan/abc");
  });

  it("yanıt süre dolmadan gelirse ('oturum yok') form o an açılır", () => {
    h.probe = "pending";
    const view = render(<CompanyLoginClient />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId("login-form")).toBeNull();
    h.probe = "none";
    view.rerender(<CompanyLoginClient />);
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
  });

  it("süre yoklama başlayınca işler: depo yüklenirken geçen zaman sayılmaz", () => {
    h.state = { user: null, isHydrated: false };
    h.probe = "pending";
    const view = render(<CompanyLoginClient />);
    act(() => {
      vi.advanceTimersByTime(SESSION_PROBE_WAIT_MS * 2);
    });
    expect(screen.queryByTestId("login-form")).toBeNull();
    h.state = { user: null, isHydrated: true };
    view.rerender(<CompanyLoginClient />);
    act(() => {
      vi.advanceTimersByTime(SESSION_PROBE_WAIT_MS - 1);
    });
    expect(screen.queryByTestId("login-form")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
  });
});

describe("CompanyLoginClient — `next` yalnız panel içi yol (login-12)", () => {
  // Kayıt denetimi 2026-10 web-auth-5: sayfa kendi adresine yönlenince efekt
  // bir daha çalışmıyor, girişli ziyaretçi yükleme kutusunda kalıyordu.
  it("`next` giriş sayfasının kendisiyse girişli ziyaretçi panoya gider", () => {
    h.state = { user: { id: "u1" }, isHydrated: true };
    h.probe = "found";
    h.search = "next=%2Fcompany%2Flogin";
    render(<CompanyLoginClient />);
    expect(h.replace).toHaveBeenCalledWith("/company");
    expect(h.replace).not.toHaveBeenCalledWith("/company/login");
  });

  it.each([
    ["%2Fcompany%2Flogin", "/company"],
    ["%2Fcompany%2Flogin%3Fnext%3D%252Fcompany%252Flogin", "/company"],
    ["%2Fcompany%2F..%2Furunler", "/company"],
    ["%2Fcompany%2F%252e%252e%2Furunler", "/company"],
    ["https%3A%2F%2Fevil.example", "/company"],
    ["%2F%2Fevil.example", "/company"],
    ["%2Fcompanyfoo", "/company"],
    ["%2Fcompany%2Filan%2Fabc%3Ftab%3D1", "/company/ilan/abc?tab=1"],
  ])("next=%s → %s", (raw, expected) => {
    h.search = `next=${raw}`;
    render(<CompanyLoginClient />);
    expect(screen.getByTestId("login-form")).toHaveAttribute("data-next", expected);
  });
});

describe("CompanyLoginClient — kod adımında dil seçici yok (login-8)", () => {
  it("giriş adımında var; e-posta doğrulama ve 2FA adımında gizli", () => {
    render(<CompanyLoginClient />);
    expect(screen.getByRole("button", { name: "Dil" })).toBeInTheDocument();
    act(() => h.step?.("verify"));
    expect(screen.queryByRole("button", { name: "Dil" })).toBeNull();
    act(() => h.step?.("twoFactor"));
    expect(screen.queryByRole("button", { name: "Dil" })).toBeNull();
    act(() => h.step?.("login"));
    expect(screen.getByRole("button", { name: "Dil" })).toBeInTheDocument();
  });
});

describe("CompanyLoginClient — kayıt bağlantısı dönüş hedefini taşır (code-auth-8)", () => {
  it("`next` → `redirect`; `ref` ve `intent` aynen", () => {
    h.search = "next=%2Fcompany%2Filan%2Fl1&ref=tok123&intent=teklif";
    render(<CompanyLoginClient />);
    expect(screen.getByRole("link", { name: "Firma olarak kayıt ol" })).toHaveAttribute(
      "href",
      "/company/kayit?intent=teklif&redirect=%2Fcompany%2Filan%2Fl1&ref=tok123",
    );
  });

  it("parametre yokken düz kayıt adresi; site dışı `next` taşınmaz", () => {
    const first = render(<CompanyLoginClient />);
    expect(screen.getByRole("link", { name: "Firma olarak kayıt ol" })).toHaveAttribute("href", "/company/kayit");
    first.unmount();
    h.search = "next=%2F%2Fevil.example";
    render(<CompanyLoginClient />);
    expect(screen.getByRole("link", { name: "Firma olarak kayıt ol" })).toHaveAttribute("href", "/company/kayit");
  });
});
