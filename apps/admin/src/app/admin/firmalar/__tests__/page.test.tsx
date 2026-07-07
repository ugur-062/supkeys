// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  companies: { data: [] as unknown[], isLoading: false, isError: false },
  detail: null as unknown,
  actMutate: vi.fn(),
  reviewMutate: vi.fn(),
  tierMutate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-admin-companies", () => ({
  useAdminCompanies: () => h.companies,
  useCompanyAction: () => ({ mutate: h.actMutate, isPending: false }),
  useReviewDocuments: () => ({ mutate: h.reviewMutate, isPending: false }),
  useSetCompanyTier: () => ({ mutate: h.tierMutate, isPending: false }),
  useCompanyDetail: () => ({ data: h.detail, isLoading: false }),
}));

import AdminFirmalarPage from "../page";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    rothernId: "SK-001",
    name: "Acme A.Ş.",
    taxNumber: "1234567890",
    country: "TR",
    tier: "STANDARD",
    verification: "PENDING",
    isBlocked: false,
    complaintCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.companies = { data: [row()], isLoading: false, isError: false };
  h.detail = {
    id: "c1",
    rothernId: "SK-001",
    name: "Acme A.Ş.",
    legalName: "Acme Anonim Şirketi",
    taxNumber: "1234567890",
    taxOffice: "Kadıköy",
    country: "TR",
    city: "İstanbul",
    tier: "STANDARD",
    industry: null,
    website: null,
    companyVerificationStatus: "PENDING",
    companyVerifiedAt: null,
    companyRejectionReason: null,
    mersisNo: "0000000000000000",
    tradeRegistryNo: "123456",
    iban: "TR000000000000000000000000",
    ibanHolder: "Acme A.Ş.",
    docTaxPlateUrl: "https://x/tax",
    docTaxPlateStatus: "PENDING",
    docTaxPlateReason: null,
    docTradeRegistryUrl: "https://x/trade",
    docTradeRegistryStatus: "PENDING",
    docTradeRegistryReason: null,
    docSignatureCircularUrl: "https://x/sig",
    docSignatureCircularStatus: "PENDING",
    docSignatureCircularReason: null,
    docActivityCertUrl: "https://x/act",
    docActivityCertStatus: "PENDING",
    docActivityCertReason: null,
    docIdFrontUrl: "https://x/idf",
    docIdFrontStatus: "PENDING",
    docIdFrontReason: null,
    docIdBackUrl: "https://x/idb",
    docIdBackStatus: "PENDING",
    docIdBackReason: null,
    isBlocked: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    _count: { users: 1, listings: 0, complaintsReceived: 0 },
    openComplaints: 0,
  };
});

describe("FirmalarView — durum tablosu", () => {
  it("isError → 'Veri alınamadı' gösterir", () => {
    h.companies = { data: [], isLoading: false, isError: true };
    render(<AdminFirmalarPage />);
    expect(screen.getByText(/Veri alınamadı/)).toBeInTheDocument();
  });

  it("isLoading → 'Yükleniyor...' gösterir", () => {
    h.companies = { data: [], isLoading: true, isError: false };
    render(<AdminFirmalarPage />);
    expect(screen.getByText("Yükleniyor...")).toBeInTheDocument();
  });

  it("boş veri → 'Firma bulunamadı' gösterir", () => {
    h.companies = { data: [], isLoading: false, isError: false };
    render(<AdminFirmalarPage />);
    expect(screen.getByText("Firma bulunamadı")).toBeInTheDocument();
  });

  it("satır render eder", () => {
    render(<AdminFirmalarPage />);
    expect(screen.getByText("Acme A.Ş.")).toBeInTheDocument();
  });
});

describe("FirmalarView — KYC inceleme (İncele modalı)", () => {
  it("İncele → Hepsini Onayla → Kararı Kaydet → review (hepsi APPROVED) mutate", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "İncele" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Hepsini Onayla" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Kararı Kaydet" }),
    );
    expect(h.reviewMutate).toHaveBeenCalledWith(
      {
        id: "c1",
        decisions: {
          taxPlate: { status: "APPROVED" },
          tradeRegistry: { status: "APPROVED" },
          signatureCircular: { status: "APPROVED" },
          activityCert: { status: "APPROVED" },
          idFront: { status: "APPROVED" },
          idBack: { status: "APPROVED" },
        },
      },
      expect.anything(),
    );
  });

  it("İncele → bir belgeyi Reddet + gerekçe (kalanlar onaylı) → review mutate", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "İncele" }));
    const dialog = await screen.findByRole("dialog");
    // Önce hepsini onayla, sonra ilk belgeyi reddet.
    await user.click(
      within(dialog).getByRole("button", { name: "Hepsini Onayla" }),
    );
    await user.click(
      within(dialog).getAllByRole("button", { name: "Reddet" })[0],
    );
    await user.type(
      within(dialog).getByLabelText(/Vergi Levhası red gerekçesi/),
      "belge okunmuyor",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Kararı Kaydet" }),
    );
    expect(h.reviewMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "c1",
        decisions: expect.objectContaining({
          taxPlate: { status: "REJECTED", reason: "belge okunmuyor" },
          tradeRegistry: { status: "APPROVED" },
        }),
      }),
      expect.anything(),
    );
  });

  it("modal firma bilgilerini + belge durumunu gösterir", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "İncele" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("0000000000000000")).toBeInTheDocument();
    expect(within(dialog).getByText("Vergi Levhası")).toBeInTheDocument();
    // yüklü belge → Görüntüle linki (birden çok belge → getAllBy)
    expect(
      within(dialog).getAllByRole("link", { name: "Görüntüle" })[0],
    ).toBeInTheDocument();
  });
});

describe("FirmalarView — PAKET (tier) verme", () => {
  it("PAKET Ver → PromptDialog açılır (başlık 'Premium (PAKET) Ver')", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "PAKET Ver" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Premium (PAKET) Ver")).toBeInTheDocument();
  });

  it("ay '6' girilip onaylanınca months=6 ile tier mutate", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "PAKET Ver" }));
    const dialog = await screen.findByRole("dialog");
    const input = screen.getByLabelText(/Kaç ay premium verilsin/);
    await user.clear(input);
    await user.type(input, "6");
    await user.click(within(dialog).getByRole("button", { name: "PAKET Ver" }));
    expect(h.tierMutate).toHaveBeenCalledWith(
      { id: "c1", tier: "PAKET", months: 6 },
      expect.anything(),
    );
  });

  it("varsayılan (12) korunursa months=12 ile mutate", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "PAKET Ver" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "PAKET Ver" }));
    expect(h.tierMutate).toHaveBeenCalledWith(
      { id: "c1", tier: "PAKET", months: 12 },
      expect.anything(),
    );
  });

  it("geçersiz (n<1) → Number coercion fix ile months=12'ye düşer", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "PAKET Ver" }));
    const dialog = await screen.findByRole("dialog");
    const input = screen.getByLabelText(/Kaç ay premium verilsin/);
    await user.clear(input);
    await user.type(input, "0");
    await user.click(within(dialog).getByRole("button", { name: "PAKET Ver" }));
    expect(h.tierMutate).toHaveBeenCalledWith(
      { id: "c1", tier: "PAKET", months: 12 },
      expect.anything(),
    );
  });
});

describe("FirmalarView — askıya alma", () => {
  it("Askıya Al → PromptDialog 'Firmayı Askıya Al' açılır", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "Askıya Al" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Firmayı Askıya Al")).toBeInTheDocument();
  });

  it("sebep girilip onaylanınca suspend action'ı reason ile mutate", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "Askıya Al" }));
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
