// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
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
  // Seçilen ürün/hizmetlerin adları (seçici ve özet aynı sorguyu okur).
  cats: [] as Array<{ id: string; nameTr: string }>,
  // `useCategoriesByIds` çağrıları (id listesi + seçenek) — sihirbaz ve seçici.
  byIds: vi.fn(),
  // `useRoots` çağrıları (seçenek) — sihirbaz ve seçici.
  rootsArgs: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { id: "u1" }, isHydrated: true }),
}));
vi.mock("@/hooks/use-categories", () => ({
  useRoots: (...args: unknown[]) => {
    h.rootsArgs(...args);
    return h.roots;
  },
  // Alt kategori seçici (CategorySelectorButton) seçili kodların adını bu
  // hook'tan çözer. Onboarding'e 2026-09-01'de eklendi; mock'a yazılmazsa
  // vitest "No export is defined" ile patlar.
  useCategoriesByIds: (...args: unknown[]) => {
    h.byIds(...args);
    return { data: h.cats };
  },
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
  isAcceptableWebsite,
  matchTurkeyProvince,
  mergeDraft,
  provinceOptions,
  serverErrorField,
} from "../onboarding-client";

const DRAFT_KEY = "rothern:onboarding-draft:u1";
/**
 * Çok adımlı akış testleri (üç adım + seçiciler) tam paket paralel koşarken
 * 15 sn varsayılanını aşabiliyor; bekleyen sorgular da 1 sn varsayılanını.
 */
const LONG = 40_000;
const SLOW = { timeout: 5_000 };

/** API hata gövdesi (axios biçiminde) — `extractErrorMessage` / `serverErrorField` bunu okur. */
const apiError = (status: number, data: Record<string, unknown>) => ({
  isAxiosError: true,
  response: { status, data },
});

/**
 * Kurulum alanını TEK `paste` olayıyla doldurur (son toparlama 2026-10-04).
 * Karakter karakter `user.type` her tuşta tüm formu (telefon/ülke seçicisi
 * dahil) yeniden çizdiriyordu; tam suite paralel koşarken bu kurulum adımları
 * testleri 15 sn zaman aşımına itiyordu. Tuş-tuş davranışı sınanan alanlar
 * (telefon, IBAN, kod…) testin kendisinde `user.type` ile kalır.
 */
async function fill(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) {
  await user.click(el);
  await user.paste(text);
}

/** Özet adımındaki bir satırın değeri (`<dt>` etiketinin `<dd>`si). */
function summaryValue(label: string): string | null {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent ?? null;
}

// LIMITED (tüzel) → 10 haneli VKN; TR'de vergi dairesi zorunlu (backend mirror).
async function fillStep1TR(user: ReturnType<typeof userEvent.setup>) {
  await fill(user, screen.getByLabelText("Firma Unvanı *"), "Örnek Ltd.");
  await fill(user, screen.getByLabelText("Vergi No / TCKN *"), "1234567890");
  await fill(user, screen.getByLabelText("Vergi Dairesi *"), "Kadıköy VD");
  await user.selectOptions(screen.getByLabelText("İl *"), "İstanbul");
  await user.selectOptions(screen.getByLabelText("İlçe *"), "Kadıköy");
  await fill(user, screen.getByLabelText("Açık Adres *"), "Moda Cad. No:1");
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  h.meError = false;
  h.cats = [];
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

  // Kayıt denetimi 2026-10 (code-auth-9, signup-tr-9): "Devam" sessizce pasif
  // kalmaz — basılınca geçersiz her alan kendi hatasını gösterir, odak ilk
  // hatalı alana gider.
  it("zorunlu alanlar boşken 'Devam' basılır: her eksik alanın altında hata, odak ilk hatalı alanda, adım değişmez", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    const next = screen.getByRole("button", { name: "Devam" });
    expect(next).toBeEnabled();
    // Basılmadan önce hata yok (boş form kırmızı açılmaz).
    expect(screen.queryByText("Firma unvanını yazın (en az 2 karakter)")).toBeNull();
    await user.click(next);

    const legal = screen.getByLabelText("Firma Unvanı *");
    for (const msg of [
      "Firma unvanını yazın (en az 2 karakter)",
      "10 haneli geçerli vergi numarası giriniz",
      "Vergi dairesini yazın",
      "İl seçin",
      "İlçe seçin",
      "Açık adresi yazın (en az 5 karakter)",
    ]) {
      expect(screen.getByText(msg)).toBeInTheDocument();
    }
    expect(legal).toHaveFocus();
    expect(legal).toHaveAttribute("aria-invalid", "true");
    // Hata kutuya bağlı: odak alana gelince ekran okuyucu hatayı da okur.
    expect(legal).toHaveAccessibleDescription("Firma unvanını yazın (en az 2 karakter)");
    // Hâlâ 1. adım.
    expect(screen.queryByLabelText("T.C. Kimlik No *")).toBeNull();
    // Düzeltilen alanın hatası kaybolur.
    await fill(user, legal, "Örnek Ltd.");
    expect(screen.queryByText("Firma unvanını yazın (en az 2 karakter)")).toBeNull();
    expect(legal).not.toHaveAttribute("aria-invalid");
  });

  it("Açık Adres 4 karakter: 'Devam' alanın altında hatayı gösterir ve alana odaklanır", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    const address = screen.getByLabelText("Açık Adres *");
    await user.clear(address);
    await fill(user, address, "No 5");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByText("Açık adresi yazın (en az 5 karakter)")).toBeInTheDocument();
    expect(address).toHaveFocus();
    expect(screen.queryByLabelText("T.C. Kimlik No *")).toBeNull();
  });

  // code-auth-4 / signup-tr-6: TR posta kodu kendi adımında, ortak kuralla
  // (`lib/company/postal-code.ts`) denetlenir — eskiden hata ancak "Tamamla"da,
  // iki adım ötede çıkıyordu.
  it("TR posta kodu: alan 5 rakamda durur; eksik kod 1. adımda alanın altında reddedilir (ayrı teslimat adresi dahil)", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    const postal = screen.getByLabelText("Posta Kodu");
    await fill(user, postal, "3471000");
    expect(postal).toHaveValue("34710");
    await user.clear(postal);
    await fill(user, postal, "3471");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByText("Türkiye adresinde posta kodu 5 haneli olmalıdır")).toBeInTheDocument();
    expect(postal).toHaveFocus();
    expect(screen.queryByLabelText("T.C. Kimlik No *")).toBeNull();
    await user.type(postal, "0");
    expect(screen.queryByText("Türkiye adresinde posta kodu 5 haneli olmalıdır")).toBeNull();

    // Ayrı teslimat adresinin posta kodu da aynı kuralla.
    await user.click(screen.getByRole("checkbox", { name: /teslimat adresi olarak kullan/i }));
    await user.selectOptions(screen.getAllByLabelText("İl *")[1]!, "Ankara");
    await fill(user, screen.getAllByLabelText("Açık Adres *")[1]!, "Depo Sok. No:2");
    const deliveryPostal = screen.getAllByLabelText("Posta Kodu")[1]!;
    await fill(user, deliveryPostal, "06");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByText("Türkiye adresinde posta kodu 5 haneli olmalıdır")).toBeInTheDocument();
    expect(deliveryPostal).toHaveFocus();
    await user.type(deliveryPostal, "100");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByLabelText("T.C. Kimlik No *")).toBeInTheDocument();
  }, LONG);

  // signup-tr-5: serbest metin "web sitesi" olarak kaydedilip herkese açık
  // profilin yapılandırılmış verisine giriyordu.
  it("Web siteniz: adres olmayan metin alanın altında reddedilir; geçerli adres ve boş alan geçer", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    const site = screen.getByLabelText(/Web siteniz/);
    await fill(user, site, "ornek firma sitesi");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(
      screen.getByText("Geçerli bir web sitesi adresi yazın (ör. ornekfirma.com) ya da alanı boş bırakın"),
    ).toBeInTheDocument();
    expect(site).toHaveFocus();
    expect(screen.queryByLabelText("T.C. Kimlik No *")).toBeNull();
    await user.clear(site);
    await fill(user, site, "www.ozturkcelik.com.tr");
    expect(screen.queryByText(/Geçerli bir web sitesi adresi yazın/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByLabelText("T.C. Kimlik No *")).toBeInTheDocument();
  }, LONG);

  // API `website-address.spec.ts` ile aynı örnekler: birleşen işaretle yazan
  // alfabeler, Farsça U+200C ve ayrık aksanlı Latin harf reddediliyordu.
  it("isAcceptableWebsite: birleşen işaret taşıyan alan adları (Tayca, Hintçe, Tamilce, Bengalce, Farsça) kabul edilir", () => {
    for (const ok of [
      "ธุรกิจ.ไทย",
      "บริษัท.com",
      "उदाहरण.भारत",
      "कंपनी.com",
      "நிறுவனம்.com",
      "কোম্পানি.com",
      "کتاب‌خانه.com",
      "şirket.com",
      "https://www.บริษัท.com/th?x=1",
    ]) {
      expect(isAcceptableWebsite(ok), ok).toBe(true);
    }
    for (const bad of [
      "́firma.com",
      "‌firma.com",
      "firma‌.com",
      "www.ุรกิจ.com",
      "บริษัท",
      "บริษัท .com",
      "info@บริษัท.com",
    ]) {
      expect(isAcceptableWebsite(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  // Kural API `common/company/website-address.ts` ile aynı (boş = isteğe bağlı alan).
  it("isAcceptableWebsite: noktalı, boşluksuz alan adı (http/https isteğe bağlı)", () => {
    for (const ok of [
      "",
      "   ",
      "firma.com",
      "www.firma.com.tr",
      "https://www.firma.com",
      "HTTPS://Firma.COM",
      "https://firma.com/tr/urunler?x=1#ust",
      "firma.com:8080",
      "alt-alan.firma-adi.co.uk",
      "şirket.com.tr",
      "компания.рф",
      "  www.firma.com  ",
    ]) {
      expect(isAcceptableWebsite(ok), ok).toBe(true);
    }
    for (const bad of [
      "ornek firma sitesi",
      "https://ornek firma sitesi",
      "www.firma .com",
      "firma",
      "yok",
      "https://firma",
      "https://",
      ".com",
      "firma.",
      "firma..com",
      "-firma.com",
      "firma_adi.com",
      "firma.c",
      "1.5",
      "192.168.1.10",
      "info@firma.com",
      "https://kullanici:sifre@firma.com",
      "ftp://firma.com",
      "mailto:info@firma.com",
      "javascript:alert(1)",
      "firma.com:abc",
      "firma,com",
    ]) {
      expect(isAcceptableWebsite(bad), bad).toBe(false);
    }
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

  it("TR alanları dolunca 'Devam' 2. adıma geçer", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByLabelText("T.C. Kimlik No *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Firma Unvanı *")).toBeNull();
  });

  // B (kök neden): form artık backend'in shared kimlik yardımcılarını kullanır —
  // geçersiz VKN aynı kuralla formda yakalanır (11 hane, tüzel için VKN=10 hane).
  it("geçersiz VKN (11 hane, tüzel) → hata gösterilir + 'Devam' adımı geçirmez", async () => {
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
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByLabelText("Vergi No / TCKN *")).toHaveFocus();
    expect(screen.queryByLabelText("T.C. Kimlik No *")).toBeNull();
  });

  // signup-enru-4: Rusça vergi etiketi iki satıra sarınca vergi kutusu Firma
  // Türü kutusunun 25 px altına düşüyordu. İki etiket aynı ızgara satırında,
  // iki kutu bir alt satırda başlar (yerleşim jsdom'da ölçülemez; sözleşme
  // ızgara yerleşimidir).
  it("Firma Türü / vergi no satırı: etiketler ortak satırda, kutular altındaki satırda", () => {
    render(<OnboardingClient />);
    const typeSelect = screen.getByLabelText("Firma Türü *");
    const taxInput = screen.getByLabelText("Vergi No / TCKN *");
    const typeLabel = screen.getByText("Firma Türü *");
    const taxLabel = screen.getByText("Vergi No / TCKN *");
    for (const label of [typeLabel, taxLabel]) expect(label).toHaveClass("sm:row-start-1", "sm:self-end");
    expect(typeLabel).toHaveClass("sm:col-start-1");
    expect(taxLabel).toHaveClass("sm:col-start-2");
    const typeBox = typeSelect.closest('[data-slot="control"]')!;
    const taxBox = taxInput.closest("div[data-slot='control']")!;
    expect(typeBox).toHaveClass("sm:col-start-1", "sm:row-start-2");
    expect(taxBox).toHaveClass("sm:col-start-2", "sm:row-start-2");
    // Etiketler ve kutular AYNI ızgaranın doğrudan öğeleri (alanlar `contents`).
    const grid = typeLabel.parentElement!.parentElement!;
    expect(grid).toHaveClass("grid", "sm:grid-cols-2");
    expect(taxLabel.parentElement!.parentElement).toBe(grid);
    expect(typeLabel.parentElement).toHaveClass("contents");
    expect(taxLabel.parentElement).toHaveClass("contents");
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

  it("TCKN (11 hane) + en az 1 sektör → 'Devam' özet adımına geçer", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    await pickSector(user, /Yazılım & IT/);
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByRole("button", { name: "Tamamla" })).toBeInTheDocument();
  });

  // code-category-11 / category-11 / signup-tr-9: kategori zorunlu ama ipucu
  // "boş bırakırsanız…" diyor, "Devam" açıklamasız pasif kalıyordu.
  it("kategori seçilmeden 'Devam': seçicide hata + odak seçicide; ipucu boş bırakmayı önermez", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    expect(screen.queryByText(/boş bırakırsanız/)).toBeNull();
    expect(screen.getByText(/En az bir seçim zorunludur\./)).toBeInTheDocument();
    expect(screen.queryByText("En az bir ürün ya da hizmet seçin")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByText("En az bir ürün ya da hizmet seçin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Tamamla" })).toBeNull();
    // Seçim yapılınca hata kalkar.
    await pickSector(user, /Yazılım & IT/);
    expect(screen.queryByText("En az bir ürün ya da hizmet seçin")).toBeNull();
  }, LONG);

  // B: yetkili TCKN checksum'lı doğrulanır (backend isValidTckn birebir).
  it("geçersiz TCKN (checksum hatalı) → hata + 'Devam' adımı geçirmez", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000140");
    await pickSector(user, /Yazılım & IT/);
    expect(
      screen.getByText(/Geçerli bir T\.C\. Kimlik No/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByLabelText("T.C. Kimlik No *")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Tamamla" })).toBeNull();
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

    // Beyan onaylanmadan "Tamamla" pasif DEĞİL: basılınca neyin eksik olduğunu
    // söyler, gönderim yapılmaz, odak onay kutusuna gider.
    const tamamla = screen.getByRole("button", { name: "Tamamla" });
    const declaration = screen.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/i });
    expect(tamamla).toBeEnabled();
    await user.click(tamamla);
    expect(screen.getByText("Tamamlamak için beyanı onaylayın")).toBeInTheDocument();
    expect(declaration).toHaveFocus();
    expect(h.completeAsync).not.toHaveBeenCalled();
    await user.click(declaration);
    expect(screen.queryByText("Tamamlamak için beyanı onaylayın")).toBeNull();
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
  }, LONG);
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
    await fill(user, screen.getByLabelText("Firma Unvanı *"), "Müller Handel");
    await user.selectOptions(screen.getByLabelText("Firma Türü *"), "OTHER");
    await fill(user, screen.getByLabelText(/Hukuki yapı \(yerel/i), "GmbH");
    await fill(user, screen.getByLabelText("KDV no (VAT) ya da vergi no *"), "DE811234567");
    await user.type(screen.getByLabelText("Şehir *"), "München");
    await user.type(screen.getAllByLabelText("Eyalet / Bölge")[0], "Bayern");
    await fill(user, screen.getByLabelText("Açık Adres *"), "Leopoldstr. 1");
    await user.click(screen.getByRole("checkbox", { name: /teslimat adresi olarak kullan/i }));
    const cities = screen.getAllByLabelText("Şehir *");
    expect(cities).toHaveLength(2);
    await user.type(cities[1], "Hamburg");
    const states = screen.getAllByLabelText("Eyalet / Bölge");
    expect(states).toHaveLength(2);
    await user.type(states[1], "Hamburg");
    await fill(user, screen.getAllByLabelText("Açık Adres *")[1], "Hafenstr. 2");
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
    // Ayrı teslimat adresi özetde (signup-tr-14); yurt dışında kimlik no boşsa satırı yok.
    expect(summaryValue("Teslimat Adresi")).toBe("Hafenstr. 2, Hamburg, Hamburg");
    expect(screen.queryByText("Yetkili Kimlik No")).toBeNull();

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

  // code-auth-13: 5xx / ağ hatasını istek katmanı zaten toast'lar; bileşen
  // üstüne ikinci bir hata basmaz. Diğer hatalarda tek toast bileşenden gelir.
  it("dil kaydedilemezse TEK hata mesajı: 5xx ve ağ hatasında bileşen toast basmaz", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    const select = screen.getByRole("combobox", { name: "Dil" });

    h.updateMeAsync.mockRejectedValueOnce(apiError(503, {}));
    await user.selectOptions(select, "en");
    await waitFor(() => expect(h.updateMeAsync).toHaveBeenCalledTimes(1), SLOW);
    expect(h.toast.error).not.toHaveBeenCalled();

    h.updateMeAsync.mockRejectedValueOnce({ isAxiosError: true, response: undefined });
    await user.selectOptions(select, "ru");
    await waitFor(() => expect(h.updateMeAsync).toHaveBeenCalledTimes(2), SLOW);
    expect(h.toast.error).not.toHaveBeenCalled();

    // İstek katmanının toast basmadığı hata (ör. 429): bileşenin tek mesajı.
    h.updateMeAsync.mockRejectedValueOnce(apiError(429, {}));
    await user.selectOptions(select, "en");
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledTimes(1), SLOW);
    expect(h.toast.error).toHaveBeenCalledWith("Dil kaydedilemedi");
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
 * Taslak (webA-09; kayıt denetimi 2026-10 signup-tr-2 / code-auth-14): sayfa
 * yenilemesi ve dil değişimi sihirbazı yeniden bağlar — girilenler ve adım
 * taslaktan geri gelmeli. Taslak sürekli (kısa gecikmeyle) yazılır, okumak
 * silmez, onboarding tamamlanınca silinir.
 */
describe("OnboardingClient — taslak yenilemede ve dil değişiminde korunur", () => {
  it("YENİLEME: yazılanlar kendiliğinden saklanır; yeniden bağlanınca aynı adım ve değerler gelir, ikinci yenilemede de", async () => {
    const user = userEvent.setup();
    const first = render(<OnboardingClient />);
    // Kullanıcı bir şey yazmadan taslak yazılmaz (tohum saklanmaz).
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    await fillStep1TR(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name: /Yazılım & IT/ }));
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    // Dil seçiciye dokunulmadı: taslağı yazan sürekli kayıt.
    await waitFor(() => {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null");
      expect(draft).toMatchObject({
        step: 1,
        f: { legalName: "Örnek Ltd.", district: "Kadıköy", authorizedTckn: "10000000146", mainCategoryIds: ["cat1"] },
      });
    }, SLOW);

    // F5 = yeniden bağlanma.
    first.unmount();
    const second = render(<OnboardingClient />);
    expect(screen.getByLabelText("T.C. Kimlik No *")).toHaveValue("10000000146");
    expect(screen.getByText("Yazılım & IT")).toBeInTheDocument();
    // Okumak silmez: hemen ardından gelen ikinci yenileme de aynı taslağı bulur.
    expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull();
    second.unmount();
    render(<OnboardingClient />);
    expect(screen.getByLabelText("T.C. Kimlik No *")).toHaveValue("10000000146");
    await user.click(screen.getByRole("button", { name: "Geri" }));
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveValue("Örnek Ltd.");
    expect(screen.getByLabelText("İlçe *")).toHaveValue("Kadıköy");
  }, LONG);

  it("2. adımda dil değişince girilenler anında saklanır ve yeniden bağlanınca geri gelir", async () => {
    const user = userEvent.setup();
    h.updateMeAsync.mockResolvedValue({});
    const first = render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    await user.selectOptions(screen.getByRole("combobox", { name: "Dil" }), "en");
    expect(h.updateMeAsync).toHaveBeenCalledWith({ locale: "en" });
    // Gecikme beklenmez: yönlendirme hemen gelir.
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null")).toMatchObject({
      step: 1,
      f: { authorizedTckn: "10000000146" },
    });

    // LocaleUrlSync yönlendirmesi = yeniden bağlanma.
    first.unmount();
    render(<OnboardingClient />);
    expect(screen.getByLabelText("T.C. Kimlik No *")).toHaveValue("10000000146");
    await user.click(screen.getByRole("button", { name: "Geri" }));
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveValue("Örnek Ltd.");
    expect(screen.getByLabelText("İlçe *")).toHaveValue("Kadıköy");
  }, LONG);

  it("onboarding tamamlanınca taslak silinir ve geri yazılmaz", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name: /Yazılım & IT/ }));
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await waitFor(() => expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull(), SLOW);
    // Beyan işaretlenir işaretlenmez gönderilir: bekleyen taslak yazımı
    // tamamlanan onboarding'in taslağını geri getirmemeli.
    await user.click(screen.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/i }));
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull(), SLOW);
    await new Promise((r) => setTimeout(r, 600));
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  }, LONG);

  it("'Oturumu kapat'tan sonra bekleyen taslak yazımı çalışmaz", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fill(user, screen.getByLabelText("Firma Unvanı *"), "Örnek Ltd.");
    await user.click(screen.getByRole("button", { name: "Oturumu kapat" }));
    expect(h.logout).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 600));
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("başka kullanıcının taslağı okunmaz; hiçbir şey yazılmadıysa taslak oluşmaz", async () => {
    const user = userEvent.setup();
    h.updateMeAsync.mockRejectedValue(new Error("x"));
    sessionStorage.setItem(
      "rothern:onboarding-draft:u2",
      JSON.stringify({ step: 1, f: { legalName: "Başkası A.Ş." } }),
    );
    render(<OnboardingClient />);
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveValue("");
    await user.selectOptions(screen.getByRole("combobox", { name: "Dil" }), "en");
    await new Promise((r) => setTimeout(r, 600));
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
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

/** Kayıt denetimi 2026-10 — özet, adım geçişi, sunucu hatası, il adları. */
describe("OnboardingClient — özet adımı kaydedilecek her şeyi listeler (signup-tr-14)", () => {
  it("web sitesi, kimlik no (maskeli), teslimat adresi, faaliyet tipleri ve seçilen ürün/hizmetler özetde", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await fill(user, screen.getByLabelText(/Web siteniz/), "www.ozturkcelik.com.tr");
    await fill(user, screen.getByLabelText("Posta Kodu"), "34710");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name: /Yazılım & IT/ }));
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    await user.click(screen.getByRole("button", { name: /^Üretici/ }));
    await user.click(screen.getByRole("button", { name: /^Hizmet sağlayıcı/ }));
    await user.click(screen.getByRole("button", { name: "Devam" }));

    expect(summaryValue("Web Sitesi")).toBe("www.ozturkcelik.com.tr");
    expect(summaryValue("Adres")).toBe("Moda Cad. No:1, 34710 Kadıköy / İstanbul");
    expect(summaryValue("Teslimat Adresi")).toBe("Fatura adresiyle aynı");
    // Kimlik no açık yazılmaz.
    expect(summaryValue("T.C. Kimlik No")).toBe("100******46");
    expect(screen.queryByText("10000000146")).toBeNull();
    expect(summaryValue("Sektörler")).toBe("Yazılım & IT");
    expect(summaryValue("Faaliyet Tipi")).toBe("Üretici, Hizmet sağlayıcı");
    // Bu testte yalnız "sektör geneli" seçildi → tek tek seçilen ürün/hizmet yok.
    expect(summaryValue("Ürün ve Hizmetler")).toBe("—");
  }, LONG);

  /** Geçerli, özet adımında duran bir TR taslağı (yenileme sonrası durum). */
  const summaryDraft = (over: Record<string, unknown> = {}) => ({
    step: 2,
    f: {
      country: "TR",
      legalName: "Örnek Ltd.",
      taxNumber: "1234567890",
      taxOffice: "Kadıköy VD",
      city: "İstanbul",
      district: "Kadıköy",
      postalCode: "34710",
      addressLine: "Moda Cad. No:1",
      authorizedTckn: "10000000146",
      mainCategoryIds: ["39000000"],
      // Depoda ata zinciri de durur; özet yalnız kullanıcının seçtiğini yazar.
      subCategoryIds: ["39120000", "39121600", "39121614"],
      declarationAccepted: true,
      ...over,
    },
  });

  it("seçilen ürün/hizmetler adlarıyla listelenir (ata zinciri değil, kullanıcının seçtiği)", () => {
    h.cats = [{ id: "39121614", nameTr: "Kablo kanalları" }];
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(summaryDraft()));
    render(<OnboardingClient />);
    expect(screen.getByRole("button", { name: "Tamamla" })).toBeInTheDocument();
    expect(summaryValue("Ürün ve Hizmetler")).toBe("Kablo kanalları");
  });

  // Yenilemeyle geri gelen taslak sihirbazı doğrudan özet adımında açabilir:
  // "Tamamla" önceki adımları da denetler, eksik alanın adımına döner.
  it("özet adımında açılan taslakta önceki adım geçersizse 'Tamamla' göndermez, o alanın adımına döner", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(summaryDraft({ postalCode: "123" })));
    render(<OnboardingClient />);
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).not.toHaveBeenCalled();
    const postal = await screen.findByLabelText("Posta Kodu", {}, SLOW);
    expect(postal).toHaveFocus();
    expect(screen.getByText("Türkiye adresinde posta kodu 5 haneli olmalıdır")).toBeInTheDocument();
  });

  it("ayrı teslimat adresi (TR) özetde kendi satırında", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.click(screen.getByRole("checkbox", { name: /teslimat adresi olarak kullan/i }));
    await user.selectOptions(screen.getAllByLabelText("İl *")[1]!, "Ankara");
    await user.selectOptions(screen.getByLabelText("İlçe"), "Çankaya");
    await fill(user, screen.getAllByLabelText("Posta Kodu")[1]!, "06100");
    await fill(user, screen.getAllByLabelText("Açık Adres *")[1]!, "Depo Sok. No:2");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name: /Yazılım & IT/ }));
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(summaryValue("Teslimat Adresi")).toBe("Depo Sok. No:2, 06100 Çankaya / Ankara");
  }, LONG);
});

describe("OnboardingClient — adım geçişi başa kaydırır ve odağı adım başlığına taşır (signup-tr-7)", () => {
  it("'Devam' ve 'Geri': sihirbazın başı görünür, odak yeni adımın başlığında", async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const user = userEvent.setup();
      render(<OnboardingClient />);
      await fillStep1TR(user);
      // İlk çizimde ve aynı adımda kalırken kaydırma yok.
      expect(scrollIntoView).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Devam" }));
      // Başlık "Adım 2/3"; adımın adı göstergedeki etiketten açıklama olarak okunur
      // (ad sayfada ikinci bir başlık metni olarak çoğalmaz — e2e adımları
      // "Kişisel Bilgiler" / "Özet & Beyan" metnini tek öğe olarak arar).
      const second = screen.getByRole("heading", { name: "Adım 2/3" });
      expect(second).toHaveFocus();
      expect(second).toHaveAccessibleDescription("Kişisel Bilgiler");
      expect(screen.getAllByText("Kişisel Bilgiler")).toHaveLength(1);
      expect(screen.getAllByRole("heading", { name: /Şirket bilgileri/i })).toHaveLength(1);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      // Kaydırılan öğe sihirbazın başlığı (üstünde yalnız logo çubuğu var).
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole("heading", { level: 1, name: "Şirket bilgileri" }));
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "start" });

      await user.click(screen.getByRole("button", { name: "Geri" }));
      const first = screen.getByRole("heading", { name: "Adım 1/3" });
      expect(first).toHaveFocus();
      expect(first).toHaveAccessibleDescription("Şirket Bilgileri");
      expect(screen.getAllByRole("heading", { name: /Şirket bilgileri/i })).toHaveLength(1);
      expect(scrollIntoView).toHaveBeenCalledTimes(2);

      // Eksik alanla basılan "Devam" adımı değiştirmez: başa kaydırma yok, odak alanda.
      await user.clear(screen.getByLabelText("Vergi Dairesi *"));
      await user.click(screen.getByRole("button", { name: "Devam" }));
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(screen.getByLabelText("Vergi Dairesi *")).toHaveFocus();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  }, LONG);
});

describe("OnboardingClient — sunucu hatası alanın adımında gösterilir (signup-tr-6)", () => {
  /** Adım 3'e kadar geçerli bir TR formu doldurur ve beyanı onaylar. */
  async function fillToSummary(user: ReturnType<typeof userEvent.setup>) {
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await fill(user, screen.getByLabelText("Posta Kodu"), "34710");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name: /Yazılım & IT/ }));
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.click(screen.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/i }));
  }

  it("alanı bilinen ret: sihirbaz o alanın adımına döner, hata alanın altında, değer düzeltilince kaybolur", async () => {
    const user = userEvent.setup();
    const message = "Türkiye adresinde posta kodu 5 haneli olmalıdır";
    h.completeAsync.mockRejectedValue(apiError(400, { message, i18nKey: "api.companyAddresses.trPostaKodu5Hane" }));
    await fillToSummary(user);
    await user.click(screen.getByRole("button", { name: "Tamamla" }));

    // 1. adım, hata Posta Kodu alanında — özet adımında kırmızı kutu değil.
    const postal = await screen.findByLabelText("Posta Kodu", {}, SLOW);
    expect(postal).toHaveFocus();
    expect(postal).toHaveAttribute("aria-invalid", "true");
    expect(postal).toHaveAccessibleDescription(message);
    expect(screen.queryByRole("alert")).toBeNull();
    // Başka bir alanı değiştirmek hatayı silmez; reddedilen değeri değiştirmek siler.
    await fill(user, screen.getByLabelText("Mahalle"), "Caferağa");
    expect(screen.getByText(message)).toBeInTheDocument();
    await user.clear(postal);
    await fill(user, postal, "34714");
    expect(screen.queryByText(message)).toBeNull();
    // Diğer adımlarda da görünmez.
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByRole("button", { name: "Tamamla" })).toBeInTheDocument();
    expect(screen.queryByText(message)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  }, LONG);

  it("alanı bilinmeyen ret: yalnız özet adımındaki kutuda; herhangi bir değer değişince kaybolur", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockRejectedValue(apiError(400, { message: "Firma doğrulaması zaten tamamlanmış" }));
    await fillToSummary(user);
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(await screen.findByRole("alert", {}, SLOW)).toHaveTextContent("Firma doğrulaması zaten tamamlanmış");
    // Geri gidince kutu peşinden gelmez.
    await user.click(screen.getByRole("button", { name: "Geri" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Geri" }));
    expect(screen.queryByRole("alert")).toBeNull();
    // Bir değer düzeltilip özete dönülünce kutu yok ("Tamamla"ya basılmadan).
    await fill(user, screen.getByLabelText("Mahalle"), "Caferağa");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByRole("button", { name: "Tamamla" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  }, LONG);

  it("serverErrorField: DTO alanı, katalog anahtarı ve kodla sahibi alanı bulur", () => {
    const f = { postalCode: "34710", deliveryPostalCode: "", deliverySameAsBilling: true, website: "", taxNumber: "" };
    const of = (data: Record<string, unknown>, form = f) => serverErrorField(apiError(400, data), form as never);
    expect(of({ message: "Doğrulama hatası", errors: { website: "…" } })).toBe("website");
    expect(of({ message: "x", i18nKey: "api.companyAddresses.trPostaKodu5Hane" })).toBe("postalCode");
    // Fatura kodu kurala uyuyorsa reddedilen ayrı teslimat adresininkidir.
    expect(
      of(
        { message: "x", i18nKey: "api.companyAddresses.trPostaKodu5Hane" },
        { ...f, deliverySameAsBilling: false, deliveryPostalCode: "061" },
      ),
    ).toBe("deliveryPostalCode");
    expect(of({ message: "x", code: "WEBSITE_INVALID" })).toBe("website");
    expect(of({ message: "x", code: "TAX_NUMBER_TAKEN" })).toBe("taxNumber");
    expect(of({ message: "x", i18nKey: "api.companyAuth.yetkiliTCKimlikNoGecersiz" })).toBe("authorizedTckn");
    expect(of({ message: "x", i18nKey: "api.helpers.gecersizAltKategoriSecimi" })).toBe("mainCategoryIds");
    expect(of({ message: "bilinmeyen" })).toBeNull();
    expect(serverErrorField(new Error("ağ"), f as never)).toBeNull();
  });
});

describe("OnboardingClient — il adları arayüz dilinde (login-17)", () => {
  it("provinceOptions: değer Türkçe ad kalır, etiket dile göre; Türkçe dışında o dilin sırasıyla", () => {
    const tr = provinceOptions("tr");
    expect(tr).toHaveLength(81);
    expect(tr.find((p) => p.value === "İstanbul")).toEqual({ value: "İstanbul", label: "İstanbul" });
    expect(tr[0]!.value).toBe("Adana");

    const en = provinceOptions("en");
    expect(en.find((p) => p.value === "İstanbul")!.label).toBe("Istanbul");
    expect(en.find((p) => p.value === "İzmir")!.label).toBe("Izmir");

    const ru = provinceOptions("ru");
    expect(ru).toHaveLength(81);
    expect(ru.find((p) => p.value === "İstanbul")!.label).toBe("Стамбул");
    // Kiril etiketler, Kiril sırasında — hiçbir etiket Latin harfle kalmaz.
    for (const p of ru) expect(p.label).toMatch(/^[\u0400-\u04FF]/);
    const labels = ru.map((p) => p.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "ru")));
    // Değerler her dilde aynı Türkçe il adları (saklanan metin + ilçe listesi).
    expect(new Set(ru.map((p) => p.value))).toEqual(new Set(tr.map((p) => p.value)));
  });

  it("il seçici: seçeneğin değeri Türkçe ad, ilçe listesi ona göre açılır", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    const il = screen.getByLabelText("İl *");
    expect(within(il).getByRole("option", { name: "İstanbul" })).toHaveValue("İstanbul");
    await user.selectOptions(il, "İstanbul");
    expect(within(screen.getByLabelText("İlçe *")).getByRole("option", { name: "Kadıköy" })).toBeInTheDocument();
  });
});

/**
 * Kayıt denetimi 2026-10 ikinci tur: hatalar yardımcı teknolojiye bağlı
 * (web-auth-1 / web-auth-3 / web-auth-6), sektör listesi eldeyken seçici
 * sökülmez (webcat-8), ad isteği seçiciyle ortak (webcat-5).
 */
describe("OnboardingClient — kayıt denetimi 2026-10 ikinci tur", () => {
  /** Geçerli bir TR taslağı; `step` adımında açılır (yenileme sonrası durum). */
  const draft = (step: number, over: Record<string, unknown> = {}) => ({
    step,
    f: {
      country: "TR",
      legalName: "Örnek Ltd.",
      taxNumber: "1234567890",
      taxOffice: "Kadıköy VD",
      city: "İstanbul",
      district: "Kadıköy",
      postalCode: "34710",
      addressLine: "Moda Cad. No:1",
      authorizedTckn: "10000000146",
      mainCategoryIds: ["cat1"],
      subCategoryIds: [],
      declarationAccepted: false,
      ...over,
    },
  });
  const open = (step: number, over: Record<string, unknown> = {}) => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft(step, over)));
    return render(<OnboardingClient />);
  };

  // web-auth-1: hata CheckboxField'in dışında düz paragraftı — odak kutuya
  // gidiyor, ekran okuyucu yalnız etiketi ve "işaretli değil"i okuyordu.
  it("beyan kutusu: 'Tamamla'da kutu aria-invalid olur ve hata kutunun açıklamasıdır; işaretlenince ikisi de kalkar", async () => {
    const user = userEvent.setup();
    open(2);
    const box = screen.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/i });
    expect(box).not.toHaveAttribute("aria-invalid");
    expect(box).not.toHaveAttribute("aria-describedby");
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).not.toHaveBeenCalled();
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("Tamamlamak için beyanı onaylayın");
    // Hata onay satırının İÇİNDE (etiketin altındaki ızgara hücresi).
    const message = screen.getByText("Tamamlamak için beyanı onaylayın");
    expect(box.closest("[data-field=declarationAccepted]")).toContainElement(message);
    await user.click(box);
    expect(screen.queryByText("Tamamlamak için beyanı onaylayın")).toBeNull();
    expect(box).not.toHaveAttribute("aria-invalid");
    expect(box).not.toHaveAttribute("aria-describedby");
  });

  // web-auth-3: şehir kutuları yalnız kırmızı çerçeve alıyordu.
  it("yabancı şehir ve teslimat şehri: 'Devam'da kırmızı çerçeveyle birlikte aria-invalid", async () => {
    const user = userEvent.setup();
    open(0, {
      country: "DE",
      taxNumber: "DE811234567",
      taxOffice: "",
      city: "",
      district: "",
      postalCode: "80331",
      addressLine: "Leopoldstr. 1",
      deliverySameAsBilling: false,
      deliveryCity: "",
      deliveryAddressLine: "Hafenstr. 2",
    });
    const cities = screen.getAllByRole("combobox", { name: "Şehir *" });
    expect(cities).toHaveLength(2);
    for (const city of cities) expect(city).not.toHaveAttribute("aria-invalid");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    for (const city of cities) {
      expect(city).toHaveAttribute("aria-invalid", "true");
      expect(city).toHaveAccessibleDescription("Şehri yazın");
    }
    expect(cities[0]).toHaveFocus();
    // Yazınca işaret kalkar.
    await user.type(cities[0]!, "Köln");
    expect(cities[0]).not.toHaveAttribute("aria-invalid");
    expect(cities[1]).toHaveAttribute("aria-invalid", "true");
  });

  // web-auth-6: seçici çizilmeyince `data-field` sarmalayıcısı da yoktu —
  // "Devam"ın işaretleyip odaklayacağı öğe kalmıyor, basış sonuçsuz görünüyordu.
  it("sektör listesi yüklenemediyse 'Devam': odak 'Tekrar dene'de, kategori hatası yükleme hatasının altında ve düğmeye bağlı", async () => {
    const user = userEvent.setup();
    h.roots.isError = true;
    h.roots.data = undefined;
    open(1, { mainCategoryIds: [] });
    const retry = screen.getByRole("button", { name: "Tekrar dene" });
    expect(retry).toHaveAccessibleDescription("Sektörler yüklenemedi.");
    expect(screen.queryByText("En az bir ürün ya da hizmet seçin")).toBeNull();
    const next = screen.getByRole("button", { name: "Devam" });
    await user.click(next);
    expect(next).not.toHaveFocus();
    expect(retry).toHaveFocus();
    expect(screen.getByText("En az bir ürün ya da hizmet seçin")).toBeInTheDocument();
    expect(retry).toHaveAccessibleDescription("Sektörler yüklenemedi. En az bir ürün ya da hizmet seçin");
    expect(screen.queryByRole("button", { name: "Tamamla" })).toBeNull();
    await user.click(retry);
    expect(h.roots.refetch).toHaveBeenCalledTimes(1);
  });

  // webcat-8: TanStack Query `isError`ı, eldeki liste dururken arka plan
  // tazelemesi düştüğünde de kurar. Seçici (ve açık pencere) sökülüyor,
  // onaylanmamış seçim sorulmadan kayboluyordu.
  it("sektör listesi eldeyken tazeleme düşerse seçici ve açık penceresi yerinde kalır", async () => {
    const user = userEvent.setup();
    const view = open(1, { mainCategoryIds: [] });
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name: /Yazılım & IT/ }));
    expect(screen.getByRole("option", { name: /Yazılım & IT/ })).toHaveAttribute("aria-selected", "true");
    // Arka plan tazelemesi düştü: hata + eldeki liste.
    h.roots.isError = true;
    view.rerender(<OnboardingClient />);
    expect(screen.queryByText(/Sektörler yüklenemedi/)).toBeNull();
    // Onaylanmamış seçim duruyor, onaylanabiliyor.
    expect(screen.getByRole("option", { name: /Yazılım & IT/ })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    expect(screen.getByText("Yazılım & IT")).toBeInTheDocument();
  });

  // webcat-5: sihirbaz yalnız seçimleri soruyordu; seçici seçimler + sektörleri
  // sorduğu için sorgu anahtarı hiç tutmuyor, ikinci bir `by-ids` isteği
  // varsayılan seçeneklerle (429'da üç tekrar, 5xx'te genel toast) çıkıyordu.
  it.each([
    [1, "seçici çizili (2. adım)"],
    [2, "özet adımı"],
  ])("ad isteği seçiciyle AYNI id listesi ve seçenekle yapılır — %i: %s", (step) => {
    open(step, {
      mainCategoryIds: ["39000000"],
      // Depoda ata zinciri de durur; adı sorulan kullanıcının seçtiği yapraktır.
      subCategoryIds: ["39120000", "39121600", "39121614"],
      declarationAccepted: true,
    });
    // Seçilen yaprağın adını soran HER çağrı (sihirbaz + adım 2'de seçici).
    const asks = h.byIds.mock.calls.filter(([ids]) => (ids as string[]).includes("39121614"));
    expect(asks.length).toBeGreaterThan(0);
    const signatures = new Set(
      asks.map(([ids, options]) => JSON.stringify([[...(ids as string[])].sort(), options ?? null])),
    );
    expect([...signatures]).toEqual([JSON.stringify([["39000000", "39121614"], { inlineError: true }])]);
  });

  // Sektör listesi de seçiciyle ortak anahtarda. Sihirbaz listeyi 1. adımdan
  // beri (seçiciden önce) ister: isteğin politikasını o belirler ve hatayı
  // kendi satırında gösterir → genel toast ve 429'da otomatik tekrar olmamalı.
  it.each([0, 1, 2])("sektör listesi seçiciyle AYNI seçenekle istenir — adım %i", (step) => {
    open(step, { declarationAccepted: true });
    expect(h.rootsArgs).toHaveBeenCalled();
    for (const [options] of h.rootsArgs.mock.calls) expect(options).toEqual({ inlineError: true });
  });
});
