// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyProfile } from "@/hooks/use-company-profile";

const h = vi.hoisted(() => ({
  post: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
  updatePending: false,
  get: vi.fn(),
}));

vi.mock("@/hooks/use-company-profile", () => ({
  useUpdateCompanyProfile: () => ({ mutateAsync: h.update, isPending: h.updatePending }),
  useUploadProfileImage: () => ({ mutateAsync: h.upload, isPending: false }),
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { post: h.post, get: h.get } }));
// Kategori seçiciler + Ürünlerim kartı sorgu atar (segmentler, kataloğum).
vi.mock("@/lib/api", () => ({ api: { get: h.get } }));

/** Profilim artık sorgu atıyor (kategori/katalog) → sağlayıcı şart. */
function render(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
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
      visitsVisible: true,
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
    h.get.mockImplementation((url: string) =>
      url.includes("/company/items")
        ? Promise.resolve({
            data: {
              items: [
                { id: "p1", name: "Dağıtım panosu", isPublic: true, thumbnailUrl: null },
                { id: "p2", name: "Taslak ürün", isPublic: false, thumbnailUrl: null },
              ],
              total: 2,
              truncated: false,
              counts: { published: 1, draft: 1 },
            },
          })
        : Promise.resolve({ data: [] }),
    );
  });

  it("profil görünümü + düzenleme kontrolleri aynı ekranda; kaydet çubuğu yalnız değişiklik olunca", () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    // Görünüm: ad, hizmet chip'i, hakkında metni textarea'da; GALERİ YOK (2026-09-10)
    expect(screen.getByText("Demo Firma A.Ş.")).toBeInTheDocument();
    expect(screen.getByText("Kablo")).toBeInTheDocument();
    expect((screen.getByLabelText("Hakkında") as HTMLTextAreaElement).value).toBe("Biz demo firmayız.");
    expect(screen.queryByText("Galeri")).toBeNull();
    expect(screen.queryByText("Fotoğraflar")).toBeNull();
    // YENİ DÜZEN: sağ rayda profil durumu + arama görünürlüğü + Ürünlerim; profil solda
    const rail = screen.getByRole("complementary");
    expect(within(rail).getByRole("region", { name: "Profil durumu" })).toHaveTextContent(/%\d+ tamam/);
    expect(within(rail).getByRole("region", { name: "Arama görünürlüğü" })).toBeInTheDocument();
    expect(within(rail).getByRole("region", { name: "Ürünlerim" })).toBeInTheDocument();
    expect(within(rail).getByRole("checkbox", { name: /Ziyaretlerim karşı tarafa görünsün/ })).toBeInTheDocument();
    expect(within(rail).queryByLabelText("Hakkında")).toBeNull();
    // Kontroller
    // Logo/kapak üstünde TEK "Düzenle" menüsü (v2 7g) — değiştir/kaldır içeride.
    fireEvent.click(screen.getByLabelText("Logoyu düzenle"));
    expect(screen.getByRole("menuitem", { name: "Logoyu değiştir" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Logoyu kaldır" })).toBeInTheDocument();
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
      foundedYear: 2015,
      // safeExternalUrl normalize eder (sondaki /) — eski formla aynı davranış.
      website: "https://demo.com/",
    });

    // Vazgeç: yeni değişiklik geri alınır
    fireEvent.change(screen.getByLabelText("Hakkında"), { target: { value: "Geçici" } });
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect((screen.getByLabelText("Hakkında") as HTMLTextAreaElement).value).toBe("Yeni tanıtım");
  });

  it("hizmet chip'i ekle/kaldır taslağa yansır; kayıt gövdesi photos TAŞIMAZ", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    const input = screen.getByLabelText("Hizmet ekle");
    fireEvent.change(input, { target: { value: "Aydınlatma" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Aydınlatma")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Kablo kaldır"));
    expect(screen.queryByText("Kablo")).not.toBeInTheDocument();
    expect(screen.getByText(/Kaydedilmemiş değişiklikler/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0]![0]).not.toHaveProperty("photos");
  });

  it("geçersiz bağlantıyla kaydetmez (javascript:)", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    fireEvent.change(screen.getByLabelText("LinkedIn"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.update).not.toHaveBeenCalled();
  });

  it("firma türü / faaliyet kategorileri SALT OKUNUR; düzenleme Firma Bilgileri'ne gider", () => {
    // Kategori beyanı TEK yerde düzenlenir (v2 4c) — Profilim gösterir.
    render(<ProfileEditor profile={PROFILE} canEdit />);
    expect(screen.queryByRole("group", { name: "Firma türü" })).toBeNull();
    expect(screen.getByRole("link", { name: /Düzenle → Firma Bilgileri/ })).toHaveAttribute(
      "href",
      "/company/ayarlar/firma#kategoriler",
    );
  });

  it("Ürünlerim (N) kartı yayındaki ürünleri sayar ve yönetime bağlar; önizleme mevcut public rotaya", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    const card = await screen.findByRole("region", { name: "Ürünlerim" });
    expect(await within(card).findByText("Dağıtım panosu")).toBeInTheDocument();
    expect(within(card).getByRole("heading")).toHaveTextContent("Ürünlerim (1)");
    expect(within(card).queryByText("Taslak ürün")).toBeNull();
    expect(within(card).getByRole("link", { name: "Ürünleri yönet" })).toHaveAttribute(
      "href",
      "/company/satis/urunlerim",
    );
    expect(screen.getByRole("link", { name: "Herkese açık görünümü önizle" })).toHaveAttribute(
      "href",
      "/firma/demo-firma",
    );
    // Rehber (kapı değil): kategori seçilmemiş → eksik olarak listelenir.
    expect(screen.getByText(/Alıcıların sizi bulması için/)).toBeInTheDocument();
    expect(screen.getByText(/En az 1 kategori/)).toBeInTheDocument();
  });

  it("yetkisiz kullanıcı: salt görünüm, düzenleme kontrolü yok", () => {
    render(<ProfileEditor profile={PROFILE} canEdit={false} />);
    expect(screen.getByText("Demo Firma A.Ş.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Hakkında")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Logoyu değiştir")).not.toBeInTheDocument();
    expect(screen.getByText(/yetkisi gerekir/)).toBeInTheDocument();
  });

  /**
   * "WEB SİTEMDEN AI İLE DOLDUR" — kullanıcı kararı 2026-09-14.
   *
   * Eskiden düğme site boşken PASİFTİ ve ipucu "önce künyeye web sitesi girin"
   * diyordu; künye ise sayfanın en altındaydı. Kullanıcı düğmeyi görüyor, neden
   * çalışmadığını anlamıyordu. Artık düğme her zaman basılabilir: site varsa
   * ANINDA başlar, yoksa yerinde sorar.
   */
  describe("AI ile profil doldurma", () => {
    const AI_YANIT = {
      data: {
        aboutText: "Örnek firma paslanmaz boru üretir.",
        services: ["Kaynak"],
        foundedYear: 1998,
        linkedinUrl: null,
        instagramUrl: null,
        logoCandidateUrl: null,
      },
    };

    it("site KAYITLIYSA tıklandığı an başlar ve adresi GÖVDEDE yollar", async () => {
      h.post.mockResolvedValue(AI_YANIT);
      render(<ProfileEditor profile={{ ...PROFILE, website: "ornekfirma.com" }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: /AI ile doldur/ }));

      await waitFor(() => expect(h.post).toHaveBeenCalled());
      // Gövde ŞART: kullanıcının az önce yazdığı adres henüz kaydedilmemiş
      // olabilir, sunucu DB'deki boş değeri okurdu.
      expect(h.post.mock.calls[0][1]).toEqual({ website: "ornekfirma.com" });
      // Site sorma kutusu HİÇ açılmaz.
      expect(screen.queryByLabelText("Web sitenizin adresi")).toBeNull();
    });

    it("site YOKSA önce sorar, adres girilince başlar", async () => {
      h.post.mockResolvedValue(AI_YANIT);
      render(<ProfileEditor profile={{ ...PROFILE, website: null }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: /AI ile doldur/ }));

      // Düğme pasif DEĞİL — sorar.
      const alan = await screen.findByLabelText("Web sitenizin adresi");
      expect(h.post).not.toHaveBeenCalled();

      fireEvent.change(alan, { target: { value: "yenifirma.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Devam" }));

      await waitFor(() => expect(h.post).toHaveBeenCalled());
      expect(h.post.mock.calls[0][1]).toEqual({ website: "yenifirma.com" });
    });

    it("sorma kutusundan girilen adres KÜNYEYE de işlenir", async () => {
      h.post.mockResolvedValue(AI_YANIT);
      render(<ProfileEditor profile={{ ...PROFILE, website: null }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: /AI ile doldur/ }));
      fireEvent.change(await screen.findByLabelText("Web sitenizin adresi"), {
        target: { value: "yenifirma.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Devam" }));

      await waitFor(() =>
        expect((screen.getByLabelText("Web sitesi") as HTMLInputElement).value).toBe(
          "yenifirma.com",
        ),
      );
    });
  });
});
