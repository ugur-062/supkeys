// @vitest-environment jsdom
/**
 * Firma Bilgileri (2026-09-10) — sözleşme:
 *  - kimlik alanları salt-okunur, kayıt ülkesi görünür, kimlik no MASKELİ;
 *  - doğrulama durumu 4 değerli tek kaynaktan (UNVERIFIED "Bekliyor" DEĞİL);
 *  - PENDING/VERIFIED'da firma adı + yasal unvan kilitli (backend aynası);
 *  - Kaydet yalnız değişiklik varsa aktif ve YALNIZ değişen alanı gönderir;
 *  - TR dışı firmada Vergi Dairesi / KEP çizilmez, vergi etiketi ülkeden;
 *  - kategori listeleri KÜMEDİR: yalnız sırası değişen liste formu kirletmez;
 *  - iki kategori seçicisi birlikte boşalırsa hata SEÇİCİLERİN üstünde çıkar
 *    ve istek atılmaz (yalnız toast değil).
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";

const h = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>,
  update: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  /** Sahte kategori seçicilerinin son prop'ları (etiket → value/onChange). */
  pickers: {} as Record<
    string,
    {
      value: { mainIds: string[]; subIds: string[] };
      onChange: (next: { mainIds: string[]; subIds: string[] }) => void;
    }
  >,
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/providers/confirm-dialog", () => ({
  useConfirm: () => h.confirm,
}));
vi.mock("@/hooks/use-company-profile", () => ({
  useCompanyProfile: () => ({ data: h.profile, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateCompanyProfile: () => ({ mutateAsync: h.update, isPending: false }),
}));
// Kategori seçicisi katalog uçlarına gider (useRoots / useCategoriesByIds) —
// bu dosya KİMLİK/KİLİT/kirli-alan sözleşmesini sınıyor, katalog ağacını değil.
// Kendi sözleşmesi `company-category-picker.test.tsx` içinde.
//
// Sahte seçici formun ona verdiği DEĞERİ ve HATAYI gösterir, `onChange`i de
// testin çağırabileceği yere koyar (`h.pickers[etiket]`): form ile seçici
// arasındaki sözleşme (value / onChange / error) gerçek bileşensiz sınanır.
vi.mock("@/components/categories/company-category-picker", () => ({
  CompanyCategoryPicker: (props: {
    label: string;
    value: { mainIds: string[]; subIds: string[] };
    onChange: (next: { mainIds: string[]; subIds: string[] }) => void;
    error?: string;
  }) => {
    h.pickers[props.label] = { value: props.value, onChange: props.onChange };
    return (
      <div data-testid="kategori-secici" data-label={props.label}>
        {props.label}
        <output data-testid={`deger-${props.label}`}>{JSON.stringify(props.value)}</output>
        {props.error ? <p data-testid={`hata-${props.label}`}>{props.error}</p> : null}
      </div>
    );
  },
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
    h.confirm.mockReset().mockResolvedValue(false);
    h.push.mockReset();
    h.toast.success.mockReset();
    h.toast.error.mockReset();
    h.pickers = {};
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

  // Eski sözleşme (D-029: üyelik satırında paket rozeti, bitiş tarihi, "Yenile")
  // ücretsiz dönemde KALKTI (2026-10-07): kimlik kartı paket adı, üyelik
  // süresi ya da paket bağlantısı basmaz; doğrulama rozeti durur.
  it.each([
    ["GOLD", { endsAt: "2026-12-31T09:00:00.000Z", expiredAt: null }],
    ["SILVER", { endsAt: "2026-12-31T09:00:00.000Z", expiredAt: null }],
    ["STANDART", { endsAt: null, expiredAt: "2026-09-30T09:00:00.000Z" }],
  ])("paket kartı yok: %s firmada üyelik satırı, paket adı ve yenileme bağlantısı çizilmez", (tier, membership) => {
    h.profile = baseProfile({ tier, membership });
    const { container } = render(<CompanyProfileSection />);
    expect(screen.queryByText("Üyelik")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b(Gold|Silver|Standart)\b|paket|tarihine kadar|Yenile/i);
    for (const a of screen.getAllByRole("link")) expect(a.getAttribute("href")).not.toContain("/company/premium");
    // Doğrulama satırı ve bağlantısı yerinde.
    expect(screen.getByText("Doğrulama")).toBeInTheDocument();
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
    expect(screen.getByLabelText("İl")).toBeEnabled();
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
    await user.clear(screen.getByLabelText("İl"));
    await user.type(screen.getByLabelText("İl"), "Ankara");
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
    // Etiket arayüz dilinde + resmî yerel ad (katalog; eskiden "БИН (BIN) — 12 hane").
    expect(screen.getByText("İşletme kimlik no (БИН)")).toBeInTheDocument();
    expect(screen.queryByText(/12 hane/)).not.toBeInTheDocument();
    expect(screen.getByText("Yetkili Kimlik No")).toBeInTheDocument();
  });

  it("TR dışı firma: İlçe yerine eyalet/bölge düzenlenir ve yalnız o alan gönderilir", async () => {
    h.profile = baseProfile({ country: "DE", city: "München", district: null, stateRegion: "Bayern" });
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    expect(screen.queryByLabelText("İlçe")).not.toBeInTheDocument();
    expect(screen.getByText("KDV no (VAT) ya da vergi no")).toBeInTheDocument();
    const state = screen.getByLabelText("Eyalet / bölge");
    expect(state).toHaveValue("Bayern");
    await user.clear(state);
    await user.type(state, "Hessen");
    await user.click(saveButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ stateRegion: "Hessen" }));
  });

  it("kayıtta yazılan 'Kurucu' unvanı arayüz dilinde; elle girilen unvan olduğu gibi", () => {
    h.profile = baseProfile({ authorizedTitle: "Основатель" });
    const { unmount } = render(<CompanyProfileSection />);
    expect(screen.getByText("Kurucu")).toBeInTheDocument();
    unmount();
    h.profile = baseProfile({ authorizedTitle: "Genel Müdür" });
    render(<CompanyProfileSection />);
    expect(screen.getByText("Genel Müdür")).toBeInTheDocument();
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
  it("kaydedilmemiş değişiklikle uygulama içi bağlantı onay sorar; 'Kal' gezinmez (D-309)", async () => {
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    const link = screen.getAllByRole("link", { name: "Doğrulama Belgeleri" })[0]!;
    await user.type(screen.getByLabelText("Firma adı"), " Ltd");
    await user.click(link);
    expect(h.confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(h.push).not.toHaveBeenCalled());
  });

  it("TR posta kodu yalnız rakam; 5 haneden kısaysa satır içi hata, Kaydet pasif (D-133)", async () => {
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    const postal = screen.getByLabelText("Posta kodu");
    // Yerel `maxLength` YOK (resignup-2): tarayıcı yapıştırılan metni rakam dışı
    // ayıklanmadan önce keserdi; beş rakam sınırını `cleanPostal` uygular.
    expect(postal).not.toHaveAttribute("maxLength");
    await user.clear(postal);
    await user.type(postal, "AB12C");
    expect(postal).toHaveValue("12");
    expect(screen.getByText(/posta kodu 5 haneli/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    // Boşluklu / önekli kod yapıştırılınca beş rakam korunur, fazlası kesilir.
    await user.clear(postal);
    await user.click(postal);
    await user.paste(" TR-34 710 99");
    expect(postal).toHaveValue("34710");
  });

  it("alanlarda DTO tavanı maxLength olarak var (D-307)", () => {
    render(<CompanyProfileSection />);
    expect(screen.getByLabelText("Firma adı")).toHaveAttribute("maxLength", "200");
    expect(screen.getByLabelText("Yasal unvan")).toHaveAttribute("maxLength", "200");
    expect(screen.getByLabelText("Açık adres")).toHaveAttribute("maxLength", "500");
  });

  /* ---------------- Kategoriler: sıra ve boş beyan ---------------- */

  const BUY = "Ne alırım";
  const SELL = "Ne satarım";
  const CATEGORY_ERROR = /En az bir sektör ya da ürün\/hizmet seçili kalmalı/;
  const withCategories = () =>
    baseProfile({
      buyerCategoryIds: ["39000000", "40000000"],
      buyerSubCategoryIds: ["39120000", "39121000"],
      sellerCategoryIds: ["31000000", "39000000"],
      sellerSubCategoryIds: ["31170000", "31171500", "31171501"],
    });
  /** Seçicinin `onChange`ini çağırır (kullanıcı seçimi onayladı / kaldırdı). */
  const pick = (label: string, next: { mainIds: string[]; subIds: string[] }) =>
    act(() => h.pickers[label]!.onChange(next));

  // Arayüz testi 2026-10 code-category-6: seçici değişiklik yapılmadan
  // onaylanınca (ya da bir seçim kaldırılıp geri eklenince) AYNI kümeyi başka
  // sırayla döndürür; form kirleniyor ve Kaydet aynı beyanı yeniden yazıyordu.
  it("kategori listesinin yalnız SIRASI değişirse form kirlenmez (Kaydet pasif, uyarı yok)", () => {
    h.profile = withCategories();
    render(<CompanyProfileSection />);
    pick(BUY, { mainIds: ["40000000", "39000000"], subIds: ["39121000", "39120000"] });
    pick(SELL, { mainIds: ["39000000", "31000000"], subIds: ["31171501", "31170000", "31171500"] });
    // Ekran yeni sırayı gösterir, ama kaydedilecek bir şey yoktur.
    expect(screen.getByTestId(`deger-${BUY}`)).toHaveTextContent('"mainIds":["40000000","39000000"]');
    expect(screen.queryByText("Kaydedilmemiş değişiklikler var")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vazgeç" })).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("gerçek değişiklikte yalnız DEĞİŞEN kategori listesi gönderilir; sırası değişen öteki liste gitmez", async () => {
    h.profile = withCategories();
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    // Alış: aynı küme, başka sıra. Satış: bir alt seçim eklendi, ana liste yalnız yer değiştirdi.
    pick(BUY, { mainIds: ["40000000", "39000000"], subIds: ["39121000", "39120000"] });
    pick(SELL, {
      mainIds: ["39000000", "31000000"],
      subIds: ["31170000", "31171500", "31171501", "39120000"],
    });
    expect(screen.getByText("Kaydedilmemiş değişiklikler var")).toBeInTheDocument();
    await user.click(saveButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update).toHaveBeenCalledWith({
      sellerSubCategoryIds: ["31170000", "31171500", "31171501", "39120000"],
    });
  });

  it("bir kod eklenip çıkarılması değişikliktir (küme farklı): eleman sayısı aynı kalsa da", async () => {
    h.profile = withCategories();
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    pick(BUY, { mainIds: ["39000000", "41000000"], subIds: ["39120000", "39121000"] });
    await user.click(saveButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ buyerCategoryIds: ["39000000", "41000000"] }));
  });

  // Arayüz testi 2026-10 category-11: iki seçici de boşaltılıp Kaydet'e
  // basılınca PATCH 400 dönüyor, yalnız API metni toast oluyordu.
  it("iki seçici birlikte boşalınca hata İKİ SEÇİCİDE çıkar, Kaydet pasif, istek atılmaz", async () => {
    h.profile = withCategories();
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    expect(screen.queryByTestId(`hata-${BUY}`)).not.toBeInTheDocument();

    // Yalnız biri boş: serbest (yalnız satan firma alış beyanı bırakmayabilir).
    pick(BUY, { mainIds: [], subIds: [] });
    expect(screen.queryByTestId(`hata-${BUY}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`hata-${SELL}`)).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    // İkisi de boş: ileti iki seçicide, ekrandaki adlarla.
    pick(SELL, { mainIds: [], subIds: [] });
    for (const label of [BUY, SELL]) {
      expect(screen.getByTestId(`hata-${label}`)).toHaveTextContent(CATEGORY_ERROR);
      expect(screen.getByTestId(`hata-${label}`)).toHaveTextContent(/Ne alırım.*Ne satarım/);
    }
    expect(saveButton()).toBeDisabled();
    await user.click(saveButton());
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();

    // Bir seçim geri gelince hata kalkar ve kayıt yalnız değişen listeleri yollar.
    pick(SELL, { mainIds: ["31000000"], subIds: [] });
    expect(screen.queryByTestId(`hata-${BUY}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`hata-${SELL}`)).not.toBeInTheDocument();
    await user.click(saveButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update).toHaveBeenCalledWith({
      buyerCategoryIds: [],
      buyerSubCategoryIds: [],
      sellerCategoryIds: ["31000000"],
      sellerSubCategoryIds: [],
    });
  });

  it("Vazgeç boş beyan hatasını da geri alır", async () => {
    h.profile = withCategories();
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    pick(BUY, { mainIds: [], subIds: [] });
    pick(SELL, { mainIds: [], subIds: [] });
    expect(screen.getByTestId(`hata-${SELL}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByTestId(`hata-${SELL}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`deger-${SELL}`)).toHaveTextContent('"mainIds":["31000000","39000000"]');
  });

  it("zaten kategorisiz duran eski firmada hata yok; başka alan kaydedilir ve kategori gönderilmez", async () => {
    // baseProfile dört listeyi de boş verir (kapıdan önce kaydolmuş firma).
    const user = userEvent.setup();
    render(<CompanyProfileSection />);
    expect(screen.queryByTestId(`hata-${BUY}`)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("İlçe"), "X");
    await user.click(saveButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ district: "KadıköyX" }));
  });

  it("yabancı firmada kimlik notu MERSİS anmaz; TR'de anar (D-137)", () => {
    h.profile = baseProfile({ country: "CA", taxOffice: null, taxNumber: "123456789" });
    const { unmount } = render(<CompanyProfileSection />);
    expect(screen.queryByText(/MERSİS/)).not.toBeInTheDocument();
    expect(screen.getByText(/Sicil\/kayıt numarası/)).toBeInTheDocument();
    unmount();
    h.profile = baseProfile();
    render(<CompanyProfileSection />);
    expect(screen.getByText(/MERSİS/)).toBeInTheDocument();
  });
});
