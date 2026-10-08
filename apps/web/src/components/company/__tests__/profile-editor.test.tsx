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
    setUser(OWNER_USER);
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
