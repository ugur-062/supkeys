// @vitest-environment jsdom
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyProfile } from "@/hooks/use-company-profile";

const h = vi.hoisted(() => ({
  post: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
  updatePending: false,
  get: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
}));

// Kaydedilmemiş değişiklik koruması (`useUnsavedChangesGuard`): onay diyaloğu
// kabuk sağlayıcısından, gezinme Next yönlendiricisinden gelir.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: h.push, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => h.confirm }));

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
// Kırpma penceresi jsdom'da görsel çözemez → sade taklit: açık mı, başlığı ne,
// "Kaydet" hangi dosyayla onConfirm çağırıyor.
vi.mock("@/components/ui/image-crop-dialog", () => ({
  ImageCropDialog: (p: { file: File | null; title: string; onConfirm: (f: File) => Promise<void> }) =>
    p.file ? (
      <div role="dialog" aria-label={p.title}>
        <button type="button" onClick={() => void p.onConfirm(new File(["x"], "kirpik.webp", { type: "image/webp" }))}>
          Kırpmayı kaydet
        </button>
      </div>
    ) : null,
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { toast } from "sonner";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { ProfileEditor } from "../profile-editor";

/** Kurucu benzeri oturum: yönetim + satış/satınalma görüntüleme + koltuk izni. */
const OWNER_USER = {
  isOwner: true,
  roles: ["SAHIP"],
  permissions: ["company:manage", "buy:view", "sell:view", "sell:product:manage"],
};
function setUser(user: Record<string, unknown> | null) {
  useCompanyAuthStore.setState({
    user: user as never,
    company: user ? ({ tier: "GOLD", companyVerificationStatus: "VERIFIED" } as never) : null,
  } as never);
}

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
    // Hakkında taslağı sessionStorage'da yaşar (PD-01); testler birbirine taslak bırakmasın.
    sessionStorage.clear();
    setUser(OWNER_USER);
    h.update.mockResolvedValue(PROFILE);
    // Varsayılan: "Kal" (ayrılma).
    h.confirm.mockReset().mockResolvedValue(false);
    h.push.mockReset();
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
    // Gizlilik anahtarı Ziyaret Edenler sayfasına taşındı (2026-09-19).
    expect(within(rail).queryByRole("checkbox", { name: /Ziyaretlerim karşı tarafa görünsün/ })).toBeNull();
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

  // resignup-7: aynı adlı ikinci firma `…-2` adresini alır; önizleme adresi
  // addan yeniden üretiyor, ÖTEKİ firmanın sayfasını gösteriyordu.
  it("'Google'da böyle görünür' önizlemesi firmanın KAYITLI adresini gösterir (addan üretmez)", () => {
    render(
      <ProfileEditor
        profile={{
          ...PROFILE,
          name: "Öztürk Çelik Yapı Sanayi ve Ticaret Ltd. Şti.",
          slug: "ozturk-celik-yapi-sanayi-ve-ticaret-2",
        }}
        canEdit
      />,
    );
    const card = within(screen.getByRole("complementary")).getByRole("region", { name: "Arama görünürlüğü" });
    const url = within(card).getByText(/\/firma\//);
    expect(url.textContent).toMatch(/\/firma\/ozturk-celik-yapi-sanayi-ve-ticaret-2$/);
  });

  it("henüz adresi olmayan profilde (slug yok) önizleme addan türetilen taslağı gösterir", () => {
    render(<ProfileEditor profile={{ ...PROFILE, slug: null }} canEdit />);
    const card = within(screen.getByRole("complementary")).getByRole("region", { name: "Arama görünürlüğü" });
    expect(within(card).getByText(/\/firma\//).textContent).toMatch(/\/firma\/demo-firma$/);
  });

  it("başlıktaki konum ortak bayrakla: TR bayrağı + Türkiye, şehir yanında (son toparlama 2026-10-04)", () => {
    const { container } = render(<ProfileEditor profile={PROFILE} canEdit />);
    const flag = container.querySelector('img[src="/flags/4x3/tr.svg"]');
    expect(flag).not.toBeNull();
    // Ad metinde yazılı → bayrak dekoratif; düz "İstanbul, Türkiye" metni kalmadı.
    expect(flag!.getAttribute("alt")).toBe("");
    expect(flag!.closest("span")).toHaveTextContent("Türkiye");
    expect(screen.getByText("İstanbul")).toBeInTheDocument();
    expect(container.textContent).not.toContain("İstanbul, Türkiye");
  });

  it("hakkında değişince anında kirli → Kaydet PATCH'i YALNIZ değişen alanı taşır; Vazgeç geri alır (arayüz testi O-103)", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    fireEvent.change(screen.getByLabelText("Hakkında"), { target: { value: "Yeni tanıtım" } });
    expect(screen.getByText(/Kaydedilmemiş değişiklikler/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    // Dokunulmayan alanlar (yayın anahtarı, hizmetler, site…) ve kontrolü
    // burada olmayan `visitsVisible` GİTMEZ — başka sekmedeki değişikliği ezmesin.
    expect(h.update.mock.calls[0]![0]).toEqual({ aboutText: "Yeni tanıtım" });

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

  it("değişen web sitesi normalize edilerek gider", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    fireEvent.change(screen.getByLabelText("Web sitesi"), { target: { value: "yeni.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0]![0]).toEqual({ website: "https://yeni.com/" });
  });

  it("başka sekmede kapatılan ziyaret gizliliği Kaydet'le geri AÇILMAZ; sunucudan gelen yeni değer dokunulmamış alana yansır (arayüz testi O-103)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrap = (p: CompanyProfile) => (
      <QueryClientProvider client={qc}>
        <ProfileEditor profile={p} canEdit />
      </QueryClientProvider>
    );
    const { rerender } = rtlRender(wrap(PROFILE));
    fireEvent.change(screen.getByLabelText("Hakkında"), { target: { value: "Yeni tanıtım" } });
    // Başka sekme: ziyaret gizliliği kapandı + sektör değişti → refetch.
    rerender(wrap({ ...PROFILE, visitsVisible: false, industry: "Makine" }));
    expect((screen.getByLabelText("Sektör") as HTMLInputElement).value).toBe("Makine");
    expect((screen.getByLabelText("Hakkında") as HTMLTextAreaElement).value).toBe("Yeni tanıtım");
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    const body = h.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("visitsVisible");
    expect(body).not.toHaveProperty("industry");
    expect(body).toEqual({ aboutText: "Yeni tanıtım" });
  });

  it("alan uzunluk tavanları istemcide: maxLength + Hakkında sayacı + alan adlı hata (arayüz testi D-054)", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    expect(screen.getByLabelText("Sektör")).toHaveAttribute("maxLength", "100");
    expect(screen.getByLabelText("Hakkında")).toHaveAttribute("maxLength", "2000");
    // "https://demo.com" kayıtta "https://demo.com/" olur: 1 karakterlik pay düşülür.
    expect(screen.getByLabelText("Web sitesi")).toHaveAttribute("maxLength", "199");
    expect(screen.getByLabelText("LinkedIn")).toHaveAttribute("maxLength", "150");
    expect(screen.getByLabelText("Instagram")).toHaveAttribute("maxLength", "150");
    expect(screen.getByLabelText("Kuruluş yılı")).toHaveAttribute("maxLength", "4");
    expect(screen.getByText("18/2.000 karakter")).toBeInTheDocument();
    // AI taslağı gibi tavanı aşan metin: Kaydet alan adıyla uyarır, istek gitmez.
    fireEvent.change(screen.getByLabelText("Hakkında"), { target: { value: "x".repeat(2001) } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Hakkında: en fazla 2.000 karakter olabilir."),
    );
    expect(h.update).not.toHaveBeenCalled();
  });

  it("şemasız bağlantı: kutu https:// payını düşer, kutunun kabul ettiği değer kaydedilir (arayüz testi D-054, yeniden doğrulama)", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    const box = screen.getByLabelText("LinkedIn");
    // Boş kutu tam sınırı kabul eder (yapıştırılan `https://…` kırpılmasın).
    expect(box).toHaveAttribute("maxLength", "150");
    const prefix = "linkedin.com/company/";
    fireEvent.change(box, { target: { value: prefix + "a" } });
    // Kayıt `https://` (8) ekler; kutu 142'de durur.
    expect(box).toHaveAttribute("maxLength", "142");
    const atLimit = prefix + "a".repeat(142 - prefix.length);
    fireEvent.change(box, { target: { value: atLimit } });
    expect(box).toHaveAttribute("maxLength", "142");
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    const body = h.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.linkedinUrl).toBe(`https://${atLimit}`);
    expect((body.linkedinUrl as string).length).toBe(150);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("boş kutuya yapıştırılan şemasız uzun bağlantı kaydedilebilir uzunluğa kırpılır ve kaydedilir (arayüz testi son tur webC-05 NEW-3)", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    const box = screen.getByLabelText("LinkedIn") as HTMLInputElement;
    expect(box).toHaveAttribute("maxLength", "150");
    const prefix = "linkedin.com/company/";
    // Boş kutunun maxLength'i 150: tarayıcı 150 karakterlik yapıştırmayı alır.
    fireEvent.change(box, { target: { value: prefix + "a".repeat(150 - prefix.length) } });
    expect(box.value).toHaveLength(142);
    expect(box).toHaveAttribute("maxLength", "142");
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    const body = h.update.mock.calls[0]![0] as Record<string, unknown>;
    expect((body.linkedinUrl as string).length).toBe(150);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("kuruluş yılı DTO aralığı dışında kaydetmez (arayüz testi D-054)", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    fireEvent.change(screen.getByLabelText("Kuruluş yılı"), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Kuruluş yılı 1800–2100 arasında olmalı."));
    expect(h.update).not.toHaveBeenCalled();
  });

  it("geçersiz bağlantıyla kaydetmez (javascript:)", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    fireEvent.change(screen.getByLabelText("LinkedIn"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.update).not.toHaveBeenCalled();
  });

  it("LOGO: dosya seçilince önce kırpma penceresi açılır; penceredeki Kaydet yükler ve YALNIZ logoyu hemen kaydeder", async () => {
    h.upload.mockResolvedValue("https://cdn/yeni-logo.webp");
    render(<ProfileEditor profile={{ ...PROFILE, logoUrl: null }} canEdit />);
    const input = screen.getByLabelText("Logo seç") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } });

    const dialog = await screen.findByRole("dialog", { name: "Logoyu ayarla" });
    // Kırpmadan önce hiçbir şey yüklenmez ya da kaydedilmez.
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Kırpmayı kaydet" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ logoUrl: "https://cdn/yeni-logo.webp" }));
    expect(h.upload).toHaveBeenCalledWith(expect.objectContaining({ kind: "logo" }));
    // Sayfanın altındaki kaydet çubuğuna gerek kalmaz: pencere kapanır, taslak kirli değil.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Logoyu ayarla" })).toBeNull());
    expect(screen.queryByRole("button", { name: /Değişiklikleri kaydet|^Kaydet$/ })).toBeNull();
  });

  it("KAPAK: seçim kırpma penceresini kapak başlığıyla açar", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    const input = screen.getByLabelText("Kapak görseli seç") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "kapak.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByRole("dialog", { name: "Kapak görselini ayarla" })).toBeInTheDocument();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("faaliyet tipi / faaliyet kategorileri SALT OKUNUR; düzenleme Firma Bilgileri'ne gider", () => {
    // Kategori beyanı TEK yerde düzenlenir (v2 4c) — Profilim gösterir.
    render(<ProfileEditor profile={PROFILE} canEdit />);
    expect(screen.queryByRole("group", { name: "Faaliyet tipi" })).toBeNull();
    // Etiket "Faaliyet tipi" — onboarding'deki "Firma türü" (hukuki yapı) değil (D-088).
    expect(screen.getByText("Faaliyet tipi")).toBeInTheDocument();
    expect(screen.queryByText("Firma türü")).toBeNull();
    // Kart başlığı da faaliyet tipi + kategorileri adlandırır (D-088, yeniden doğrulama).
    expect(screen.getByRole("heading", { name: "Faaliyet tipi ve kategorileri" })).toBeInTheDocument();
    expect(screen.queryByText(/Firma türü ve faaliyet/)).toBeNull();
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
    // Önizleme PANEL İÇİNDE (2026-09-17): üyenin gördüğü profil sayfası,
    // aynı sekme — herkese açık rota oturum kapanmış hissi veriyordu.
    expect(screen.getByRole("link", { name: "Profilimi önizle" })).toHaveAttribute(
      "href",
      "/company/firma/DEM0-0001",
    );
    // Rehber (kapı değil): kategori seçilmemiş → eksik olarak listelenir.
    expect(screen.getByText(/Alıcıların sizi bulması için/)).toBeInTheDocument();
    expect(screen.getByText(/En az 1 kategori/)).toBeInTheDocument();
  });

  /**
   * Gözden geçirme REV-2 ile aynı kural (yanıt gelmeden "yok" denmez): kart
   * iskeleti `isLoading`e bağlıydı ve hata dalı yoktu — çevrimdışı cihazda
   * (sorgu duraklar) ve API kesintisinde ürünü olan firmaya "Ürünlerim (0)" +
   * "Yayında ürün yok" çiziliyordu.
   */
  describe("Ürünlerim kartı — yanıt gelmeden 'yok' demez", () => {
    afterEach(() => {
      onlineManager.setOnline(true);
    });

    it("cihaz çevrimdışı (sorgu duraklatıldı): sayı ve 'Yayında ürün yok' YOK, iskelet; bağlantı dönünce ürünler gelir", async () => {
      onlineManager.setOnline(false);
      render(<ProfileEditor profile={PROFILE} canEdit />);
      const card = screen.getByRole("region", { name: "Ürünlerim" });
      expect(within(card).getByRole("heading")).toHaveTextContent(/^Ürünlerim$/);
      expect(within(card).queryByText(/Yayında ürün yok/)).toBeNull();
      expect(card.querySelector(".animate-pulse")).not.toBeNull();
      expect(h.get).not.toHaveBeenCalledWith("/company/items", expect.anything());

      act(() => onlineManager.setOnline(true));
      expect(await within(card).findByText("Dağıtım panosu")).toBeInTheDocument();
      expect(within(card).getByRole("heading")).toHaveTextContent("Ürünlerim (1)");
    });

    it("liste okunamadı (kesinti): 'Ürünlerim (0)' ve 'Yayında ürün yok' YOK; yönetim bağlantısı kalır", async () => {
      h.get.mockImplementation((url: string) =>
        url.includes("/company/items")
          ? Promise.reject(Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }))
          : Promise.resolve({ data: [] }),
      );
      render(<ProfileEditor profile={PROFILE} canEdit />);
      const card = screen.getByRole("region", { name: "Ürünlerim" });
      // Hata yerleşti: iskelet kalktı, ama kart "yok" da demiyor.
      await waitFor(() => expect(card.querySelector(".animate-pulse")).toBeNull());
      expect(within(card).getByRole("heading")).toHaveTextContent(/^Ürünlerim$/);
      expect(within(card).queryByText(/Yayında ürün yok/)).toBeNull();
      expect(within(card).getByRole("link", { name: "Ürünleri yönet" })).toHaveAttribute(
        "href",
        "/company/satis/urunlerim",
      );
    });

    it("BAŞARILI ve boş yanıt: gerçek 'Ürünlerim (0)' + 'Yayında ürün yok'", async () => {
      h.get.mockImplementation((url: string) =>
        Promise.resolve({
          data: url.includes("/company/items")
            ? { items: [], total: 0, truncated: false, counts: { published: 0, draft: 0 } }
            : [],
        }),
      );
      render(<ProfileEditor profile={PROFILE} canEdit />);
      const card = screen.getByRole("region", { name: "Ürünlerim" });
      expect(await within(card).findByText(/Yayında ürün yok/)).toBeInTheDocument();
      expect(within(card).getByRole("heading")).toHaveTextContent("Ürünlerim (0)");
    });
  });

  it("Ürünlerim kartı yayındakileri SUNUCU süzgeciyle ister (kullanım sıralı ilk 50 değil — derin denetim LU-27)", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    await screen.findByRole("region", { name: "Ürünlerim" });
    await waitFor(() =>
      expect(h.get).toHaveBeenCalledWith(
        "/company/items",
        expect.objectContaining({ params: expect.objectContaining({ status: "published", sort: "recent" }) }),
      ),
    );
  });

  it("kuruluş yılı silinip kaydedilince PATCH `foundedYear: null` taşır (derin denetim LU-27)", async () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    fireEvent.change(screen.getByLabelText("Kuruluş yılı"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    const body = h.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).toHaveProperty("foundedYear", null);
  });

  it("faaliyet kategorileri sayısı yalnız kullanıcının seçtiklerini sayar, türetilmiş ataları değil (derin denetim LU-27)", () => {
    // Tek L4 yaprak seçimi depoda segment + L2 + L3 + L4 olarak durur; ayrıca
    // altında yaprağı olmayan ("Sektör geneli") bir segment var.
    const profile = {
      ...PROFILE,
      sellerCategoryIds: ["39000000", "40000000"],
      sellerSubCategoryIds: ["39120000", "39121600", "39121601"],
    };
    render(<ProfileEditor profile={profile} canEdit />);
    expect(screen.getByText("Faaliyet kategorileri (2)")).toBeInTheDocument();
  });

  // 2026-10-09 (sahip kararı; arayüz denetimi W-10): gizli kategorideki eski
  // beyan firmanın KENDİ Profilim ekranında da çizilmez ve "(n)" sayısına girmez.
  //
  // 2026-10-10: 46 "İş Güvenliği ve Yangın Ekipmanları" görünür, silah / kolluk
  // dalları gizli. Gizli seçimin (46101500) zinciri kayıtta sektör koduyla
  // birlikte durur; sektör yalnız onun atasıysa "Sektör geneli" çipi OLMAZ.
  const byIdsNames = (names: Record<string, string>) =>
    h.get.mockImplementation((url: string, opts?: { params?: { ids?: string } }) =>
      url.includes("/categories/by-ids")
        ? Promise.resolve({
            data: (opts?.params?.ids ?? "")
              .split(",")
              .filter(Boolean)
              .map((id) => ({ id, code: id, nameTr: names[id] ?? `Ad ${id}`, level: 3, breadcrumb: "" })),
          })
        : Promise.resolve({ data: { items: [], total: 0, truncated: false, counts: { published: 0, draft: 0 } } }),
    );
  const askedIds = () =>
    h.get.mock.calls.filter((c) => String(c[0]).includes("/categories/by-ids")).map((c) => (c[1] as { params: { ids: string } }).params.ids);

  it("gizli daldaki eski beyan ve yalnız onun atası olan sektör çip ve sayı olarak görünmez; adı da sorulmaz", async () => {
    byIdsNames({ "46101500": "Ateşli silahlar", "46000000": "İş Güvenliği ve Yangın Ekipmanları" });
    const profile = {
      ...PROFILE,
      // 46: gizli ailede yaprağıyla; 77: yalnız sektör ("sektörün tamamı"); 39: görünür.
      sellerCategoryIds: ["46000000", "77000000", "39000000"],
      sellerSubCategoryIds: ["46100000", "46101500", "39120000", "39121600"],
    };
    render(<ProfileEditor profile={profile} canEdit />);
    expect(screen.getByText("Faaliyet kategorileri (1)")).toBeInTheDocument();
    expect(await screen.findByText("Ad 39121600")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Ateşli silahlar|İş Güvenliği ve Yangın|46101500|77000000/);
    expect(askedIds().every((ids) => !/\b(46|77)\d{6}\b/.test(ids))).toBe(true);
  });

  it("46 görünür sektör: tamamı beyanı ve görünür seçimi çip olur ve sayılır; aynı sektördeki gizli seçim sayılmaz", async () => {
    byIdsNames({ "46181500": "Koruyucu giysi", "46000000": "İş Güvenliği ve Yangın Ekipmanları", "46101500": "Ateşli silahlar" });
    const whole = { ...PROFILE, sellerCategoryIds: ["46000000"], sellerSubCategoryIds: [] };
    const view = render(<ProfileEditor profile={whole} canEdit />);
    expect(screen.getByText("Faaliyet kategorileri (1)")).toBeInTheDocument();
    expect(await screen.findByText("İş Güvenliği ve Yangın Ekipmanları")).toBeInTheDocument();
    view.unmount();

    const mixed = {
      ...PROFILE,
      sellerCategoryIds: ["46000000"],
      sellerSubCategoryIds: ["46100000", "46101500", "46180000", "46181500", "46182500", "46182501"],
    };
    render(<ProfileEditor profile={mixed} canEdit />);
    // Yalnız koruyucu giysi: gizli aile (4610) ve gizli sınıf (461825) seçimleri sayıya girmez.
    expect(screen.getByText("Faaliyet kategorileri (1)")).toBeInTheDocument();
    expect(await screen.findByText("Koruyucu giysi")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Ateşli silahlar|46101500|46182501/);
    expect(askedIds().every((ids) => !/4610|461825/.test(ids))).toBe(true);
  });

  it("yalnız gizli seçim beyanı olan firma: 'seçilmedi' görür, durum kartı kategoriyi tamam saymaz", () => {
    const profile = { ...PROFILE, sellerCategoryIds: ["46000000"], sellerSubCategoryIds: ["46100000", "46101500"], buyerCategoryIds: [], buyerSubCategoryIds: [] };
    render(<ProfileEditor profile={profile} canEdit />);
    // Özet etiketi sayısız + "Eksik" listesinde aynı ad: tamamlanma hesabı da
    // gizli beyanı saymaz (özet "seçilmedi" derken kart "tamam" demez).
    expect(screen.getAllByText("Faaliyet kategorileri").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/Faaliyet kategorileri \(\d+\)/)).toBeNull();
    expect(screen.getByText(/Seçilmedi — açık talep eşleşmesi/)).toBeInTheDocument();
    // Karşılaştırma: görünür beyanla "Eksik" listesinde kategori yoktur.
    cleanup();
    render(<ProfileEditor profile={{ ...profile, sellerCategoryIds: ["39000000"], sellerSubCategoryIds: [] }} canEdit />);
    expect(screen.getByText("Faaliyet kategorileri (1)")).toBeInTheDocument();
    expect(screen.queryAllByText("Faaliyet kategorileri")).toHaveLength(0);
  });

  it("tekrarlanan hizmet ve tavan sessiz kalmaz: ipucu + sayaç, tavanda pasif (arayüz testi D-294)", () => {
    const { unmount } = render(<ProfileEditor profile={PROFILE} canEdit />);
    expect(screen.getByText("2/20")).toBeInTheDocument();
    const input = screen.getByLabelText("Hizmet ekle");
    fireEvent.change(input, { target: { value: "kablo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Bu hizmet zaten ekli: kablo")).toBeInTheDocument();
    expect(screen.getAllByText(/^Kablo$/)).toHaveLength(1);
    unmount();

    const full = Array.from({ length: 20 }, (_, i) => `Hizmet ${i + 1}`);
    render(<ProfileEditor profile={{ ...PROFILE, services: full }} canEdit />);
    expect(screen.getByText("20/20")).toBeInTheDocument();
    expect(screen.getByLabelText("Hizmet ekle")).toBeDisabled();
    expect(screen.getByText("En fazla 20 hizmet eklenebilir.")).toBeInTheDocument();
  });

  it("hizmet çipi kayıt DTO'sunun uzunluk tavanını aşamaz (derin denetim S069)", () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    const input = screen.getByLabelText("Hizmet ekle");
    expect(input).toHaveAttribute("maxLength", "60");
    const long = "x".repeat(61);
    fireEvent.change(input, { target: { value: long } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByText(long)).not.toBeInTheDocument();
  });

  it("doğrulama çağrısı yalnız düzenleyebilene çizilir, bağlantısıyla (derin denetim S069)", () => {
    const unverified = { ...PROFILE, companyVerificationStatus: "UNVERIFIED" };
    const { unmount } = render(<ProfileEditor profile={unverified} canEdit />);
    expect(screen.getByText("Ücretsiz doğrulanın")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Belgeleri yükle" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
    unmount();
    // Salt-okunur kullanıcı: bağlantı `company:manage` kapılı — kart çizilmez.
    render(<ProfileEditor profile={unverified} canEdit={false} />);
    expect(screen.queryByText("Ücretsiz doğrulanın")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Belgeleri yükle" })).not.toBeInTheDocument();
  });

  it("yetkisiz kullanıcı: salt görünüm, düzenleme kontrolü yok", () => {
    render(<ProfileEditor profile={PROFILE} canEdit={false} />);
    expect(screen.getByText("Demo Firma A.Ş.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Hakkında")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Logoyu değiştir")).not.toBeInTheDocument();
    expect(screen.getByText(/yetkisi gerekir/)).toBeInTheDocument();
    // D-052: company:manage kapılı Firma Bilgileri bağlantısı ve "üstünde
    // düzenleyin, sonra Kaydet" dili salt-okura çizilmez.
    expect(screen.queryByRole("link", { name: /Firma bilgileri/ })).toBeNull();
    expect(screen.queryByText(/sonra Kaydet/)).toBeNull();
    expect(screen.getByText("Firma sayfanız — başkalarının gördüğü hâli.")).toBeInTheDocument();
    // D-138: salt-okurda yayın anahtarı yok (pasif gri anahtar "kapalı" gibi okunuyordu); yalnız durum.
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText("Yayında")).toBeInTheDocument();
  });

  it("düzenleyebilen kullanıcıya Firma bilgileri bağlantısı çizilir", () => {
    render(<ProfileEditor profile={PROFILE} canEdit />);
    expect(screen.getByRole("link", { name: /Firma bilgileri/ })).toHaveAttribute("href", "/company/ayarlar/firma");
  });

  it("satış paneline giremeyen (sell:view yok) kullanıcıya Ürünlerim kartı çizilmez (arayüz testi D-053)", () => {
    setUser({ isOwner: false, roles: ["SATIN_ALMACI"], permissions: ["buy:view", "buy:listing:manage"] });
    render(<ProfileEditor profile={PROFILE} canEdit={false} />);
    expect(screen.queryByRole("region", { name: "Ürünlerim" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ürünleri yönet" })).toBeNull();
  });

  describe("AI ile açıklamayı güçlendir — firma yetkisi VE koltuk (arayüz testi O-105)", () => {
    const button = () => screen.getByRole("button", { name: /AI ile açıklamayı güçlendir/ });

    it("Yönetici hazır seti (işlem izni yok) → pasif + rol nedeni", () => {
      setUser({ isOwner: false, roles: ["YONETICI"], permissions: ["company:manage", "users:manage", "buy:view", "sell:view"] });
      render(<ProfileEditor profile={PROFILE} canEdit />);
      expect(button()).toBeDisabled();
      expect(screen.getByText(/işlem yetkisi gerekir/)).toBeInTheDocument();
    });

    it("koltuk izni var ama firma doğrulanmamış (yetkisiz) → pasif + doğrulama nedeni", () => {
      render(<ProfileEditor profile={{ ...PROFILE, tier: "STANDART" }} canEdit />);
      expect(button()).toBeDisabled();
      expect(screen.getByText(/AI ile güçlendirme firma doğrulaması gerektirir/)).toBeInTheDocument();
      // Ücretsiz dönem: neden cümlesinde paket adı geçmez.
      expect(screen.queryByText(/Silver|Gold|Platinum/)).toBeNull();
    });

    it("tam yetkili (doğrulanmış) firma ve koltuk izni → etkin", () => {
      render(<ProfileEditor profile={PROFILE} canEdit />);
      expect(button()).toBeEnabled();
    });
  });

  /**
   * AI TANITIM ÖNERİSİ — sahip kararı 2026-10-08: "web sitesinden AI ile profil
   * doldurmayı kapat; yalnız profil açıklamasını ürünlerden vb. dolduralım, onu
   * teklif edelim".
   *
   * Düğme artık ne yaptığını söyler (tanıtımı ürünlerden ve firma bilgilerinden
   * yazar), web sitesi SORMAZ ve hizmet/yıl/sosyal bağlantı/logo alanlarına
   * DOKUNMAZ. Kutu boşken öneri açıkça teklif edilir; sonuç kutuya TASLAK olarak
   * gelir, kullanıcı düzenler ve Kaydet'e basar.
   */
  describe("AI tanıtım önerisi (ürünlerden ve firma bilgilerinden)", () => {
    const TASLAK = "Demo Firma olarak İstanbul'da dağıtım panosu üretiyoruz.";
    const yanit = (over: Record<string, unknown> = {}) => ({
      data: { aboutText: TASLAK, productCount: 3, remainingSuggestions: null, ...over },
    });
    const kutu = () => screen.getByLabelText("Hakkında") as HTMLTextAreaElement;

    it("tanıtım BOŞKEN öneri açıkça teklif edilir: başlık + ne yapacağı + düğme", () => {
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null }} canEdit />);
      expect(screen.getByText("Tanıtım metniniz boş")).toBeInTheDocument();
      expect(
        screen.getByText(/Vitrindeki ürünlerinizden ve firma bilgilerinizden kısa bir tanıtım taslağı yazalım/),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" })).toBeEnabled();
      // Dolu kutunun düğmesi bu hâlde çizilmez.
      expect(screen.queryByRole("button", { name: "AI ile yeniden yaz" })).toBeNull();
    });

    it("tanıtım DOLUYKEN teklif kartı yok; aynı eylem 'yeniden yaz' olarak durur", () => {
      render(<ProfileEditor profile={PROFILE} canEdit />);
      expect(screen.queryByText("Tanıtım metniniz boş")).toBeNull();
      expect(screen.getByRole("button", { name: "AI ile yeniden yaz" })).toBeEnabled();
      expect(screen.getByText(/kutudaki metnin yerine gelir/)).toBeInTheDocument();
    });

    it("eski vaat ve site sorma kutusu YOK: 'web sitemden doldur', site adresi alanı, logo adayı çizilmez", () => {
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null, website: null }} canEdit />);
      expect(screen.queryByRole("button", { name: /Web sitemden/ })).toBeNull();
      expect(screen.queryByText(/Web sitenizi okuyup/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));
      // Site yokken de SORMADAN başlar.
      expect(screen.queryByLabelText("Web sitenizin adresi")).toBeNull();
      expect(h.post).toHaveBeenCalledTimes(1);
    });

    it("tıklayınca uca gider: gövdede web sitesi YOK, taslaktaki sektör ve hizmetler var", async () => {
      h.post.mockResolvedValue(yanit());
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null, website: "ornekfirma.com" }} canEdit />);
      // Kaydedilmemiş sektör değişikliği de gider (sunucu DB'deki eski değeri okumasın).
      fireEvent.change(screen.getByLabelText("Sektör"), { target: { value: "Elektrik panoları" } });
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));

      await waitFor(() => expect(h.post).toHaveBeenCalled());
      expect(h.post.mock.calls[0][0]).toBe("/company/ai/profile-enrich");
      expect(h.post.mock.calls[0][1]).toEqual({ industry: "Elektrik panoları", services: ["Kablo", "Pano"] });
      expect(h.post.mock.calls[0][1]).not.toHaveProperty("website");
      // Hata tek toast'ta gösterilir (interceptor susar).
      expect(h.post.mock.calls[0][2]).toMatchObject({ skipErrorToast: true });
    });

    it("sonuç kutuya TASLAK olarak gelir: düzenlenebilir, kaydedilmemiş; Kaydet yalnız tanıtımı yollar", async () => {
      h.post.mockResolvedValue(yanit());
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));

      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(toast.success).toHaveBeenCalledWith("Taslak hazır — kontrol edip Kaydet'e basın");
      // Otomatik KAYIT YOK — kullanıcı düzenleyip kendi kaydeder.
      expect(h.update).not.toHaveBeenCalled();
      expect(screen.getByText("Kaydedilmemiş değişiklikler var.")).toBeInTheDocument();

      fireEvent.change(kutu(), { target: { value: `${TASLAK} Pano montajı da yapıyoruz.` } });
      fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
      await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
      // Hizmet, kuruluş yılı, sosyal bağlantı ve logoya DOKUNULMADI.
      expect(h.update.mock.calls[0][0]).toEqual({ aboutText: `${TASLAK} Pano montajı da yapıyoruz.` });
    });

    it("model fazladan alan döndürse de hizmet / yıl / sosyal bağlantı alanları değişmez", async () => {
      h.post.mockResolvedValue(
        yanit({ services: ["Uydurma hizmet"], foundedYear: 1998, linkedinUrl: "https://linkedin.com/company/x" }),
      );
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));

      expect(screen.queryByText("Uydurma hizmet")).toBeNull();
      expect(screen.getByText("Kablo")).toBeInTheDocument();
      expect((screen.getByLabelText("Kuruluş yılı") as HTMLInputElement).value).toBe("2015");
      expect((screen.getByLabelText("LinkedIn") as HTMLInputElement).value).toBe("");
    });

    it("vitrinde ürün yoksa yine yazar ve ürün eklemenin öneriyi zenginleştireceğini söyler", async () => {
      h.post.mockResolvedValue(yanit({ productCount: 0 }));
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));

      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      const not = screen.getByText(/taslak yalnız firma bilgilerinizden yazıldı\. Ürün ekledikçe öneri zenginleşir/);
      expect(within(not).getByRole("link", { name: "Ürünleri yönet" })).toHaveAttribute(
        "href",
        "/company/satis/urunlerim",
      );
    });

    it("TASLAK KAYBOLMAZ: taslağın altındaki 'Ürünleri yönet' bağlantısı sormadan gitmez; 'Kal' taslağı korur", async () => {
      // Sunucu taslağın kopyasını tutmaz; bağlantı sormadan giderse ömürlük 6
      // öneriden ve günlük 3 denemeden biri, kaydedilmemiş taslakla birlikte yanar.
      h.post.mockResolvedValue(yanit({ productCount: 0 }));
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));

      const not = screen.getByText(/Ürün ekledikçe öneri zenginleşir/);
      const link = within(not).getByRole("link", { name: "Ürünleri yönet" });
      // fireEvent.click, olay iptal edildiyse (preventDefault) false döner.
      expect(fireEvent.click(link)).toBe(false);
      expect(h.confirm).toHaveBeenCalledTimes(1);
      expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: "Ayrıl", destructive: true }));
      // Onay sözü çözülsün (varsayılan: kal) — gezinme yok, taslak kutuda.
      await h.confirm.mock.results[0]!.value;
      await waitFor(() => expect(h.push).not.toHaveBeenCalled());
      expect(kutu().value).toBe(TASLAK);
      expect(screen.getByText("Kaydedilmemiş değişiklikler var.")).toBeInTheDocument();
    });

    it("TASLAK KAYBOLMAZ: 'Ayrıl' denirse bağlantının adresine gidilir; kaydedildikten sonra sorulmaz", async () => {
      h.post.mockResolvedValue(yanit({ productCount: 0 }));
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      const link = () =>
        within(screen.getByText(/Ürün ekledikçe öneri zenginleşir/)).getByRole("link", { name: "Ürünleri yönet" });

      h.confirm.mockResolvedValueOnce(true);
      expect(fireEvent.click(link())).toBe(false);
      await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/satis/urunlerim"));

      // Taslak kaydedilince editör temizdir: aynı adrese giden bağlantı artık
      // sormaz (yakalama dinleyicisi kalkar; tıklama olağan gezinmeye bırakılır).
      // Taslağın notu da kaydedilen taslakla birlikte gitti (REV-1) → geriye
      // Ürünlerim kartının "Ürünleri yönet" bağlantısı kalır.
      h.confirm.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
      await waitFor(() => expect(h.update).toHaveBeenCalledWith({ aboutText: TASLAK }));
      await waitFor(() => expect(screen.queryByText("Kaydedilmemiş değişiklikler var.")).toBeNull());
      expect(screen.queryByText(/Ürün ekledikçe öneri zenginleşir/)).toBeNull();
      const kalan = screen.getByRole("link", { name: "Ürünleri yönet" });
      const sessiz = new MouseEvent("click", { bubbles: true, cancelable: true });
      // Olağan gezinmeyi jsdom denemesin diye olay belge düzeyinde (yakalamadan SONRA) durdurulur.
      const durdur = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
      };
      kalan.addEventListener("click", durdur, { once: true });
      kalan.dispatchEvent(sessiz);
      expect(h.confirm).not.toHaveBeenCalled();
    });

    it("ürünlü firmada 'ürün ekleyin' notu çıkmaz", async () => {
      h.post.mockResolvedValue(yanit({ productCount: 3 }));
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(screen.queryByText(/Ürün ekledikçe öneri zenginleşir/)).toBeNull();
    });

    it("dolu kutunun yerine yazılan önceki metin 'Önceki metne dön' ile geri gelir", async () => {
      h.post.mockResolvedValue(yanit());
      render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "AI ile yeniden yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));

      fireEvent.click(screen.getByRole("button", { name: "Önceki metne dön" }));
      expect(kutu().value).toBe("Biz demo firmayız.");
      expect(screen.queryByRole("button", { name: "Önceki metne dön" })).toBeNull();
    });

    it("tam erişimi olmayan firmaya kalan öneri hakkı ve doğrulamanın sınırı kaldıracağı söylenir", async () => {
      h.post.mockResolvedValue(yanit({ remainingSuggestions: 4 }));
      render(
        <ProfileEditor
          profile={{ ...PROFILE, aboutText: null, tier: "STANDART", companyVerificationStatus: "UNVERIFIED" }}
          canEdit
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(
        screen.getByText(/Kalan AI tanıtım önerisi hakkınız: 4\. Firmanızı doğrulayınca bu sınır kalkar\./),
      ).toBeInTheDocument();
    });

    it("tam erişimli firmada (kalan hak null) hak satırı çizilmez", async () => {
      h.post.mockResolvedValue(yanit());
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(screen.queryByText(/Kalan AI tanıtım önerisi hakkınız/)).toBeNull();
    });

    it("sunucu reddi (hak doldu / günlük sınır) kutuya dokunmaz; sunucunun metni gösterilir", async () => {
      h.post.mockRejectedValue(
        Object.assign(new Error("Request failed with status code 403"), {
          isAxiosError: true,
          response: {
            status: 403,
            data: {
              message:
                "Doğrulanmamış firmalar toplam 6 AI tanıtım önerisi alabilir; hakkınız doldu. Daha fazlası için firmanızı doğrulayın.",
            },
          },
        }),
      );
      render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "AI ile yeniden yaz" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(vi.mocked(toast.error).mock.calls[0]![0]).toMatch(/toplam 6 AI tanıtım önerisi/);
      expect(kutu().value).toBe("Biz demo firmayız.");
      expect(screen.queryByRole("button", { name: "Önceki metne dön" })).toBeNull();
    });

    it("çağrı sürerken düğme pasiftir; çift tık ikinci istek atmaz", async () => {
      let coz: (v: unknown) => void = () => {};
      h.post.mockReturnValue(new Promise((r) => (coz = r)));
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null }} canEdit />);
      const dugme = screen.getByRole("button", { name: "Tanıtımı AI ile yaz" });
      fireEvent.click(dugme);
      fireEvent.click(dugme);

      const suren = await screen.findByRole("button", { name: "Taslak yazılıyor…" });
      expect(suren).toBeDisabled();
      expect(h.post).toHaveBeenCalledTimes(1);
      // Kutu da kilitli: araya yazılan metin taslakla ezilmesin.
      expect(kutu()).toBeDisabled();
      coz(yanit());
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(kutu()).toBeEnabled();
    });
  });

  /**
   * Canlı doğrulama 2026-10-09, PD-01: kaydedilmemiş AI taslağı tarayıcının Geri
   * düğmesinde, dil değişiminde ve bildirim tıklamasında SORMADAN siliniyordu
   * (ortak koruma yalnız bağlantı tıklaması + yenileme + sekme kapatmayı
   * yakalar); harcanan deneme geri gelmiyordu. Ortak kanca değişmedi: taslak
   * kullanıcıya bağlı `sessionStorage` anahtarında tutulur ve Profilim yeniden
   * açılınca geri yüklenir. Üç çıkışın ortak sonucu "sayfa söküldü, sonra
   * yeniden bağlandı" olduğundan testler onu kurar (unmount → render).
   */
  describe("Hakkında taslağı sayfadan çıkınca kaybolmaz (canlı doğrulama PD-01)", () => {
    const TASLAK = "Demo Firma olarak İstanbul'da dağıtım panosu üretiyoruz.";
    const KULLANICI = { ...OWNER_USER, id: "u1" };
    const ANAHTAR = "rothern:profile-about-draft:u1";
    const GERI_YUKLENDI = /Kaydedilmemiş taslağınız geri yüklendi — saklamak için Kaydet'e, silmek için Vazgeç'e basın\./;
    const CUBUK = "Kaydedilmemiş değişiklikler var.";
    const yanit = (over: Record<string, unknown> = {}) => ({
      data: { aboutText: TASLAK, productCount: 3, remainingSuggestions: null, ...over },
    });
    const kutu = () => screen.getByLabelText("Hakkında") as HTMLTextAreaElement;
    const saklanan = () => JSON.parse(sessionStorage.getItem(ANAHTAR) ?? "null") as Record<string, unknown> | null;
    const sakla = (kayit: Record<string, unknown>, anahtar = ANAHTAR) =>
      sessionStorage.setItem(anahtar, JSON.stringify({ v: 1, companyId: "c1", result: null, ...kayit }));
    /** Doğrulanmamış firma: kalan hak satırı da çizilir. */
    const SINIRLI: CompanyProfile = { ...PROFILE, tier: "STANDART", companyVerificationStatus: "UNVERIFIED" };

    beforeEach(() => {
      setUser(KULLANICI);
    });

    it("AI taslağı depoya yazılır; sayfa yeniden açılınca taslak, kaydet çubuğu, sonuç notu ve tek satır not geri gelir — yeni deneme harcanmaz", async () => {
      h.post.mockResolvedValue(yanit({ productCount: 0, remainingSuggestions: 4 }));
      const ilk = render(<ProfileEditor profile={SINIRLI} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "AI ile yeniden yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      await waitFor(() =>
        expect(saklanan()).toEqual({
          v: 1,
          companyId: "c1",
          text: TASLAK,
          result: { productCount: 0, remaining: 4, previous: "Biz demo firmayız." },
        }),
      );
      // Taze taslakta "geri yüklendi" notu yok.
      expect(screen.queryByText(GERI_YUKLENDI)).toBeNull();

      // Geri → İleri / dil değişimi / bildirim tıklaması: sayfa sökülür, sunucudaki metin hâlâ eski.
      ilk.unmount();
      render(<ProfileEditor profile={SINIRLI} canEdit />);

      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(screen.getByText(CUBUK)).toBeInTheDocument();
      expect(screen.getByText(GERI_YUKLENDI)).toBeInTheDocument();
      expect(screen.getByText(/Ürün ekledikçe öneri zenginleşir/)).toBeInTheDocument();
      expect(screen.getByText(/Kalan AI tanıtım önerisi hakkınız: 4\./)).toBeInTheDocument();
      expect(h.post).toHaveBeenCalledTimes(1);
      expect(h.update).not.toHaveBeenCalled();
      // Okumak silmez: bir yenileme daha aynı taslağı bulur.
      expect(saklanan()).toMatchObject({ text: TASLAK });
    });

    it("yanıt sayfadan ÇIKTIKTAN sonra gelirse de taslak saklanır ve dönüşte geri yüklenir; başka sayfada 'taslak hazır' bildirimi çıkmaz", async () => {
      // Yazım 2-6 sn sürer: kullanıcı beklerken bildirime ya da Geri'ye basabilir.
      let coz: (v: unknown) => void = () => {};
      h.post.mockReturnValue(new Promise((r) => (coz = r)));
      const ilk = render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "AI ile yeniden yaz" }));
      await screen.findByRole("button", { name: "Taslak yazılıyor…" });
      ilk.unmount();

      coz(yanit({ productCount: 0 }));
      await waitFor(() =>
        expect(saklanan()).toEqual({
          v: 1,
          companyId: "c1",
          text: TASLAK,
          result: { productCount: 0, remaining: null, previous: "Biz demo firmayız." },
        }),
      );
      expect(toast.success).not.toHaveBeenCalled();

      render(<ProfileEditor profile={PROFILE} canEdit />);
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(screen.getByText(CUBUK)).toBeInTheDocument();
      expect(screen.getByText(GERI_YUKLENDI)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Önceki metne dön" })).toBeInTheDocument();
      expect(h.post).toHaveBeenCalledTimes(1);
    });

    it("geri yüklenen taslakta 'Önceki metne dön' çalışır; metin kayıtlı hâline dönünce çubuk, not ve saklanan kopya gider", async () => {
      sakla({ text: TASLAK, result: { productCount: 3, remaining: null, previous: "Biz demo firmayız." } });
      render(<ProfileEditor profile={PROFILE} canEdit />);
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(screen.getByText(GERI_YUKLENDI)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Önceki metne dön" }));
      expect(kutu().value).toBe("Biz demo firmayız.");
      await waitFor(() => expect(sessionStorage.getItem(ANAHTAR)).toBeNull());
      expect(screen.queryByText(GERI_YUKLENDI)).toBeNull();
      expect(screen.queryByText(CUBUK)).toBeNull();
    });

    it("'Önceki metne dön' kaydedilmemiş bir metne dönünce depodaki kopya ELLE taslaktır: yeniden açılışta AI taslağının notu geri gelmez (gözden geçirme REV-1)", async () => {
      h.post.mockResolvedValue(yanit({ productCount: 0, remainingSuggestions: 4 }));
      const ilk = render(<ProfileEditor profile={SINIRLI} canEdit />);
      fireEvent.change(kutu(), { target: { value: "Elle başladığım metin." } });
      fireEvent.click(screen.getByRole("button", { name: "AI ile yeniden yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      await waitFor(() => expect(saklanan()).toMatchObject({ text: TASLAK, result: { productCount: 0 } }));

      fireEvent.click(screen.getByRole("button", { name: "Önceki metne dön" }));
      // Kutu hâlâ kirli (dönülen metin kaydedilmemiş): kopya durur, ama sonuç notu taşımaz.
      await waitFor(() =>
        expect(saklanan()).toEqual({ v: 1, companyId: "c1", text: "Elle başladığım metin.", result: null }),
      );

      ilk.unmount();
      render(<ProfileEditor profile={SINIRLI} canEdit />);
      await waitFor(() => expect(kutu().value).toBe("Elle başladığım metin."));
      expect(screen.getByText(GERI_YUKLENDI)).toBeInTheDocument();
      expect(screen.queryByText(/taslak yalnız firma bilgilerinizden yazıldı/)).toBeNull();
      expect(screen.queryByText(/Kalan AI tanıtım önerisi hakkınız/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Önceki metne dön" })).toBeNull();
    });

    it("elle yazılan kaydedilmemiş metin de korunur (dil değişimi kutuyu boşaltıyordu)", async () => {
      const ilk = render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.change(kutu(), { target: { value: "Elle yazdığım yeni tanıtım." } });
      await waitFor(() => expect(saklanan()).toMatchObject({ text: "Elle yazdığım yeni tanıtım.", result: null }));
      ilk.unmount();

      render(<ProfileEditor profile={PROFILE} canEdit />);
      await waitFor(() => expect(kutu().value).toBe("Elle yazdığım yeni tanıtım."));
      expect(screen.getByText(CUBUK)).toBeInTheDocument();
      expect(screen.getByText(GERI_YUKLENDI)).toBeInTheDocument();
      // AI önerisi değil: öneriye özgü notlar yok.
      expect(screen.queryByRole("button", { name: "Önceki metne dön" })).toBeNull();
      expect(screen.queryByText(/Kalan AI tanıtım önerisi hakkınız/)).toBeNull();
    });

    it("Kaydet: saklanan kopya ve 'geri yüklendi' notu gider; yeniden açılışta geri yükleme olmaz", async () => {
      sakla({ text: TASLAK, result: { productCount: 3, remaining: null, previous: "Biz demo firmayız." } });
      const ilk = render(<ProfileEditor profile={PROFILE} canEdit />);
      await waitFor(() => expect(kutu().value).toBe(TASLAK));

      fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
      await waitFor(() => expect(h.update).toHaveBeenCalledWith({ aboutText: TASLAK }));
      await waitFor(() => expect(screen.queryByText(CUBUK)).toBeNull());
      expect(sessionStorage.getItem(ANAHTAR)).toBeNull();
      expect(screen.queryByText(GERI_YUKLENDI)).toBeNull();

      ilk.unmount();
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: TASLAK }} canEdit />);
      expect(kutu().value).toBe(TASLAK);
      expect(screen.queryByText(CUBUK)).toBeNull();
      expect(screen.queryByText(GERI_YUKLENDI)).toBeNull();
    });

    it("kayıt BAŞARISIZSA taslak depoda kalır", async () => {
      h.update.mockRejectedValue(new Error("ağ hatası"));
      sakla({ text: TASLAK });
      render(<ProfileEditor profile={PROFILE} canEdit />);
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(saklanan()).toMatchObject({ text: TASLAK });
      expect(screen.getByText(CUBUK)).toBeInTheDocument();
    });

    it("Vazgeç: taslakla birlikte saklanan kopya da silinir; yeniden açılışta geri gelmez", async () => {
      sakla({ text: TASLAK, result: { productCount: 0, remaining: 4, previous: "Biz demo firmayız." } });
      const ilk = render(<ProfileEditor profile={SINIRLI} canEdit />);
      await waitFor(() => expect(kutu().value).toBe(TASLAK));

      fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
      expect(kutu().value).toBe("Biz demo firmayız.");
      await waitFor(() => expect(sessionStorage.getItem(ANAHTAR)).toBeNull());
      expect(screen.queryByText(GERI_YUKLENDI)).toBeNull();

      ilk.unmount();
      render(<ProfileEditor profile={SINIRLI} canEdit />);
      expect(kutu().value).toBe("Biz demo firmayız.");
      expect(screen.queryByText(CUBUK)).toBeNull();
    });

    /**
     * İKİNCİ CANLI DOĞRULAMA (2026-10-09) — PD-R1 / PD-R3 / PD-R4.
     */
    const CUBUK_GERI = "“Hakkında” taslağınız geri yüklendi.";
    const cubuk = () => screen.getByText(CUBUK).closest('[role="status"]') as HTMLElement;

    it("PD-R1: geri yüklenen taslak kayıtlı metne döndükten sonra yazılan TAZE metnin altında 'geri yüklendi' notu yeniden çıkmaz", async () => {
      sakla({ text: "Yarım kalan taslak." });
      render(<ProfileEditor profile={PROFILE} canEdit />);
      await waitFor(() => expect(kutu().value).toBe("Yarım kalan taslak."));
      expect(screen.getByText(GERI_YUKLENDI)).toBeInTheDocument();

      // Kutu elle kayıtlı metne döndü: geri yüklenen taslak artık kutuda değil.
      fireEvent.change(kutu(), { target: { value: "Biz demo firmayız." } });
      expect(screen.queryByText(GERI_YUKLENDI)).toBeNull();
      expect(screen.queryByText(CUBUK)).toBeNull();

      // Yeni metin YAZILDI, geri yüklenmedi.
      fireEvent.change(kutu(), { target: { value: "Yepyeni bir tanıtım cümlesi." } });
      expect(screen.getByText(CUBUK)).toBeInTheDocument();
      expect(screen.queryByText(GERI_YUKLENDI)).toBeNull();
      expect(screen.queryByText(CUBUK_GERI)).toBeNull();
    });

    it("PD-R1: geri yüklenen AI taslağından 'Önceki metne dön' ile kayıtlı metne dönüp yazınca da not çıkmaz", async () => {
      sakla({ text: TASLAK, result: { productCount: 3, remaining: null, previous: "Biz demo firmayız." } });
      render(<ProfileEditor profile={PROFILE} canEdit />);
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      fireEvent.click(screen.getByRole("button", { name: "Önceki metne dön" }));
      expect(kutu().value).toBe("Biz demo firmayız.");

      fireEvent.change(kutu(), { target: { value: "Biz demo firmayız. Yeni cümle." } });
      expect(screen.getByText(CUBUK)).toBeInTheDocument();
      expect(screen.queryByText(GERI_YUKLENDI)).toBeNull();
      expect(screen.queryByText(CUBUK_GERI)).toBeNull();
    });

    it("PD-R3: ayrılma diyaloğunda 'Ayrıl' denince saklanan taslak da silinir — dönüşte metin geri gelmez", async () => {
      const ilk = render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.change(kutu(), { target: { value: "Vazgeçeceğim metin." } });
      await waitFor(() => expect(saklanan()).toMatchObject({ text: "Vazgeçeceğim metin." }));

      h.confirm.mockResolvedValueOnce(true);
      const link = await screen.findByRole("link", { name: "Ürünleri yönet" });
      expect(fireEvent.click(link)).toBe(false);
      expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: "Ayrıl" }));
      await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/satis/urunlerim"));
      // Diyalog "ayrılırsanız kaybolur" dedi ve kullanıcı onayladı.
      expect(sessionStorage.getItem(ANAHTAR)).toBeNull();

      ilk.unmount();
      render(<ProfileEditor profile={PROFILE} canEdit />);
      // Depo okunsun diye bir tur bekle; kutu kayıtlı metinde kalır.
      await waitFor(() => expect(screen.getByRole("link", { name: "Ürünleri yönet" })).toBeInTheDocument());
      expect(kutu().value).toBe("Biz demo firmayız.");
      expect(screen.queryByText(CUBUK)).toBeNull();
      expect(screen.queryByText(GERI_YUKLENDI)).toBeNull();
    });

    it("PD-R3: diyalogda 'Formda kal' denirse saklanan taslak durur; diyaloğun sorulmadığı çıkışta (sayfa sökülür) taslak geri gelir", async () => {
      const ilk = render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.change(kutu(), { target: { value: "Saklanacak metin." } });
      await waitFor(() => expect(saklanan()).toMatchObject({ text: "Saklanacak metin." }));

      // Varsayılan onay: "Formda kal".
      const link = await screen.findByRole("link", { name: "Ürünleri yönet" });
      expect(fireEvent.click(link)).toBe(false);
      await h.confirm.mock.results[0]!.value;
      await waitFor(() => expect(h.push).not.toHaveBeenCalled());
      expect(saklanan()).toMatchObject({ text: "Saklanacak metin." });

      // Geri düğmesi / dil değişimi / bildirim tıklaması: diyalog yok, taslak korunur.
      ilk.unmount();
      render(<ProfileEditor profile={PROFILE} canEdit />);
      await waitFor(() => expect(kutu().value).toBe("Saklanacak metin."));
      expect(screen.getByText(GERI_YUKLENDI)).toBeInTheDocument();
    });

    it("PD-R4: geri yüklenen taslak kaydet çubuğunda da söylenir (sayfa üstten açılır, not kutunun altında kalır)", async () => {
      sakla({ text: TASLAK });
      render(<ProfileEditor profile={PROFILE} canEdit />);
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      // Çubuk sabit (her zaman görünür): genel cümle + geri yükleme cümlesi + Kaydet / Vazgeç.
      const bar = cubuk();
      expect(bar.className).toMatch(/\bfixed\b/);
      expect(within(bar).getByText(CUBUK_GERI)).toBeInTheDocument();
      expect(within(bar).getByRole("button", { name: "Kaydet" })).toBeInTheDocument();
      expect(within(bar).getByRole("button", { name: "Vazgeç" })).toBeInTheDocument();
      // Ayrıntılı not kutunun altında durmaya devam eder.
      expect(screen.getByText(GERI_YUKLENDI)).toBeInTheDocument();

      fireEvent.click(within(bar).getByRole("button", { name: "Vazgeç" }));
      expect(screen.queryByText(CUBUK_GERI)).toBeNull();
    });

    it("PD-R4: taze yazılan metinde ve başka alan değişikliğinde çubuk 'geri yüklendi' demez", () => {
      render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.change(kutu(), { target: { value: "Şimdi yazdığım metin." } });
      expect(screen.getByText(CUBUK)).toBeInTheDocument();
      expect(screen.queryByText(CUBUK_GERI)).toBeNull();
    });

    it("yeni AI taslağı geri yüklenenin yerine geçince 'geri yüklendi' notu kalkar; depodaki kopya yenisidir", async () => {
      sakla({ text: "Yarım kalan eski taslak." });
      h.post.mockResolvedValue(yanit());
      render(<ProfileEditor profile={PROFILE} canEdit />);
      await waitFor(() => expect(kutu().value).toBe("Yarım kalan eski taslak."));
      expect(screen.getByText(GERI_YUKLENDI)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "AI ile yeniden yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(screen.queryByText(GERI_YUKLENDI)).toBeNull();
      await waitFor(() =>
        expect(saklanan()).toMatchObject({
          text: TASLAK,
          result: { productCount: 3, remaining: null, previous: "Yarım kalan eski taslak." },
        }),
      );
    });

    it("sunucudan profil yeniden gelince (refetch) geri yüklenen taslak ezilmez", async () => {
      sakla({ text: TASLAK });
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
      const wrap = (p: CompanyProfile) => (
        <QueryClientProvider client={qc}>
          <ProfileEditor profile={p} canEdit />
        </QueryClientProvider>
      );
      const { rerender } = rtlRender(wrap(PROFILE));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      rerender(wrap({ ...PROFILE, industry: "Makine" }));
      expect((screen.getByLabelText("Sektör") as HTMLInputElement).value).toBe("Makine");
      expect(kutu().value).toBe(TASLAK);
      expect(screen.getByText(GERI_YUKLENDI)).toBeInTheDocument();
      expect(saklanan()).toMatchObject({ text: TASLAK });
    });

    it("kayıtlı metnin AYNISI taslak sayılmaz (başka sekmede kaydedilmiş): geri yüklenmez, depodan silinir", async () => {
      sakla({ text: "Biz demo firmayız." });
      render(<ProfileEditor profile={PROFILE} canEdit />);
      await waitFor(() => expect(sessionStorage.getItem(ANAHTAR)).toBeNull());
      expect(kutu().value).toBe("Biz demo firmayız.");
      expect(screen.queryByText(CUBUK)).toBeNull();
      expect(screen.queryByText(GERI_YUKLENDI)).toBeNull();
    });

    it("başka KULLANICININ ve başka FİRMANIN taslağı uygulanmaz", async () => {
      sakla({ text: "Başka hesabın taslağı." }, "rothern:profile-about-draft:u2");
      sakla({ text: "Başka firmanın taslağı.", companyId: "c2" });
      render(<ProfileEditor profile={PROFILE} canEdit />);
      // Başka firmanın kaydı okunmaz ve silinir; başka hesabın anahtarına dokunulmaz.
      await waitFor(() => expect(sessionStorage.getItem(ANAHTAR)).toBeNull());
      expect(kutu().value).toBe("Biz demo firmayız.");
      expect(screen.queryByText(CUBUK)).toBeNull();
      expect(sessionStorage.getItem("rothern:profile-about-draft:u2")).not.toBeNull();
    });

    it("salt-okur kullanıcıda (company:manage yok) taslak okunmaz, depoya dokunulmaz", () => {
      sakla({ text: TASLAK });
      render(<ProfileEditor profile={PROFILE} canEdit={false} />);
      expect(screen.queryByLabelText("Hakkında")).toBeNull();
      expect(screen.queryByText(TASLAK)).toBeNull();
      expect(screen.queryByText(CUBUK)).toBeNull();
      expect(saklanan()).toMatchObject({ text: TASLAK });
    });

    it("oturum anlık görüntüsünde kullanıcı kimliği yoksa depo kullanılmaz (taslak yalnız sayfada yaşar)", async () => {
      setUser(OWNER_USER);
      render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.change(kutu(), { target: { value: "Kimliksiz taslak" } });
      expect(screen.getByText(CUBUK)).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText(CUBUK)).toBeInTheDocument());
      const anahtarlar = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i) ?? "");
      expect(anahtarlar.filter((k) => k.startsWith("rothern:profile-about-draft"))).toEqual([]);
    });
  });

  /**
   * Canlı doğrulama PD-05: sonuç notu `AboutEditor`ın yerel durumuydu; Vazgeç
   * kutuyu kayıtlı (boş) metne döndürünce "taslak yalnız firma bilgilerinizden
   * yazıldı…" notu boş kutunun altında kalıyordu. Ürünlü, tam erişimli firmada
   * ise gösterecek satırı olmayan BOŞ bir `role="status"` kabı çiziliyordu.
   */
  describe("sonuç notu taslakla birlikte yaşar (canlı doğrulama PD-05)", () => {
    const TASLAK = "Demo Firma olarak İstanbul'da dağıtım panosu üretiyoruz.";
    const yanit = (over: Record<string, unknown> = {}) => ({
      data: { aboutText: TASLAK, productCount: 3, remainingSuggestions: null, ...over },
    });
    const kutu = () => screen.getByLabelText("Hakkında") as HTMLTextAreaElement;
    /** Hakkında bölümünün kökü: kutu sarmalayıcısının (data-slot="control") üstü. */
    const bolum = () => kutu().closest('[data-slot="control"]')!.parentElement as HTMLElement;

    it("Vazgeç: boş kutunun altında öneriye ait hiçbir not kalmaz; teklif kartı geri gelir", async () => {
      h.post.mockResolvedValue(yanit({ productCount: 0, remainingSuggestions: 5 }));
      render(
        <ProfileEditor
          profile={{ ...PROFILE, aboutText: null, tier: "STANDART", companyVerificationStatus: "UNVERIFIED" }}
          canEdit
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(within(bolum()).getByRole("status")).toHaveTextContent(/Ürün ekledikçe öneri zenginleşir/);
      expect(within(bolum()).getByRole("status")).toHaveTextContent(/Kalan AI tanıtım önerisi hakkınız: 5\./);

      fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
      expect(kutu().value).toBe("");
      expect(screen.getByText("Tanıtım metniniz boş")).toBeInTheDocument();
      expect(screen.queryByText(/taslak yalnız firma bilgilerinizden yazıldı/)).toBeNull();
      expect(screen.queryByText(/Kalan AI tanıtım önerisi hakkınız/)).toBeNull();
      expect(within(bolum()).queryByRole("status")).toBeNull();
    });

    it("Vazgeç: dolu kutunun yerine yazılan taslakta 'Önceki metne dön' notu da gider", async () => {
      h.post.mockResolvedValue(yanit());
      render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "AI ile yeniden yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(screen.getByRole("button", { name: "Önceki metne dön" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
      expect(kutu().value).toBe("Biz demo firmayız.");
      expect(screen.queryByRole("button", { name: "Önceki metne dön" })).toBeNull();
      expect(within(bolum()).queryByRole("status")).toBeNull();
    });

    it("gösterecek satır yoksa boş durum kabı çizilmez (ürünlü, tam erişimli firma, boş kutu)", async () => {
      h.post.mockResolvedValue(yanit());
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      expect(within(bolum()).queryByRole("status")).toBeNull();
    });

    it("'Önceki metne dön'den sonra geriye satır kalmadıysa kap da kalkar", async () => {
      h.post.mockResolvedValue(yanit());
      render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "AI ile yeniden yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK));
      fireEvent.click(screen.getByRole("button", { name: "Önceki metne dön" }));
      expect(within(bolum()).queryByRole("status")).toBeNull();
    });

    /**
     * Gözden geçirme REV-1: PD-05 yalnız Vazgeç için kapanmıştı. Taslak kutudan
     * BAŞKA bir yoldan çıkınca ("Önceki metne dön", elle silme, Kaydet) not
     * yerinde kalıyordu — `aboutResult`a yalnız Vazgeç dokunuyordu.
     */
    describe("taslak kutudan Vazgeç dışındaki yollardan çıkınca da not gider (gözden geçirme REV-1)", () => {
      /** Doğrulanmamış, vitrini boş firma: hem "ürünsüz yazıldı" hem kalan hak satırı çizilir. */
      const SINIRLI: CompanyProfile = { ...PROFILE, tier: "STANDART", companyVerificationStatus: "UNVERIFIED" };
      const URUNSUZ = /taslak yalnız firma bilgilerinizden yazıldı/;
      const KALAN = /Kalan AI tanıtım önerisi hakkınız/;
      const CUBUK = "Kaydedilmemiş değişiklikler var.";
      const taslakYaz = async (dugme: string) => {
        fireEvent.click(screen.getByRole("button", { name: dugme }));
        await waitFor(() => expect(kutu().value).toBe(TASLAK));
        expect(within(bolum()).getByRole("status")).toHaveTextContent(URUNSUZ);
      };
      const notYok = () => {
        expect(screen.queryByText(URUNSUZ)).toBeNull();
        expect(screen.queryByText(KALAN)).toBeNull();
        expect(screen.queryByRole("button", { name: "Önceki metne dön" })).toBeNull();
        expect(within(bolum()).queryByRole("status")).toBeNull();
      };

      beforeEach(() => {
        h.post.mockResolvedValue(yanit({ productCount: 0, remainingSuggestions: 5 }));
      });

      it("(A) 'Önceki metne dön': kutu kayıtlı metne döner, çubuk kapanır — kayıtlı metnin altında taslağın notu kalmaz", async () => {
        render(<ProfileEditor profile={SINIRLI} canEdit />);
        await taslakYaz("AI ile yeniden yaz");

        fireEvent.click(screen.getByRole("button", { name: "Önceki metne dön" }));
        expect(kutu().value).toBe("Biz demo firmayız.");
        expect(screen.queryByText(CUBUK)).toBeNull();
        notYok();
      });

      it("(B) elle silme: taslak silinip kutu boş kayıtlı hâline dönünce teklif kartı geri gelir, altında not kalmaz", async () => {
        render(<ProfileEditor profile={{ ...SINIRLI, aboutText: null }} canEdit />);
        await taslakYaz("Tanıtımı AI ile yaz");

        // Tümünü seç + sil.
        fireEvent.change(kutu(), { target: { value: "" } });
        expect(kutu().value).toBe("");
        expect(screen.getByText("Tanıtım metniniz boş")).toBeInTheDocument();
        expect(screen.queryByText(CUBUK)).toBeNull();
        notYok();
      });

      it("giden not geri gelmez: kutu boşaldıktan sonra elle yazılan metnin altında 'taslak … yazıldı' çıkmaz", async () => {
        render(<ProfileEditor profile={{ ...SINIRLI, aboutText: null }} canEdit />);
        await taslakYaz("Tanıtımı AI ile yaz");
        fireEvent.change(kutu(), { target: { value: "" } });

        fireEvent.change(kutu(), { target: { value: "Kendi yazdığım tanıtım." } });
        expect(screen.getByText(CUBUK)).toBeInTheDocument();
        notYok();
      });

      it("'Önceki metne dön' KAYDEDİLMEMİŞ bir metne dönse de (kutu hâlâ kirli) taslağın notu gider", async () => {
        render(<ProfileEditor profile={SINIRLI} canEdit />);
        fireEvent.change(kutu(), { target: { value: "Elle başladığım, henüz kaydetmediğim metin." } });
        await taslakYaz("AI ile yeniden yaz");

        fireEvent.click(screen.getByRole("button", { name: "Önceki metne dön" }));
        expect(kutu().value).toBe("Elle başladığım, henüz kaydetmediğim metin.");
        // Kutu kayıtlı metinden farklı: çubuk açık — ama içindeki artık AI taslağı değil.
        expect(screen.getByText(CUBUK)).toBeInTheDocument();
        notYok();
      });

      it("Kaydet: kaydedilen taslağın notu da gider; sonraki elle düzeltmede 'Önceki metne dön' geri gelmez", async () => {
        render(<ProfileEditor profile={SINIRLI} canEdit />);
        await taslakYaz("AI ile yeniden yaz");

        fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
        await waitFor(() => expect(h.update).toHaveBeenCalledWith({ aboutText: TASLAK }));
        await waitFor(() => expect(screen.queryByText(CUBUK)).toBeNull());
        notYok();

        fireEvent.change(kutu(), { target: { value: `${TASLAK} Düzeltme.` } });
        expect(screen.getByText(CUBUK)).toBeInTheDocument();
        notYok();
      });

      it("taslak kutudayken elle DÜZENLEMEK notu silmez (hâlâ o taslak, kaydedilmemiş)", async () => {
        render(<ProfileEditor profile={SINIRLI} canEdit />);
        await taslakYaz("AI ile yeniden yaz");

        fireEvent.change(kutu(), { target: { value: `${TASLAK} Pano montajı da yapıyoruz.` } });
        const not = within(bolum()).getByRole("status");
        expect(not).toHaveTextContent(URUNSUZ);
        expect(not).toHaveTextContent(/Kalan AI tanıtım önerisi hakkınız: 5\./);
        expect(screen.getByRole("button", { name: "Önceki metne dön" })).toBeInTheDocument();
      });
    });
  });

  /**
   * Canlı doğrulama PD-06: 390 px'te ~260 karakterlik taslağın 9 satırından 5'i
   * görünüyordu (sabit `rows={5}`). Kutu içeriğiyle büyür; alt sınır 5 satır,
   * üst sınır görünür alanın %70'i (üstünde kutu içinde kayar). jsdom yerleşim
   * hesaplamaz → içerik yüksekliği (`scrollHeight`) metinden türetilerek verilir.
   */
  describe("Hakkında kutusu içeriğiyle büyür (canlı doğrulama PD-06)", () => {
    const SATIR = 24;
    const DOLGU = 18;
    /** 390 px'teki kutu: satıra ~30 karakter; en az 5 satır (rows). */
    const icerikYuksekligi = (metin: string) => DOLGU + SATIR * Math.max(5, Math.ceil(metin.length / 30));
    const kutu = () => screen.getByLabelText("Hakkında") as HTMLTextAreaElement;
    /** Canlı turdaki T5 taslağı (267 karakter): 390 px'te 9 satır. */
    const TASLAK_9_SATIR =
      "Kocaeli merkezli firmamız, paslanmaz çelik boru üretimi sektöründe faaliyet göstermektedir. " +
      "Üretim süreçlerimizin yanı sıra lazer kesim ve boru bükme hizmetleri sunuyoruz. " +
      "Ürün yelpazemizde QA Çeviri Ürünü serisine ait çeşitli paslanmaz boru çözümleri yer almaktadır.";

    beforeEach(() => {
      Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
        configurable: true,
        get(this: HTMLTextAreaElement) {
          return icerikYuksekligi(this.value);
        },
      });
      vi.stubGlobal("innerHeight", 844);
    });
    afterEach(() => {
      delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight;
      vi.unstubAllGlobals();
    });

    it("kısa metinde 5 satırlık alt sınırda kalır; elle boyutlandırma tutamağı yok", () => {
      render(<ProfileEditor profile={PROFILE} canEdit />);
      expect(kutu().style.height).toBe(`${DOLGU + SATIR * 5}px`);
      expect(kutu().style.overflowY).toBe("hidden");
      expect(kutu()).toHaveAttribute("rows", "5");
      expect(kutu().className).toContain("resize-none");
    });

    it("AI taslağı gelince taslağın TAMAMI görünür: kutu 9 satıra büyür, içinde kaydırma yok", async () => {
      expect(Math.ceil(TASLAK_9_SATIR.length / 30)).toBe(9);
      h.post.mockResolvedValue({ data: { aboutText: TASLAK_9_SATIR, productCount: 3, remainingSuggestions: null } });
      render(<ProfileEditor profile={{ ...PROFILE, aboutText: null }} canEdit />);
      fireEvent.click(screen.getByRole("button", { name: "Tanıtımı AI ile yaz" }));
      await waitFor(() => expect(kutu().value).toBe(TASLAK_9_SATIR));
      expect(kutu().style.height).toBe(`${DOLGU + SATIR * 9}px`);
      expect(kutu().style.overflowY).toBe("hidden");

      // Vazgeç: kutu yeniden küçülür.
      fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
      expect(kutu().style.height).toBe(`${DOLGU + SATIR * 5}px`);
    });

    it("yazdıkça büyür; üst sınır görünür alanın %70'i — üstünde metin kutunun içinde kayar", () => {
      render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.change(kutu(), { target: { value: "x".repeat(30 * 12) } });
      expect(kutu().style.height).toBe(`${DOLGU + SATIR * 12}px`);
      expect(kutu().style.overflowY).toBe("hidden");

      // 2000 karakter ≈ 67 satır (1626 px) > 844 × 0,7 = 591 px.
      fireEvent.change(kutu(), { target: { value: "x".repeat(2000) } });
      expect(kutu().style.height).toBe("591px");
      expect(kutu().style.overflowY).toBe("auto");
    });

    it("pencere boyutu değişince yeniden ölçülür (ekran döndürme satır kırılımını ve tavanı değiştirir)", () => {
      render(<ProfileEditor profile={PROFILE} canEdit />);
      fireEvent.change(kutu(), { target: { value: "x".repeat(2000) } });
      expect(kutu().style.height).toBe("591px");
      vi.stubGlobal("innerHeight", 390);
      fireEvent(window, new Event("resize"));
      expect(kutu().style.height).toBe("273px");
    });

    it("ölçülemeyen kutuya (yerleşim yok: içerik yüksekliği 0) yükseklik yazılmaz", () => {
      Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", { configurable: true, get: () => 0 });
      render(<ProfileEditor profile={PROFILE} canEdit />);
      expect(kutu().style.height).toBe("auto");
    });
  });
});
