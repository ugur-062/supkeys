// @vitest-environment jsdom
/**
 * Firma Bilgileri (2026-09-10) — sözleşme:
 *  - kimlik alanları salt-okunur, kayıt ülkesi görünür, kimlik no MASKELİ;
 *  - doğrulama durumu 4 değerli tek kaynaktan (UNVERIFIED "Bekliyor" DEĞİL);
 *  - PENDING/VERIFIED'da firma adı + yasal unvan kilitli (backend aynası);
 *  - Kaydet yalnız değişiklik varsa aktif ve YALNIZ değişen alanı gönderir;
 *  - TR dışı firmada Vergi Dairesi / KEP çizilmez, vergi etiketi ülkeden.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";

const h = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>,
  update: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-profile", () => ({
  useCompanyProfile: () => ({ data: h.profile, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateCompanyProfile: () => ({ mutateAsync: h.update, isPending: false }),
}));
vi.mock("@/components/categories/segment-only-picker", () => ({
  SegmentOnlyPicker: () => <div data-testid="segment-picker" />,
}));
vi.mock("@/components/categories/category-selector-button", () => ({
  CategorySelectorButton: () => <div data-testid="sub-picker" />,
}));

import { CompanyProfileSection } from "../company-profile-section";

function baseProfile(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "Demo Firma",
    legalName: "Demo Firma A.Ş.",
    country: "TR",
    city: "İstanbul",
    district: "Kadıköy",
    addressLine: "Cadde 1",
    postalCode: "34000",
    kepAddress: "",
    taxNumber: "1234567890",
    taxOffice: "Kadıköy",
    companyType: "JOINT_STOCK",
    authorizedTckn: "12345678901",
    authorizedTitle: "Genel Müdür",
    rothernId: "RK-0001",
    tier: "STANDART",
    companyVerificationStatus: "UNVERIFIED",
    buyerCategoryIds: [],
    sellerCategoryIds: [],
    buyerSubCategoryIds: [],
    sellerSubCategoryIds: [],
    activities: [],
    ...over,
  };
}

const saveButton = () => screen.getByRole("button", { name: "Kaydet" });

describe("CompanyProfileSection", () => {
  beforeEach(() => {
    h.update.mockReset().mockResolvedValue({});
    h.toast.success.mockReset();
    h.toast.error.mockReset();
    h.profile = baseProfile();
  });

  it("kimlik salt-okunur: ülke görünür, TCKN maskeli, tam numara HTML'de yok", () => {
    render(<CompanyProfileSection />);
    expect(screen.getByText("Türkiye")).toBeInTheDocument();
    expect(screen.getByText("Anonim Şirket")).toBeInTheDocument();
    expect(screen.getByText("123******01")).toBeInTheDocument();
    expect(screen.queryByText("12345678901")).not.toBeInTheDocument();
    // Tüzel kişide vergi no kamuya açık → tam basılır.
    expect(screen.getByText("1234567890")).toBeInTheDocument();
    expect(screen.getByText("Belge bekleniyor")).toBeInTheDocument();
    expect(screen.queryByText("Bekliyor")).not.toBeInTheDocument();
  });

  it("şahıs firmasında vergi no = TCKN → maskeli", () => {
    h.profile = baseProfile({ companyType: "SOLE_PROPRIETOR", taxNumber: "98765432109" });
    render(<CompanyProfileSection />);
    expect(screen.getByText("Vergi No (TCKN)")).toBeInTheDocument();
    expect(screen.getByText("987******09")).toBeInTheDocument();
    expect(screen.queryByText("98765432109")).not.toBeInTheDocument();
  });

  it("UNVERIFIED'da firma adı ve yasal unvan düzenlenebilir; Kaydet değişiklik yokken pasif", () => {
    render(<CompanyProfileSection />);
    expect(screen.getByLabelText("Firma adı")).toBeEnabled();
    expect(screen.getByLabelText("Yasal unvan")).toBeEnabled();
    expect(saveButton()).toBeDisabled();
  });

  it.each(["PENDING", "VERIFIED"])("%s: firma adı ve yasal unvan kilitli, adres serbest", (status) => {
    h.profile = baseProfile({ companyVerificationStatus: status });
    render(<CompanyProfileSection />);
    expect(screen.getByLabelText("Firma adı")).toBeDisabled();
    expect(screen.getByLabelText("Yasal unvan")).toBeDisabled();
    expect(screen.getByLabelText("İl / Şehir")).toBeEnabled();
  });

  it("REJECTED: düzeltme için unvan serbest, rozet 'Reddedildi'", () => {
    h.profile = baseProfile({ companyVerificationStatus: "REJECTED" });
    render(<CompanyProfileSection />);
    expect(screen.getByText("Reddedildi")).toBeInTheDocument();
    expect(screen.getByLabelText("Firma adı")).toBeEnabled();
  });

  it("yalnız DEĞİŞEN alan gönderilir; kilitli alanlar payload'a girmez", async () => {
    h.profile = baseProfile({ companyVerificationStatus: "VERIFIED" });
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    await user.clear(screen.getByLabelText("İl / Şehir"));
    await user.type(screen.getByLabelText("İl / Şehir"), "Ankara");
    expect(screen.getByText("Kaydedilmemiş değişiklikler var")).toBeInTheDocument();
    await user.click(saveButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update).toHaveBeenCalledWith({ city: "Ankara" });
    expect(h.toast.success).toHaveBeenCalled();
  });

  it("Vazgeç forma geri döner", async () => {
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    await user.type(screen.getByLabelText("İlçe"), "X");
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByLabelText("İlçe")).toHaveValue("Kadıköy");
    expect(saveButton()).toBeDisabled();
  });

  it("firma adı 2 karakterden kısa → satır içi hata, Kaydet pasif", async () => {
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    await user.clear(screen.getByLabelText("Firma adı"));
    await user.type(screen.getByLabelText("Firma adı"), "A");
    expect(screen.getByText("Firma adı en az 2 karakter olmalı")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("geçersiz KEP → satır içi hata, Kaydet pasif", async () => {
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    await user.type(screen.getByLabelText("KEP Adresi"), "ornek@gmail.com");
    expect(screen.getByText(/Geçerli bir KEP adresi/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("TR dışı firma: Vergi Dairesi ve KEP çizilmez, vergi etiketi ülke profilinden", () => {
    h.profile = baseProfile({ country: "KZ", taxOffice: null, taxNumber: "123456789012" });
    render(<CompanyProfileSection />);
    expect(screen.getByText("Kazakistan")).toBeInTheDocument();
    expect(screen.queryByText("Vergi Dairesi")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("KEP Adresi")).not.toBeInTheDocument();
    expect(screen.getByText(/BIN/)).toBeInTheDocument();
    expect(screen.getByText("Yetkili Kimlik No")).toBeInTheDocument();
  });

  it("sunucu kilidi (400) toast ile gösterilir", async () => {
    const err = new AxiosError("Bad Request", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 400,
      statusText: "Bad Request",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { message: "Firmanız doğrulandı; firma adı, ünvan, kimlik ve IBAN bilgileri değiştirilemez" },
    });
    h.update.mockRejectedValueOnce(err);
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    await user.type(screen.getByLabelText("Firma adı"), " Ltd");
    await user.click(saveButton());
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringContaining("değiştirilemez")));
  });
});
