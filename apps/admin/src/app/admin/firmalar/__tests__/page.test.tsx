// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  companies: { data: undefined as unknown, isLoading: false, isError: false },
  stats: { data: undefined as unknown, isLoading: false },
  actMutate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  replace: vi.fn(),
  // Rol-tabanlı buton kapısı (canAdminDo): askı işlemleri yalnız SUPER_ADMIN'e görünür.
  admin: { role: "SUPER_ADMIN" } as { role: string } | null,
  apiGet: vi.fn(),
  toastApiError: vi.fn(),
  downloadCsv: vi.fn(),
  search: "",
  companiesParams: [] as unknown[],
}));

vi.mock("@/lib/api", () => ({
  api: { get: h.apiGet },
  toastApiError: h.toastApiError,
}));
vi.mock("@/lib/csv", () => ({ downloadCsv: h.downloadCsv }));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  usePathname: () => "/admin/firmalar",
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/hooks/use-admin-companies", () => ({
  useAdminCompanies: (p: unknown) => {
    h.companiesParams.push(p);
    return h.companies;
  },
  useAdminCompanyStats: () => h.stats,
  useCompanyAction: () => ({ mutate: h.actMutate, isPending: false }),
}));

import AdminFirmalarPage from "../page";

/** Ücretsiz dönem: panelde üyelik kademesi adı ya da üyelik ücreti dili basılmaz. */
const PLAN_WORDS = /\b(gold|silver|standart|premium|paket)/i;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    rothernId: "SK-001",
    name: "Acme A.Ş.",
    taxNumber: "1234567890",
    country: "TR",
    stateRegion: null,
    city: "İstanbul",
    tier: "STANDART",
    membershipEndAt: null,
    verification: "PENDING",
    isBlocked: false,
    complaintCount: 0,
    userCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function paged(items: unknown[]) {
  return { items, total: items.length, page: 1, pageSize: 25 };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.admin = { role: "SUPER_ADMIN" };
  h.companies = { data: paged([row()]), isLoading: false, isError: false };
  h.stats = {
    data: {
      countryBreakdown: [{ country: "TR", count: 1 }],
    },
    isLoading: false,
  };
});

describe("FirmalarView — durum tablosu", () => {
  it("isError → 'Veri alınamadı' gösterir", () => {
    h.companies = { data: undefined, isLoading: false, isError: true };
    render(<AdminFirmalarPage />);
    expect(screen.getByText(/Veri alınamadı/)).toBeInTheDocument();
  });

  it("isLoading → 'Yükleniyor...' gösterir", () => {
    h.companies = { data: undefined, isLoading: true, isError: false };
    render(<AdminFirmalarPage />);
    expect(screen.getByText("Yükleniyor...")).toBeInTheDocument();
  });

  it("boş veri → 'Firma bulunamadı' gösterir", () => {
    h.companies = { data: paged([]), isLoading: false, isError: false };
    render(<AdminFirmalarPage />);
    expect(screen.getByText("Firma bulunamadı")).toBeInTheDocument();
  });

  it("satır render eder — ülke ve doğrulama durumu; üyelik adı ve bitişi YOK (ücretsiz dönem)", () => {
    const end = new Date("2026-06-01T00:00:00Z").toISOString();
    h.companies = {
      data: paged([row({ tier: "GOLD", membershipEndAt: end, verification: "VERIFIED" })]),
      isLoading: false,
      isError: false,
    };
    render(<AdminFirmalarPage />);
    expect(screen.getByText("Acme A.Ş.")).toBeInTheDocument();
    // Ülke hücresi: yalnız bayrak (kod metni yok) — erişilebilir ad = ülke adı
    const flag = screen.getByRole("img", { name: "Türkiye" });
    expect(flag).toHaveAttribute("src", "/flags/4x3/tr.svg");
    const tr = screen.getByRole("link", { name: "Acme A.Ş." }).closest("tr")!;
    expect(within(tr).getByText("Doğrulandı")).toBeInTheDocument();
    expect(screen.queryByText(/1 Haz 26/)).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Üyelik" })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(PLAN_WORDS);
  });

  it("İncele → firma detay sayfasına link verir", () => {
    render(<AdminFirmalarPage />);
    const link = screen.getByRole("link", { name: "İncele" });
    expect(link).toHaveAttribute("href", "/admin/firmalar/c1");
  });

  it("sayfalama toplam kayıt bilgisini gösterir", () => {
    render(<AdminFirmalarPage />);
    expect(screen.getByText(/1 kayıt içinden 1-1 arası/)).toBeInTheDocument();
  });
});

describe("FirmalarView — ücretsiz dönem: üyelik yönetimi yok", () => {
  it("satır menüsünde yalnız askı işlemi var; üyelik tanımlama/kaldırma yok", async () => {
    const end = new Date(Date.now() + 365 * 86_400_000).toISOString();
    h.companies = {
      data: paged([row({ tier: "GOLD", membershipEndAt: end })]),
      isLoading: false,
      isError: false,
    };
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "Acme A.Ş. işlemleri" }));
    const items = (await screen.findAllByRole("menuitem")).map((m) => m.textContent);
    expect(items).toEqual(["Askıya Al"]);
  });

  it("üyelik ve üyelik bitişi süzgeçleri yok; eski ?tier= / ?expiring= adresi sorguya geçmez", () => {
    h.search = "tier=GOLD&expiring=30";
    h.companiesParams = [];
    render(<AdminFirmalarPage />);
    const last = h.companiesParams.at(-1) as Record<string, unknown>;
    expect(last).not.toHaveProperty("tier");
    expect(last).not.toHaveProperty("expiring");
    expect(screen.queryByLabelText("Üyelik")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Üyelik bitişi")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(PLAN_WORDS);
    h.search = "";
  });
});

describe("FirmalarView — KVKK ile anonimleştirilmiş firma (D-208)", () => {
  it("satırda askı menüsü yok", () => {
    h.companies = {
      data: paged([row({ isBlocked: true, anonymized: true })]),
      isLoading: false,
      isError: false,
    };
    render(<AdminFirmalarPage />);
    expect(
      screen.queryByRole("button", { name: "Acme A.Ş. işlemleri" }),
    ).not.toBeInTheDocument();
  });

  it("satır detayla aynı dili konuşur: KVKK rozeti var, 'Askıda' ve 'Doğrulandı' yok (yeniden doğrulama webC-11)", () => {
    h.companies = {
      data: paged([
        row({ isBlocked: true, anonymized: true, verification: "VERIFIED" }),
      ]),
      isLoading: false,
      isError: false,
    };
    render(<AdminFirmalarPage />);
    const tr = screen.getByRole("link", { name: "Acme A.Ş." }).closest("tr")!;
    expect(within(tr).getByText("KVKK ile anonimleştirildi")).toBeInTheDocument();
    expect(within(tr).queryByText("Askıda")).not.toBeInTheDocument();
    expect(within(tr).queryByText("Doğrulandı")).not.toBeInTheDocument();
  });

  it("anonimleştirilmemiş askıdaki doğrulanmış firma rozetlerini korur", () => {
    h.companies = {
      data: paged([row({ isBlocked: true, anonymized: false, verification: "VERIFIED" })]),
      isLoading: false,
      isError: false,
    };
    render(<AdminFirmalarPage />);
    const tr = screen.getByRole("link", { name: "Acme A.Ş." }).closest("tr")!;
    expect(within(tr).getByText("Askıda")).toBeInTheDocument();
    expect(within(tr).getByText("Doğrulandı")).toBeInTheDocument();
    expect(within(tr).queryByText("KVKK ile anonimleştirildi")).not.toBeInTheDocument();
  });
});

describe("FirmalarView — rol kapısı (canAdminDo)", () => {
  it("SALES: askı işlemleri menüsü GÖRÜNMEZ (yalnız SUPER_ADMIN)", () => {
    h.admin = { role: "SALES" };
    render(<AdminFirmalarPage />);
    expect(
      screen.queryByRole("button", { name: "Acme A.Ş. işlemleri" }),
    ).not.toBeInTheDocument();
  });

  it("SUPER_ADMIN: askı işlemleri menüsü görünür", () => {
    h.admin = { role: "SUPER_ADMIN" };
    render(<AdminFirmalarPage />);
    expect(
      screen.getByRole("button", { name: "Acme A.Ş. işlemleri" }),
    ).toBeInTheDocument();
  });
});

describe("FirmalarView — askıya alma", () => {
  it("Askıya Al → PromptDialog 'Firmayı Askıya Al' açılır", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(
      screen.getByRole("button", { name: "Acme A.Ş. işlemleri" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Askıya Al" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Firmayı Askıya Al")).toBeInTheDocument();
  });

  it("sebep girilip onaylanınca suspend action'ı reason ile mutate", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(
      screen.getByRole("button", { name: "Acme A.Ş. işlemleri" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Askıya Al" }),
    );
    const dialog = await screen.findByRole("dialog");
    const input = screen.getByLabelText(/Askı sebebi/);
    await user.type(input, "tekrarlı şikayet");
    await user.click(within(dialog).getByRole("button", { name: "Askıya Al" }));
    expect(h.actMutate).toHaveBeenCalledWith(
      { id: "c1", action: "suspend", reason: "tekrarlı şikayet" },
      expect.anything(),
    );
  });
});

describe("FirmalarView — ülke filtresi (derin denetim LU-11)", () => {
  it("ülke seçenekleri ilk 10 ile sınırlı değil: countryOptions'taki tüm ülkeler listelenir", () => {
    const top10 = ["TR", "DE", "FR", "IT", "ES", "NL", "PL", "GB", "US", "AZ"].map(
      (country, i) => ({ country, count: 20 - i }),
    );
    h.stats = {
      data: {
        countryBreakdown: top10,
        countryOptions: [...top10, { country: "GE", count: 2 }, { country: "KZ", count: 1 }],
      },
      isLoading: false,
    };
    render(<AdminFirmalarPage />);
    const select = screen.getByRole("combobox", { name: "Ülke" });
    const values = within(select)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toContain("KZ");
    expect(values).toHaveLength(13); // "Tüm ülkeler" + 12
  });
});

describe("CSV dışa aktarımı (derin denetim LU-12)", () => {
  it("istek sürerken düğme kilitli; hata yakalanır ve toast'lanır, dosya inmez", async () => {
    const user = userEvent.setup();
    let reject!: (e: unknown) => void;
    h.apiGet.mockReturnValueOnce(
      new Promise((_res, rej) => {
        reject = rej;
      }),
    );
    render(<AdminFirmalarPage />);
    const btn = screen.getByRole("button", { name: /CSV/ });
    await user.click(btn);
    expect(btn).toBeDisabled();
    await user.click(btn); // kilitliyken ikinci dizi başlamaz
    expect(h.apiGet).toHaveBeenCalledTimes(1);
    reject(new Error("502"));
    await vi.waitFor(() => expect(h.toastApiError).toHaveBeenCalled());
    expect(h.downloadCsv).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("başarıda dosya iner ve sayı toast'ı basılır; başlıkta üyelik sütunu yok", async () => {
    const user = userEvent.setup();
    h.apiGet.mockResolvedValueOnce({
      data: { items: [row({ tier: "GOLD", verification: "VERIFIED" })], total: 1 },
    });
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: /CSV/ }));
    await vi.waitFor(() => expect(h.downloadCsv).toHaveBeenCalledTimes(1));
    expect(h.toast.success).toHaveBeenCalledWith("1 firma CSV'ye aktarıldı");
    const [, header, rows] = h.downloadCsv.mock.calls[0] as [string, string[], unknown[][]];
    expect(header).toContain("Doğrulama");
    expect(header.join(" ")).not.toMatch(/Üyelik/);
    expect(rows[0]).toContain("Doğrulandı");
    expect(JSON.stringify(rows)).not.toMatch(PLAN_WORDS);
  });
});
