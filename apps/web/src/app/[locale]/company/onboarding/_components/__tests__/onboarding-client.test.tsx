// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  meData: {
    user: { firstName: "Ada", lastName: "Yılmaz" },
    company: { onboardingCompletedAt: null },
  } as unknown,
  completeAsync: vi.fn(),
  viesAsync: vi.fn(),
  roots: {
    data: [
      { id: "cat1", nameTr: "Yazılım & IT" },
      { id: "cat2", nameTr: "İnşaat" },
    ] as unknown[] | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
  logout: vi.fn(),
  meError: false,
  meRefetch: vi.fn(),
  meArgs: vi.fn(),
  updateMeAsync: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { id: "u1" }, isHydrated: true }),
}));
vi.mock("@/hooks/use-categories", () => ({
  useRoots: () => h.roots,
  // Alt kategori seçici (CategorySelectorButton) seçili kodların adını bu
  // hook'tan çözer. Onboarding'e 2026-09-01'de eklendi; mock'a yazılmazsa
  // vitest "No export is defined" ile patlar.
  useCategoriesByIds: () => ({ data: [] }),
  useAllCategories: () => ({ data: [], isLoading: false }),
  useCategorySearchTree: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyMe: (...args: unknown[]) => {
    h.meArgs(...args);
    return {
      data: h.meError ? undefined : h.meData,
      isLoading: false,
      isError: h.meError,
      isFetching: false,
      refetch: h.meRefetch,
    };
  },
  useCompleteOnboarding: () => ({
    mutateAsync: h.completeAsync,
    isPending: false,
  }),
  useViesCheck: () => ({ mutateAsync: h.viesAsync, isPending: false }),
  useCompanyLogout: () => h.logout,
}));

vi.mock("@/hooks/use-company-account", () => ({
  useUpdateMe: () => ({ mutateAsync: h.updateMeAsync, isPending: false }),
}));

vi.mock("@/lib/public/geo-client", () => ({ searchGeoCities: vi.fn(async () => []) }));

import {
  OnboardingClient,
  formatOnboardingAddress,
  initialOnboardingCountry,
  matchTurkeyProvince,
  mergeDraft,
} from "../onboarding-client";

// LIMITED (tüzel) → 10 haneli VKN; TR'de vergi dairesi zorunlu (backend mirror).
async function fillStep1TR(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Firma Unvanı *"), "Örnek Ltd.");
  await user.type(screen.getByLabelText("Vergi No / TCKN *"), "1234567890");
  await user.type(screen.getByLabelText("Vergi Dairesi *"), "Kadıköy VD");
  await user.selectOptions(screen.getByLabelText("İl *"), "İstanbul");
  await user.selectOptions(screen.getByLabelText("İlçe *"), "Kadıköy");
  await user.type(screen.getByLabelText("Açık Adres *"), "Moda Cad. No:1");
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  h.meError = false;
  h.meData = {
    user: { firstName: "Ada", lastName: "Yılmaz" },
    company: { onboardingCompletedAt: null },
  };
  h.roots.isError = false;
  h.roots.data = [
    { id: "cat1", nameTr: "Yazılım & IT" },
    { id: "cat2", nameTr: "İnşaat" },
  ];
});

/** Aranabilir ülke seçicide (Combobox) ülke seç — 245 ülkelik native liste yerine (2026-09-27). */
async function pickCountry(user: ReturnType<typeof userEvent.setup>, query: string, name: string) {
  const box = screen.getByRole("combobox", { name: /^Ülke/ });
  await user.clear(box);
  await user.type(box, query);
  await user.click(await screen.findByRole("option", { name: new RegExp(name) }));
}

// Derin denetim LU-31: şirket bilgilerini yalnız Kurucu tamamlar (API 403);
// Kurucu bitirmeden eklenen üye formu doldurup çıkmaza düşüyordu.
describe("OnboardingClient — Kurucu olmayan üye", () => {
  it("form yerine 'Kurucu tamamlamalı' bilgi ekranı + çıkış", async () => {
    h.meData = {
      user: { firstName: "Can", lastName: "Demir", isOwner: false },
      company: { onboardingCompletedAt: null },
    };
    const user = userEvent.setup();
    render(<OnboardingClient />);
    expect(screen.getByText("Şirket bilgileri Kurucu tarafından tamamlanmalı")).toBeInTheDocument();
    expect(screen.queryByLabelText("Firma Unvanı *")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Oturumu kapat" }));
    expect(h.logout).toHaveBeenCalled();
  });

  it("Kurucu formu görür", () => {
    h.meData = {
      user: { firstName: "Ada", lastName: "Yılmaz", isOwner: true },
      company: { onboardingCompletedAt: null },
    };
    render(<OnboardingClient />);
    expect(screen.getByLabelText("Firma Unvanı *")).toBeInTheDocument();
  });
});

describe("OnboardingClient — adım 1 (şirket)", () => {
  it("DAVETLE GELEN FİRMA (Faz 3): AI keşfinin bulduğu ad, site ve ülke formu başlatır", async () => {
    sessionStorage.setItem(
      "rothern:invite-prefill",
      JSON.stringify({ email: "info@viti.it", companyName: "Viti Srl", website: "viti.it", country: "IT", city: "Milano" }),
    );
    render(<OnboardingClient />);
    expect((await screen.findByLabelText("Firma Unvanı *")) as HTMLInputElement).toHaveValue("Viti Srl");
    expect(screen.getByLabelText(/Web siteniz/)).toHaveValue("viti.it");
    // Ülke İtalya → Türkiye'ye özgü il seçici çizilmez.
    expect(screen.queryByLabelText("İl *")).toBeNull();
  });

  it("zorunlu alanlar boşken 'Devam' devre dışı", () => {
    render(<OnboardingClient />);
    expect(screen.getByRole("button", { name: "Devam" })).toBeDisabled();
  });

  it("TR: il/ilçe/vergi dairesi görünür; yabancıya (KZ) geçince şehir/eyalet gelir", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    expect(screen.getByLabelText("İl *")).toBeInTheDocument();
    expect(screen.getByLabelText("Vergi Dairesi *")).toBeInTheDocument();

    await pickCountry(user, "Kazak", "Kazakistan");
    expect(screen.queryByLabelText("İl *")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Şehir *")).toBeInTheDocument();
    expect(screen.getByLabelText("Eyalet / Bölge")).toBeInTheDocument();
  });

  it("TR alanları doldurunca 'Devam' aktifleşir", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    expect(screen.getByRole("button", { name: "Devam" })).toBeEnabled();
  });

  // B (kök neden): form artık backend'in shared kimlik yardımcılarını kullanır —
  // geçersiz VKN aynı kuralla formda yakalanır (11 hane, tüzel için VKN=10 hane).
  it("geçersiz VKN (11 hane, tüzel) → hata gösterilir + 'Devam' devre dışı", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await user.type(screen.getByLabelText("Firma Unvanı *"), "Örnek Ltd.");
    await user.type(screen.getByLabelText("Vergi No / TCKN *"), "10000000146");
    await user.type(screen.getByLabelText("Vergi Dairesi *"), "Kadıköy VD");
    await user.selectOptions(screen.getByLabelText("İl *"), "İstanbul");
    await user.selectOptions(screen.getByLabelText("İlçe *"), "Kadıköy");
    await user.type(screen.getByLabelText("Açık Adres *"), "Moda Cad. No:1");
    expect(
      screen.getByText(/10 haneli geçerli vergi numarası/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Devam" })).toBeDisabled();
  });
});

describe("OnboardingClient — adım 2 (kişi + sektör)", () => {
  async function goStep2(user: ReturnType<typeof userEvent.setup>) {
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
  }

  // 2026-09-14: ekran TEK soru soruyor — kullanıcı somut ürün/hizmeti seçer,
  // segment koddan TÜRETİLİR. Bir segmentin tamamında çalışan firma için
  // "Sektör geneli ekle" kaçış yolu duruyor ve bu testler onu kullanıyor
  // (birim testte katalog ağacı mock'lu, yaprak seçimi yolu e2e'de).
  async function pickSector(
    user: ReturnType<typeof userEvent.setup>,
    name: RegExp,
  ) {
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name }));
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
  }

  it("sektör modalı: aç → option aria-selected toggle → onayla, seçim yansır", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    const opt = screen.getByRole("option", { name: /Yazılım & IT/ });
    expect(opt).toHaveAttribute("aria-selected", "false");
    await user.click(opt);
    expect(opt).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    // Modal kapanır, seçili çip trigger'da görünür.
    expect(screen.getByText("Yazılım & IT")).toBeInTheDocument();
  });

  it("TCKN (11 hane) + en az 1 sektör → 'Devam' aktif", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    await pickSector(user, /Yazılım & IT/);
    expect(screen.getByRole("button", { name: "Devam" })).toBeEnabled();
  });

  // B: yetkili TCKN checksum'lı doğrulanır (backend isValidTckn birebir).
  it("geçersiz TCKN (checksum hatalı) → hata + 'Devam' devre dışı", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000140");
    await pickSector(user, /Yazılım & IT/);
    expect(
      screen.getByText(/Geçerli bir T\.C\. Kimlik No/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Devam" })).toBeDisabled();
  });

  it("kategori yüklenemezse hata + 'Tekrar dene'", async () => {
    const user = userEvent.setup();
    h.roots.isError = true;
    h.roots.data = undefined;
    await goStep2(user);
    expect(screen.getByText(/Sektörler yüklenemedi/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.roots.refetch).toHaveBeenCalled();
  });
});

describe("OnboardingClient — adım 3 (özet + gönderim)", () => {
  it("beyan onayı + Tamamla → completeOnboarding beklenen payload'la çağrılır", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    // Sektör: "Sektör geneli ekle" → seç → onayla.
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name: /Yazılım & IT/ }));
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    await user.click(screen.getByRole("button", { name: "Devam" }));

    const tamamla = screen.getByRole("button", { name: "Tamamla" });
    expect(tamamla).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", {
        name: /doğru ve güncel olduğunu beyan/i,
      }),
    );
    expect(tamamla).toBeEnabled();
    await user.click(tamamla);

    expect(h.completeAsync).toHaveBeenCalledTimes(1);
    expect(h.completeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        legalName: "Örnek Ltd.",
        country: "TR",
        taxNumber: "1234567890",
        authorizedTckn: "10000000146",
        mainCategoryIds: ["cat1"],
        declarationAccepted: true,
      }),
    );
  });
});

/**
 * VIES — AB ülkelerinde KDV numarası doğrulama. 2026-09-01 – 09-27 arası AB
 * kayda kapalıydı ve bu testler atlanıyordu; kayıt tüm ülkelere açılınca
 * (ABD ve yaptırım ülkeleri hariç) yeniden etkin.
 */
describe("OnboardingClient — VIES (AB ülkeleri)", () => {
  it("AB ülkesinde VIES butonu görünür + doğrulama çağrılır", async () => {
    const user = userEvent.setup();
    h.viesAsync.mockResolvedValue({ valid: true, name: "ACME GmbH" });
    render(<OnboardingClient />);
    await pickCountry(user, "Alman", "Almanya");
    await user.type(screen.getByLabelText("KDV no (VAT) ya da vergi no *"), "DE811234567");

    const viesBtn = screen.getByRole("button", { name: /VIES ile doğrula/i });
    await user.click(viesBtn);
    expect(h.viesAsync).toHaveBeenCalledWith({
      countryCode: "DE",
      vatNumber: "DE811234567",
    });
    expect(h.toast.success).toHaveBeenCalled();
  });

  it("VIES hata fırlatırsa yakalanır (unhandled rejection yok)", async () => {
    const user = userEvent.setup();
    h.viesAsync.mockRejectedValue(new Error("network"));
    render(<OnboardingClient />);
    await pickCountry(user, "Alman", "Almanya");
    await user.type(screen.getByLabelText("KDV no (VAT) ya da vergi no *"), "DE811234567");
    await user.click(screen.getByRole("button", { name: /VIES ile doğrula/i }));
    expect(h.toast.error).toHaveBeenCalled();
  });
});

/**
 * Yabancı firma (2026-09-27): ayrı teslimat adresinde dünya şehir seçici +
 * eyalet/bölge; özet ekranı "TCKN"/"Vergi dairesi" göstermez, "Diğer" hukuki
 * yapıda yerel adı basar.
 */
describe("OnboardingClient — yabancı firma", () => {
  it("DE: ayrı teslimat eyaleti gönderilir; özet yerel hukuki yapı + yabancı vergi etiketi", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    render(<OnboardingClient />);
    await pickCountry(user, "Alman", "Almanya");
    await user.type(screen.getByLabelText("Firma Unvanı *"), "Müller Handel");
    await user.selectOptions(screen.getByLabelText("Firma Türü *"), "OTHER");
    await user.type(screen.getByLabelText(/Hukuki yapı \(yerel/i), "GmbH");
    await user.type(screen.getByLabelText("KDV no (VAT) ya da vergi no *"), "DE811234567");
    await user.type(screen.getByLabelText("Şehir *"), "München");
    await user.type(screen.getAllByLabelText("Eyalet / Bölge")[0], "Bayern");
    await user.type(screen.getByLabelText("Açık Adres *"), "Leopoldstr. 1");
    await user.click(screen.getByRole("checkbox", { name: /teslimat adresi olarak kullan/i }));
    const cities = screen.getAllByLabelText("Şehir *");
    expect(cities).toHaveLength(2);
    await user.type(cities[1], "Hamburg");
    const states = screen.getAllByLabelText("Eyalet / Bölge");
    expect(states).toHaveLength(2);
    await user.type(states[1], "Hamburg");
    await user.type(screen.getAllByLabelText("Açık Adres *")[1], "Hafenstr. 2");
    await user.click(screen.getByRole("button", { name: "Devam" }));

    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name: /Yazılım & IT/ }));
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    await user.click(screen.getByRole("button", { name: "Devam" }));

    // AB ülkesi: etiket katalogdan (web.domain.taxId.label.EU), değer normalize.
    expect(screen.getByText("KDV no (VAT) ya da vergi no")).toBeInTheDocument();
    expect(screen.getByText("811234567")).toBeInTheDocument();
    expect(screen.queryByText("Vergi No / TCKN")).not.toBeInTheDocument();
    expect(screen.queryByText("Vergi Dairesi")).not.toBeInTheDocument();
    expect(screen.getByText("GmbH")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/i }));
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "DE",
        // Ülke öneki atılır (tek kaynak shared normalizeTaxId; API aynı).
        taxNumber: "811234567",
        legalFormLocal: "GmbH",
        stateRegion: "Bayern",
        deliverySameAsBilling: false,
        deliveryCity: "Hamburg",
        deliveryStateRegion: "Hamburg",
        deliveryAddressLine: "Hafenstr. 2",
      }),
    );
  }, 40_000); // Dört adımlı tam form + iki birleşik seçici: tam pakette yük altında 15 sn yetmiyor.
});

/**
 * 2026-09-27 uluslararası denetim: ülke artık "TR" ön seçili DEĞİL — kayıt
 * telefonunun ülkesi, yoksa arayüz dili, yoksa boş (bilinçli seçim).
 */
describe("OnboardingClient — başlangıç ülkesi ve ülkeye özgü alanlar", () => {
  it("initialOnboardingCountry: telefon ülkesi → dil → boş", () => {
    expect(initialOnboardingCountry("+7 9161234567", "en")).toBe("RU");
    expect(initialOnboardingCountry("+7 7011234567", "tr")).toBe("KZ");
    expect(initialOnboardingCountry("+49 301234567", "ru")).toBe("DE");
    // Kayda kapalı ülkenin telefonu (ABD) ülkeyi belirlemez.
    expect(initialOnboardingCountry("+1 2025550123", "en")).toBe("CA");
    // Çok alan kodlu NANP ülkesi alan kodundan (derin denetim LU-10).
    expect(initialOnboardingCountry("+1 8291234567", "en")).toBe("DO");
    expect(initialOnboardingCountry(null, "ru")).toBe("RU");
    expect(initialOnboardingCountry(null, "tr")).toBe("TR");
    expect(initialOnboardingCountry("", "en")).toBe("");
  });

  it("+7 telefonlu kullanıcı: Rusya ile açılır, ИНН etiketi + ipucu, önekli numara kabul", async () => {
    const user = userEvent.setup();
    h.meData = {
      user: { firstName: "Ivan", lastName: "Petrov", phone: "+7 9161234567" },
      company: { onboardingCompletedAt: null },
    };
    render(<OnboardingClient />);
    expect(screen.queryByLabelText("İl *")).not.toBeInTheDocument();
    const tax = screen.getByLabelText("Vergi kimlik no (ИНН / ОГРН) *");
    expect(screen.getByText(/ИНН: şirkette 10/)).toBeInTheDocument();
    // 9 hane → geçersiz (INN 10/12 hane).
    await user.type(tax, "770708389");
    expect(screen.getByText(/Geçerli bir vergi\/sicil numarası/i)).toBeInTheDocument();
    await user.clear(tax);
    await user.type(tax, "ИНН 7707083893");
    expect(screen.queryByText(/Geçerli bir vergi\/sicil numarası/i)).not.toBeInTheDocument();
  });

  it("Mahalle yalnız Türkiye'de sorulur", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    expect(screen.getByLabelText("Mahalle")).toBeInTheDocument();
    await pickCountry(user, "Kazak", "Kazakistan");
    expect(screen.queryByLabelText("Mahalle")).not.toBeInTheDocument();
  });

  it("faaliyet tipi açıklaması katalogdan (arayüz dili)", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByText("Ürünü kendi tesisinde imal ediyor")).toBeInTheDocument();
  });
});

/** Arayüz testi webA-09 (onboarding). */
describe("OnboardingClient — arayüz testi webA-09", () => {
  it("O-122: kurucu sihirbazında 'Oturumu kapat' ve dil seçici var", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    expect(screen.getByRole("combobox", { name: "Dil" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Oturumu kapat" }));
    expect(h.logout).toHaveBeenCalled();
  });

  it("O-122: dil önce hesaba yazılır", async () => {
    const user = userEvent.setup();
    h.updateMeAsync.mockResolvedValue({});
    render(<OnboardingClient />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Dil" }), "en");
    expect(h.updateMeAsync).toHaveBeenCalledWith({ locale: "en" });
  });

  it("D-347: /me düşerse sihirbaz yerine hata kartı + tekrar dene", async () => {
    const user = userEvent.setup();
    h.meError = true;
    render(<OnboardingClient />);
    expect(screen.getByText("Hesap bilgileriniz yüklenemedi")).toBeInTheDocument();
    expect(screen.queryByLabelText("Firma Unvanı *")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.meRefetch).toHaveBeenCalled();
    // Hata yalnız kartta: /me isteği global "Sunucu hatası" toast'ını kapatır
    // (arayüz testi webA-09 yeniden doğrulama — kart + toast çift mesajdı).
    expect(h.meArgs).toHaveBeenCalledWith(true, { skipErrorToast: true });
  });

  it("D-065: aynı ülkeyi yeniden seçmek il/ilçe/vergi dairesini silmez; ülke değişince vergi no temizlenir", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await pickCountry(user, "Türk", "Türkiye");
    expect(screen.getByLabelText("İl *")).toHaveValue("İstanbul");
    expect(screen.getByLabelText("İlçe *")).toHaveValue("Kadıköy");
    expect(screen.getByLabelText("Vergi Dairesi *")).toHaveValue("Kadıköy VD");
    expect(screen.getByLabelText("Vergi No / TCKN *")).toHaveValue("1234567890");
    await pickCountry(user, "Alman", "Almanya");
    expect(screen.getByLabelText("KDV no (VAT) ya da vergi no *")).toHaveValue("");
  });

  it("D-344: ön doldurulan şehir Türkçe duyarsız eşlenir, eşleşmezse il boş ve ilçe kapalı", async () => {
    expect(matchTurkeyProvince("Istanbul")).toBe("İstanbul");
    expect(matchTurkeyProvince("IZMIR")).toBe("İzmir");
    expect(matchTurkeyProvince("Gotham")).toBe("");
    sessionStorage.setItem(
      "rothern:invite-prefill",
      JSON.stringify({ email: "a@b.com.tr", companyName: "X AŞ", country: "TR", city: "Gotham" }),
    );
    render(<OnboardingClient />);
    expect(await screen.findByLabelText("İl *")).toHaveValue("");
    expect(screen.getByLabelText("İlçe *")).toBeDisabled();
  });

  it("D-091: özet adresi ülkeye göre biçimlenir, posta kodu dahil", () => {
    expect(
      formatOnboardingAddress({
        isTR: false,
        addressLine: "Marienplatz 1",
        postalCode: "80331",
        city: "Munich",
        stateRegion: "Bayern",
      }),
    ).toBe("Marienplatz 1, 80331 Munich, Bayern");
    expect(
      formatOnboardingAddress({
        isTR: true,
        neighborhood: "Caferağa",
        addressLine: "Moda Cad. No:1",
        postalCode: "34710",
        district: "Kadıköy",
        city: "İstanbul",
      }),
    ).toBe("Caferağa, Moda Cad. No:1, 34710 Kadıköy / İstanbul");
  });

  it("D-342 / D-353: alanlar DTO sınırlarını taşır; 'Hukuki yapı' kendi adıyla", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveAttribute("maxLength", "150");
    expect(screen.getByLabelText("Açık Adres *")).toHaveAttribute("maxLength", "500");
    await user.selectOptions(screen.getByLabelText("Firma Türü *"), "OTHER");
    expect(screen.getAllByLabelText("Firma Türü *")).toHaveLength(1);
    expect(screen.getByLabelText("Hukuki yapı (yerel adıyla)")).toHaveAttribute("maxLength", "80");
  });

  it("O-120: onay kutusunun yazısına tıklamak kutuyu işaretler", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    const box = screen.getByRole("checkbox", { name: /teslimat adresi olarak kullan/i });
    expect(box).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByText("Fatura adresini teslimat adresi olarak kullan"));
    expect(box).toHaveAttribute("aria-checked", "false");
  });
});

/**
 * Gözden geçirme (webA-09): dil değişimi `[locale]` bölümünü değiştirir ve
 * sihirbazı yeniden bağlar — girilenler ve adım taslaktan geri gelmeli.
 */
describe("OnboardingClient — dil değişiminde taslak korunur", () => {
  it("2. adımda dil değişince girilenler ve adım yeniden bağlanınca geri gelir; taslak tek kullanımlık", async () => {
    const user = userEvent.setup();
    h.updateMeAsync.mockResolvedValue({});
    const first = render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    await user.selectOptions(screen.getByRole("combobox", { name: "Dil" }), "en");
    expect(h.updateMeAsync).toHaveBeenCalledWith({ locale: "en" });
    expect(sessionStorage.getItem("rothern:onboarding-draft:u1")).not.toBeNull();

    // LocaleUrlSync yönlendirmesi = yeniden bağlanma.
    first.unmount();
    render(<OnboardingClient />);
    expect(screen.getByLabelText("T.C. Kimlik No *")).toHaveValue("10000000146");
    expect(sessionStorage.getItem("rothern:onboarding-draft:u1")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Geri" }));
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveValue("Örnek Ltd.");
    expect(screen.getByLabelText("İlçe *")).toHaveValue("Kadıköy");
  });

  it("hesap güncellenemezse taslak yazılmaz; başka kullanıcının taslağı okunmaz", async () => {
    const user = userEvent.setup();
    h.updateMeAsync.mockRejectedValue(new Error("x"));
    sessionStorage.setItem(
      "rothern:onboarding-draft:u2",
      JSON.stringify({ step: 1, f: { legalName: "Başkası A.Ş." } }),
    );
    render(<OnboardingClient />);
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveValue("");
    await user.selectOptions(screen.getByRole("combobox", { name: "Dil" }), "en");
    expect(sessionStorage.getItem("rothern:onboarding-draft:u1")).toBeNull();
  });

  it("mergeDraft: yalnız bilinen ve aynı türdeki alanları alır", () => {
    const base = { legalName: "", cityId: null as number | null, mainCategoryIds: [] as string[], declarationAccepted: false };
    expect(
      mergeDraft(base, {
        legalName: "A Ltd.",
        cityId: 5,
        mainCategoryIds: ["c1", 2],
        declarationAccepted: "yes",
        extra: "x",
      }),
    ).toEqual({ legalName: "A Ltd.", cityId: 5, mainCategoryIds: [], declarationAccepted: false });
    expect(mergeDraft(base, { legalName: null, cityId: "5" })).toEqual(base);
  });
});
