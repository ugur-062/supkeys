// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: vi.fn(),
  role: "SUPPORT",
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
// Sekmeler bu testin konusu değil — başlık şeridi ve hata dalları sınanır.
vi.mock("../tabs/summary-tab", () => ({ SummaryTab: () => null }));
vi.mock("@/hooks/use-admin-companies", () => ({
  useCompanyDetail: () => h.detail(),
  useCompanyAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ admin: { role: h.role } }) }));

import { CompanyDetailView } from "../company-detail-view";

/**
 * Yayın denetimi 2026-09-28 Bölüm 6: firma detayı SUPER_ADMIN + SALES'e açık;
 * Destek rolü 403'te genel hata + işe yaramayan "Tekrar dene" görüyordu.
 */
describe("CompanyDetailView — yetki hatası", () => {
  beforeEach(() => {
    h.detail.mockReset();
    h.role = "SUPPORT";
  });

  it("403: yetki mesajı gösterir, 'Tekrar dene' YOK", () => {
    h.detail.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { response: { status: 403 } }, refetch: vi.fn() });
    render(<CompanyDetailView companyId="c1" />);
    expect(screen.getByText(/görüntüleme yetkiniz yok/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
  });

  it("diğer hatalar: genel mesaj + 'Tekrar dene'", () => {
    h.detail.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { response: { status: 500 } }, refetch: vi.fn() });
    render(<CompanyDetailView companyId="c1" />);
    expect(screen.getByText("Firma yüklenemedi.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });
});

function company(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    rothernId: "SK-001",
    name: "Acme",
    country: "TR",
    tier: "STANDART",
    membershipEndAt: null,
    companyVerificationStatus: "VERIFIED",
    billingEmail: null,
    isBlocked: false,
    blockedReason: null,
    blockedAt: null,
    openComplaints: 0,
    _count: { users: 1, listings: 0, complaintsReceived: 0 },
    ...over,
  };
}

describe("CompanyDetailView — bulunamadı, pano, KVKK", () => {
  beforeEach(() => {
    h.detail.mockReset();
    vi.clearAllMocks();
    h.role = "SUPER_ADMIN";
  });

  it("404: 'Firma bulunamadı' + listeye dönüş, 'Tekrar dene' YOK (D-206)", () => {
    h.detail.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { response: { status: 404 } }, refetch: vi.fn() });
    render(<CompanyDetailView companyId="does-not-exist" />);
    expect(screen.getByText("Firma bulunamadı.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Firmalar listesine dön/ })).toHaveAttribute("href", "/admin/firmalar");
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
  });

  it("pano izni yoksa başarı değil hata toast'ı (D-207)", async () => {
    h.detail.mockReturnValue({ data: company(), isLoading: false, isError: false, error: null, refetch: vi.fn() });
    const user = userEvent.setup();
    render(<CompanyDetailView companyId="c1" />);
    const writeText = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(screen.getByTitle("Firma kodunu kopyala"));
    await vi.waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("pano başarılıysa 'Kod kopyalandı'", async () => {
    h.detail.mockReturnValue({ data: company(), isLoading: false, isError: false, error: null, refetch: vi.fn() });
    const user = userEvent.setup();
    render(<CompanyDetailView companyId="c1" />);
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(screen.getByTitle("Firma kodunu kopyala"));
    await vi.waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Kod kopyalandı"));
    expect(writeText).toHaveBeenCalledWith("SK-001");
  });

  it("KVKK ile anonimleştirilmiş firmada Askıyı Kaldır / Bildirim Gönder yok, durum bandı var (D-208)", () => {
    h.detail.mockReturnValue({
      data: company({ isBlocked: true, anonymized: true, blockedReason: "KVKK silme talebi — anonimleştirildi" }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<CompanyDetailView companyId="c1" />);
    expect(screen.queryByRole("button", { name: "Askıyı Kaldır" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Bildirim Gönder" })).toBeNull();
    expect(screen.getByText(/KVKK silme talebiyle anonimleştirildi/)).toBeInTheDocument();
    // "Doğrulandı" rozeti yanıltıcı — gösterilmez.
    expect(screen.queryByText("Doğrulandı")).toBeNull();
  });

  it("askıdaki normal firmada Askıyı Kaldır görünür", () => {
    h.detail.mockReturnValue({ data: company({ isBlocked: true }), isLoading: false, isError: false, error: null, refetch: vi.fn() });
    render(<CompanyDetailView companyId="c1" />);
    expect(screen.getByRole("button", { name: "Askıyı Kaldır" })).toBeInTheDocument();
  });
});
