// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyProfile } from "@/hooks/use-company-profile";

const h = vi.hoisted(() => ({
  update: vi.fn(),
  upload: vi.fn(),
  updatePending: false,
}));

vi.mock("@/hooks/use-company-profile", () => ({
  useUpdateCompanyProfile: () => ({ mutateAsync: h.update, isPending: h.updatePending }),
  useUploadProfileImage: () => ({ mutateAsync: h.upload, isPending: false }),
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { post: vi.fn() } }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { ProfileEditor } from "../profile-editor";

const PROFILE: CompanyProfile = {
  id: "c1",
  name: "Demo Firma A.Ş.",
  legalName: "Demo Firma Anonim Şirketi",
  industry: "Elektrik",
  website: "https://demo.com",
  country: "TR",
  city: "İstanbul",
  district: null,
  addressLine: null,
  postalCode: null,
  aboutText: "Biz demo firmayız.",
  publicEnabled: true,
  logoUrl: "https://cdn/logo.png",
  coverImageUrl: null,
  linkedinUrl: null,
  instagramUrl: null,
  employeeCount: "50-100",
  foundedYear: 2015,
  services: ["Kablo", "Pano"],
  certifications: ["ISO 9001"],
  photos: ["https://cdn/p1.jpg", "https://cdn/p2.jpg"],
  certificateImages: [],
  buyerCategoryIds: ["1"],
  sellerCategoryIds: [],
  buyerSubCategoryIds: [],
  sellerSubCategoryIds: [],
  activities: [],
  taxNumber: "1234567890",
  taxOffice: "Kadıköy",
  companyType: "JOINT_STOCK",
  authorizedTckn: null,
  authorizedTitle: null,
  mersisNo: null,
  tradeRegistryNo: null,
  kepAddress: null,
  iban: null,
  ibanHolder: null,
  billingPhone: null,
  billingPhoneVerifiedAt: null,
  rothernId: "DEM0-0001",
  slug: "demo-firma",
  tier: "GOLD",
  companyVerificationStatus: "VERIFIED",
  onboardingCompletedAt: null,
};

describe("ProfileEditor — yerinde düzenleme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.update.mockResolvedValue(PROFILE);
  });

  it("profil görünümü + düzenleme kontrolleri aynı ekranda; kaydet çubuğu yalnız değişiklik olunca", () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    // Görünüm: ad, hizmet chip'i, fotoğraf sayacı, hakkında metni textarea'da
    expect(screen.getByText("Demo Firma A.Ş.")).toBeInTheDocument();
    expect(screen.getByText("Kablo")).toBeInTheDocument();
    expect(screen.getByText(/2\/12/)).toBeInTheDocument();
    expect((screen.getByLabelText("Hakkında") as HTMLTextAreaElement).value).toBe("Biz demo firmayız.");
    // Kontroller
    expect(screen.getByLabelText("Logoyu değiştir")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kapak görseli ekle/ })).toBeInTheDocument();
    // Temizken kaydet çubuğu yok
    expect(screen.queryByText(/Kaydedilmemiş değişiklikler/)).not.toBeInTheDocument();
  });

  it("hakkında değişince anında kirli → Kaydet PATCH'i tüm profil alanlarıyla çağırır; Vazgeç geri alır", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    fireEvent.change(screen.getByLabelText("Hakkında"), { target: { value: "Yeni tanıtım" } });
    expect(screen.getByText(/Kaydedilmemiş değişiklikler/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0]![0]).toMatchObject({
      aboutText: "Yeni tanıtım",
      publicEnabled: true,
      services: ["Kablo", "Pano"],
      photos: ["https://cdn/p1.jpg", "https://cdn/p2.jpg"],
      foundedYear: 2015,
      // safeExternalUrl normalize eder (sondaki /) — eski formla aynı davranış.
      website: "https://demo.com/",
    });

    // Vazgeç: yeni değişiklik geri alınır
    fireEvent.change(screen.getByLabelText("Hakkında"), { target: { value: "Geçici" } });
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect((screen.getByLabelText("Hakkında") as HTMLTextAreaElement).value).toBe("Yeni tanıtım");
  });

  it("hizmet chip'i ekle/kaldır ve fotoğraf kaldır taslağa yansır", () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    const input = screen.getByLabelText("Hizmet ekle");
    fireEvent.change(input, { target: { value: "Aydınlatma" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Aydınlatma")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Kablo kaldır"));
    expect(screen.queryByText("Kablo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Fotoğraflar 1 kaldır"));
    expect(screen.getByText(/1\/12/)).toBeInTheDocument();
    expect(screen.getByText(/Kaydedilmemiş değişiklikler/)).toBeInTheDocument();
  });

  it("geçersiz bağlantıyla kaydetmez (javascript:)", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    fireEvent.change(screen.getByLabelText("LinkedIn"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.update).not.toHaveBeenCalled();
  });

  it("yetkisiz kullanıcı: salt görünüm, düzenleme kontrolü yok", () => {
    render(<ProfileEditor profile={PROFILE} canEdit={false} />);
    expect(screen.getByText("Demo Firma A.Ş.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Hakkında")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Logoyu değiştir")).not.toBeInTheDocument();
    expect(screen.getByText(/yetkisi gerekir/)).toBeInTheDocument();
  });
});
