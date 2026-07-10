// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  reviewMutate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-admin-companies", () => ({
  useReviewDocuments: () => ({ mutate: h.reviewMutate, isPending: false }),
}));

import { DocsTab } from "../docs-tab";
import type { AdminCompanyDetail } from "@/hooks/use-admin-companies";

function detail(over: Partial<AdminCompanyDetail> = {}): AdminCompanyDetail {
  return {
    id: "c1",
    rothernId: "SK-001",
    name: "Acme A.Ş.",
    legalName: "Acme Anonim Şirketi",
    taxNumber: "1234567890",
    taxOffice: "Kadıköy",
    country: "TR",
    stateRegion: null,
    city: "İstanbul",
    addressLine: null,
    billingEmail: null,
    tier: "STANDARD",
    membershipEndAt: null,
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
    blockedReason: null,
    blockedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    _count: { users: 1, listings: 0, complaintsReceived: 0 },
    openComplaints: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DocsTab — KYC belge inceleme", () => {
  it("Hepsini Onayla → Kararı Kaydet → review (6 belge APPROVED) mutate", async () => {
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail()} />);
    await user.click(screen.getByRole("button", { name: "Hepsini Onayla" }));
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
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

  it("bir belgeyi Reddet + gerekçe (kalanlar onaylı) → review mutate", async () => {
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail()} />);
    await user.click(screen.getByRole("button", { name: "Hepsini Onayla" }));
    await user.click(screen.getAllByRole("button", { name: "Reddet" })[0]!);
    await user.type(
      screen.getByLabelText(/Vergi Levhası red gerekçesi/),
      "belge okunmuyor",
    );
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
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

  it("belge listesini + Görüntüle linklerini gösterir", () => {
    render(<DocsTab companyId="c1" data={detail()} />);
    expect(screen.getByText("Vergi Levhası")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Görüntüle" }).length,
    ).toBeGreaterThan(0);
  });

  it("yabancı firma → 3 belgelik set + bilgi bandı", () => {
    render(<DocsTab companyId="c1" data={detail({ country: "DE" })} />);
    expect(screen.getByText(/Yabancı firma \(DE\)/)).toBeInTheDocument();
    // Yalnız 3 zorunlu belge listelenir — İmza Sirküleri görünmez.
    expect(screen.queryByText("İmza Sirküleri")).not.toBeInTheDocument();
    expect(screen.getByText("Vergi Levhası")).toBeInTheDocument();
    expect(screen.getByText("Ticaret Sicil Gazetesi")).toBeInTheDocument();
  });

  it("karar verilmemiş belge varken kaydetmeye çalışınca hata toast'ı", async () => {
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail()} />);
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
    expect(h.toast.error).toHaveBeenCalled();
    expect(h.reviewMutate).not.toHaveBeenCalled();
  });
});
