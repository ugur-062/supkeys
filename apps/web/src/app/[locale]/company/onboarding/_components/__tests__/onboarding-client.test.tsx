// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as nextIntl from "next-intl";
import { useState } from "react";
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
  // Seçilen ürün/hizmetlerin adları (özet aynı sorguyu okur).
  cats: [] as Array<{ id: string; nameTr: string }>,
  // Sihirbazın `useCategoriesByIds` çağrıları (id listesi + seçenek).
  byIds: vi.fn(),
  // Sihirbazın `useRoots` çağrıları (seçenek).
  rootsArgs: vi.fn(),
  // Sahte kategori seçicisine verilen prop'lar (her çizimde).
  pickerProps: vi.fn(),
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

/**
 * SAHTE KATEGORİ SEÇİCİSİ. Sihirbaz seçiciyi yalnız SÖZLEŞMESİYLE kullanır
 * (`value` / `onChange` / `label` / `hint` / `modalTitle` / `error`); penceresi
 * ve katalog ağacı seçicinin kendi testlerinde (`components/categories/
 * __tests__`) ve kayıt e2e'sinde sınanır. Bu dosya ADIM sözleşmesini sınıyor:
 * seçici hangi adımda çizilir, değeri nereye yazılır, hata ona nasıl verilir,
 * sihirbaz onu ne zaman söker. Firma Bilgileri testi de aynı yolu izler.
 *
 * Sahte seçici bir düğme ("Ürün / hizmet seçin") ve açılınca tek seçenekli bir
 * pencere çizer; pencerenin açık olması YEREL durumdur — seçici sökülüp yeniden
 * bağlanırsa kapanır (webcat-8 sözleşmesi bununla sınanır).
 */
vi.mock("@/components/categories/company-category-picker", () => ({
  CompanyCategoryPicker: (props: {
    value: { mainIds: string[]; subIds: string[] };
    onChange: (next: { mainIds: string[]; subIds: string[] }) => void;
    label: string;
    hint: string;
    modalTitle: string;
    error?: string;
  }) => {
    h.pickerProps(props);
    // eslint-disable-next-line react-hooks/rules-of-hooks -- sahte bileşen, kendisi bir bileşendir
    const [open, setOpen] = useState(false);
    return (
      <div data-testid="kategori-secici">
        <p>{props.label}</p>
        <p>{props.hint}</p>
        {/* Gerçek seçici gibi: hata `role="alert"` ile duyurulur ve seçimi açan
            düğmenin açıklamasıdır. */}
        <button
          type="button"
          aria-describedby={props.error ? "kategori-hatasi" : undefined}
          onClick={() => setOpen(true)}
        >
          Ürün / hizmet seçin
        </button>
        <output data-testid="kategori-degeri">{JSON.stringify(props.value)}</output>
        {props.error ? (
          <p id="kategori-hatasi" role="alert" data-testid="kategori-hatasi">
            {props.error}
          </p>
        ) : null}
        {open ? (
          <div role="dialog" aria-label={props.modalTitle}>
            <button
              type="button"
              onClick={() => {
                props.onChange({ mainIds: ["cat1"], subIds: [] });
                setOpen(false);
              }}
            >
              Yazılım & IT seç
            </button>
          </div>
        ) : null}
      </div>
    );
  },
}));

import {
  ONBOARDING_FORM_KEYS,
  OnboardingClient,
  applyCountryChange,
  categoryDeclarationGroups,
  defaultLegalForm,
  formatOnboardingAddress,
  initialOnboardingCountry,
  isAcceptableWebsite,
  legalFormSelection,
  matchTurkeyProvince,
  mergeDraft,
  pickLegalForm,
  provinceOptions,
  sanitizeLegalForm,
  serverErrorField,
  settleTypedLegalForm,
} from "../onboarding-client";

const DRAFT_KEY = "rothern:onboarding-draft:u1";
/** Taslağın bugünkü sürümü (`onboarding-draft.ts` `ONBOARDING_DRAFT_VERSION`). */
const DRAFT_VERSION = 2;
/**
 * Çok adımlı akış testleri (üç adım + seçiciler) tam paket paralel koşarken
 * 15 sn varsayılanını aşabiliyor; bekleyen sorgular da 1 sn varsayılanını.
 */
const LONG = 40_000;
const SLOW = { timeout: 5_000 };

type User = ReturnType<typeof userEvent.setup>;

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
async function fill(user: User, el: HTMLElement, text: string) {
  await user.click(el);
  await user.paste(text);
}

/** Özet bölümündeki bir satırın değeri (`<dt>` etiketinin `<dd>`si). */
function summaryValue(label: string): string | null {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent ?? null;
}

/** Çok değerli özet satırının değerleri (her biri kendi `<dd>`sinde), sırasıyla. */
function summaryLines(label: string): string[] {
  const row = screen.getByText(label, { selector: "dt" }).parentElement!;
  return Array.from(row.querySelectorAll("dd")).map((dd) => dd.textContent ?? "");
}

/** Görünen adım: "Adım 2/3" başlığı (adı göstergedeki etiketten okunur). */
const stepHeading = (n: 1 | 2 | 3) => screen.getByRole("heading", { name: `Adım ${n}/3` });
const queryStepHeading = (n: 1 | 2 | 3) => screen.queryByRole("heading", { name: `Adım ${n}/3` });

const legalFormSelect = () => screen.getByLabelText("Hukuki Yapı *") as HTMLSelectElement;
const optionTexts = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.textContent);

// LIMITED (tüzel, Türkiye'de ön seçili) → 10 haneli VKN; TR'de vergi dairesi zorunlu (backend mirror).
async function fillStep1TR(user: User) {
  await fill(user, screen.getByLabelText("Firma Unvanı *"), "Örnek Ltd.");
  await fill(user, screen.getByLabelText("Vergi No / TCKN *"), "1234567890");
  await fill(user, screen.getByLabelText("Vergi Dairesi *"), "Kadıköy VD");
  await user.selectOptions(screen.getByLabelText("İl *"), "İstanbul");
  await user.selectOptions(screen.getByLabelText("İlçe *"), "Kadıköy");
  await fill(user, screen.getByLabelText("Açık Adres *"), "Moda Cad. No:1");
}

/** 2. adımda (Faaliyet alanı) sahte seçiciden bir sektör seçer. */
async function pickSector(user: User) {
  await user.click(screen.getByRole("button", { name: "Ürün / hizmet seçin" }));
  await user.click(screen.getByRole("button", { name: "Yazılım & IT seç" }));
}

/** Geçerli bir TR formuyla 2. adıma (Faaliyet alanı) gelir. */
async function goStep2(user: User) {
  render(<OnboardingClient />);
  await fillStep1TR(user);
  await user.click(screen.getByRole("button", { name: "Devam" }));
}

/** Geçerli bir TR formu + seçilmiş sektörle 3. adıma (Yetkili ve onay) gelir. */
async function goStep3(user: User) {
  await goStep2(user);
  await pickSector(user);
  await user.click(screen.getByRole("button", { name: "Devam" }));
}

/** Depoya bugünkü sürümde bir taslak yazar (yenileme sonrası durum). */
function storeDraft(step: number, f: Record<string, unknown>, key = DRAFT_KEY) {
  sessionStorage.setItem(key, JSON.stringify({ v: DRAFT_VERSION, step, f }));
}
const readDraft = () => JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null");

/** Her adımı geçerli, TR'de kayıtlı bir firmanın alanları. */
const VALID_TR = {
  country: "TR",
  legalName: "Örnek Ltd.",
  companyType: "LIMITED",
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
};
/** Almanya'da kayıtlı firma (yerel yapı listeden: GmbH → LIMITED). */
const GERMANY = {
  country: "DE",
  companyType: "LIMITED",
  legalFormLocal: "GmbH",
  taxNumber: "DE123456789",
  taxOffice: "",
  city: "Berlin",
  district: "",
  authorizedTckn: "",
};
/** `step` adımında açılan geçerli taslak. */
const open = (step: number, over: Record<string, unknown> = {}) => {
  storeDraft(step, { ...VALID_TR, ...over });
  return render(<OnboardingClient />);
};

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
async function pickCountry(user: User, query: string, name: string) {
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

/**
 * ADIMLAR (2026-10-08): Şirket bilgileri (ülke başta) → Faaliyet alanı →
 * Yetkili ve onay. Eskiden 2. adım kişisel bilgiyle kategori seçimini
 * karıştırıyor, ülke unvanın altında duruyordu.
 */
describe("OnboardingClient — adımlar ve içerikleri", () => {
  it("adım göstergesi üç adımı yeni adlarıyla, sırasıyla gösterir; ilk adım geçerli adımdır", () => {
    render(<OnboardingClient />);
    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps.map((li) => li.textContent)).toEqual(["1Şirket bilgileri", "2Faaliyet alanı", "3Yetkili ve onay"]);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).not.toHaveAttribute("aria-current");
    expect(stepHeading(1)).toHaveAccessibleDescription("Şirket bilgileri");
    expect(screen.queryByText("Kişisel Bilgiler")).toBeNull();
    expect(screen.queryByText("Özet & Beyan")).toBeNull();
  });

  it("1. adım: ÜLKE ilk alandır ve altındaki alanların ona göre düzenlendiğini söyler; sıra ülke → unvan → hukuki yapı → vergi no → vergi dairesi → web sitesi → adres", () => {
    render(<OnboardingClient />);
    const inOrder = [
      screen.getByRole("combobox", { name: /^Ülke/ }),
      screen.getByText("Aşağıdaki alanlar seçtiğiniz ülkeye göre düzenlenir."),
      screen.getByLabelText("Firma Unvanı *"),
      legalFormSelect(),
      screen.getByLabelText("Vergi No / TCKN *"),
      screen.getByLabelText("Vergi Dairesi *"),
      screen.getByLabelText("Web siteniz"),
      screen.getByLabelText("İl *"),
      screen.getByLabelText("İlçe *"),
      screen.getByLabelText("Mahalle"),
      screen.getByLabelText("Posta Kodu"),
      screen.getByLabelText("Açık Adres *"),
    ];
    for (let i = 1; i < inOrder.length; i++) {
      expect(
        inOrder[i - 1]!.compareDocumentPosition(inOrder[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${i}. öğe bir öncekinden sonra gelmeli`,
      ).toBeTruthy();
    }
    // Not ülke alanının içinde, kutunun altında.
    expect(inOrder[0]!.closest("[data-field=country]")).toContainElement(inOrder[1]!);
    // Kişisel alan ve kategori seçici bu adımda yok.
    expect(screen.queryByLabelText("T.C. Kimlik No *")).toBeNull();
    expect(screen.queryByTestId("kategori-secici")).toBeNull();
  });

  it("2. adım (Faaliyet alanı): ne alıp sattığı + faaliyet tipi; kişisel hiçbir alan yok", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    expect(stepHeading(2)).toHaveAccessibleDescription("Faaliyet alanı");
    expect(screen.getByText("Ne alıp satıyorsunuz?")).toBeInTheDocument();
    expect(screen.getByTestId("kategori-secici")).toBeInTheDocument();
    expect(screen.getByText("Faaliyet tipiniz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Üretici/ })).toBeInTheDocument();
    for (const personal of ["Ad", "Soyad", "T.C. Kimlik No *", "Yetkili Kimlik No"]) {
      expect(screen.queryByLabelText(personal)).toBeNull();
    }
    expect(screen.queryByText(/Kurucu/)).toBeNull();
    expect(screen.queryByLabelText("Firma Unvanı *")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tamamla" })).toBeNull();
  });

  it("3. adım (Yetkili ve onay): ad (salt okunur) → kimlik no → kurucu notu → özet → beyan → Tamamla", async () => {
    const user = userEvent.setup();
    await goStep3(user);
    expect(stepHeading(3)).toHaveAccessibleDescription("Yetkili ve onay");
    const first = screen.getByLabelText("Ad");
    const last = screen.getByLabelText("Soyad");
    expect(first).toHaveValue("Ada");
    expect(last).toHaveValue("Yılmaz");
    expect(first).toBeDisabled();
    expect(last).toBeDisabled();
    const inOrder = [
      screen.getByRole("heading", { name: "Yetkili kişi" }),
      first,
      screen.getByLabelText("T.C. Kimlik No *"),
      screen.getByText(/tüm yönetim yetkisi sizde/),
      screen.getByRole("heading", { name: "Özet" }),
      screen.getByText("Firma Unvanı", { selector: "dt" }),
      screen.getByText("Kayıttan sonra ne olacak?"),
      screen.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/i }),
      screen.getByRole("button", { name: "Tamamla" }),
    ];
    for (let i = 1; i < inOrder.length; i++) {
      expect(
        inOrder[i - 1]!.compareDocumentPosition(inOrder[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${i}. öğe bir öncekinden sonra gelmeli`,
      ).toBeTruthy();
    }
    // Kategori seçici ve şirket alanları bu adımda yok.
    expect(screen.queryByTestId("kategori-secici")).toBeNull();
    expect(screen.queryByLabelText("Firma Unvanı *")).toBeNull();
  }, LONG);
});

describe("OnboardingClient — adım 1 (şirket bilgileri)", () => {
  it("DAVETLE GELEN FİRMA (Faz 3): AI keşfinin bulduğu ad, site ve ülke formu başlatır", async () => {
    sessionStorage.setItem(
      "rothern:invite-prefill",
      JSON.stringify({ email: "info@viti.it", companyName: "Viti Srl", website: "viti.it", country: "IT", city: "Milano" }),
    );
    render(<OnboardingClient />);
    expect((await screen.findByLabelText("Firma Unvanı *")) as HTMLInputElement).toHaveValue("Viti Srl");
    expect(screen.getByLabelText(/Web siteniz/)).toHaveValue("viti.it");
    // Ülke İtalya → Türkiye'ye özgü il seçici çizilmez; hukuki yapı İtalya'nın listesinden, seçimsiz.
    expect(screen.queryByLabelText("İl *")).toBeNull();
    expect(legalFormSelect()).toHaveValue("");
    expect(optionTexts(legalFormSelect())).toContain("S.r.l.");
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
      "10 haneli geçerli vergi numarası girin",
      "Vergi dairesini yazın",
      "İl seçin",
      "İlçe seçin",
      "Açık adresi yazın (en az 5 karakter)",
    ]) {
      expect(screen.getByText(msg)).toBeInTheDocument();
    }
    // Türkiye'de hukuki yapı ön seçili gelir → o alanda hata yok.
    expect(screen.queryByText("Hukuki yapınızı seçin")).toBeNull();
    expect(legal).toHaveFocus();
    expect(legal).toHaveAttribute("aria-invalid", "true");
    // Hata kutuya bağlı: odak alana gelince ekran okuyucu hatayı da okur.
    expect(legal).toHaveAccessibleDescription("Firma unvanını yazın (en az 2 karakter)");
    // Hâlâ 1. adım.
    expect(stepHeading(1)).toBeInTheDocument();
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
    expect(queryStepHeading(2)).toBeNull();
  });

  // Kayıt arayüz testi 2026-10 D-03: ülke ilk alandır → boşken ilk hatalı alan
  // odur. Odak ülke kutusuna gelince 60 satırlık liste kendiliğinden açılıyor,
  // "Ülke seçin" hatasını ve altındaki alanları örtüyor, sayfayı kilitliyordu.
  it("ülke boşken 'Devam': odak ülke kutusuna gelir ama liste kendiliğinden açılmaz; hata görünür ve kutuya bağlı", async () => {
    // İngilizce arayüz + telefonsuz hesap (kayıt telefonu sormaz, 2026-10-08)
    // → ülke boş açılır (`initialOnboardingCountry`); metinler sahte çevirmenle
    // yine Türkçe.
    const locale = vi.spyOn(nextIntl, "useLocale").mockReturnValue("en");
    try {
      h.meData = {
        user: { firstName: "Ada", lastName: "Yılmaz", phone: null },
        company: { onboardingCompletedAt: null },
      };
      const user = userEvent.setup();
      render(<OnboardingClient />);
      const country = screen.getByRole("combobox", { name: /^Ülke/ });
      expect(country).toHaveValue("");
      expect(screen.queryByText("Ülke seçin")).toBeNull();
      await user.click(screen.getByRole("button", { name: "Devam" }));
      // Headless listeyi odaktan sonraki mikro görevde açardı; bir görev beklenir.
      await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
      expect(country).toHaveFocus();
      expect(country).toHaveAttribute("aria-invalid", "true");
      expect(country).toHaveAccessibleDescription("Ülke seçin");
      expect(country).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("listbox")).toBeNull();
      // Öteki hatalar da okunur; sayfa kilitlenmedi (açık liste kaydırmayı kilitler).
      expect(screen.getByText("Firma unvanını yazın (en az 2 karakter)")).toBeInTheDocument();
      expect(document.documentElement.style.overflow).not.toBe("hidden");
      // Liste kullanıcı isteyince açılır: odak zaten kutudayken tıklama.
      await user.click(country);
      await user.click(await screen.findByRole("option", { name: /Albania/ }));
      expect(country).toHaveValue("Albania");
      expect(screen.queryByText("Ülke seçin")).toBeNull();
    } finally {
      locale.mockRestore();
    }
  }, LONG);

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
    expect(queryStepHeading(2)).toBeNull();
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
    expect(stepHeading(2)).toBeInTheDocument();
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
    expect(queryStepHeading(2)).toBeNull();
    await user.clear(site);
    await fill(user, site, "www.ozturkcelik.com.tr");
    expect(screen.queryByText(/Geçerli bir web sitesi adresi yazın/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(stepHeading(2)).toBeInTheDocument();
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
      "şirket.com",
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
    expect(screen.queryByLabelText("Vergi Dairesi *")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Şehir *")).toBeInTheDocument();
    expect(screen.getByLabelText("Eyalet / Bölge")).toBeInTheDocument();
  });

  it("TR alanları dolunca 'Devam' 2. adıma geçer", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    expect(stepHeading(2)).toBeInTheDocument();
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
    expect(queryStepHeading(2)).toBeNull();
    // Şahıs firmasında aynı 11 hane geçerli bir TCKN'dir (kural türe bağlı).
    await user.selectOptions(legalFormSelect(), "SOLE_PROPRIETOR");
    expect(screen.queryByText(/10 haneli geçerli vergi numarası/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(stepHeading(2)).toBeInTheDocument();
  });

  // signup-enru-4: Rusça vergi etiketi iki satıra sarınca vergi kutusu hukuki
  // yapı kutusunun 25 px altına düşüyordu. İki etiket aynı ızgara satırında,
  // iki kutu bir alt satırda başlar (yerleşim jsdom'da ölçülemez; sözleşme
  // ızgara yerleşimidir).
  it("Hukuki yapı / vergi no satırı: etiketler ortak satırda, kutular altındaki satırda", () => {
    render(<OnboardingClient />);
    const typeSelect = legalFormSelect();
    const taxInput = screen.getByLabelText("Vergi No / TCKN *");
    const typeLabel = screen.getByText("Hukuki Yapı *");
    const taxLabel = screen.getByText("Vergi No / TCKN *");
    for (const label of [typeLabel, taxLabel]) expect(label).toHaveClass("sm:row-start-1", "sm:self-end");
    expect(typeLabel).toHaveClass("sm:col-start-1");
    expect(taxLabel).toHaveClass("sm:col-start-2");
    // Kutu + alan altı hata aynı hücrede: hücre, alanın doğrudan çocuğu olan sarmalayıcıdır.
    const typeBox = typeSelect.closest("div[data-slot='control']")!;
    const taxBox = taxInput.closest("div[data-slot='control']")!;
    expect(typeBox).toHaveClass("sm:col-start-1", "sm:row-start-2");
    expect(taxBox).toHaveClass("sm:col-start-2", "sm:row-start-2");
    // Etiketler ve kutular AYNI ızgaranın doğrudan öğeleri (alanlar `contents`).
    const grid = typeLabel.parentElement!.parentElement!;
    expect(grid).toHaveClass("grid", "sm:grid-cols-2");
    expect(taxLabel.parentElement!.parentElement).toBe(grid);
    expect(typeBox.parentElement).toBe(typeLabel.parentElement);
    expect(typeLabel.parentElement).toHaveClass("contents");
    expect(taxLabel.parentElement).toHaveClass("contents");
  });
});

/**
 * HUKUKİ YAPI ÜLKEYE GÖRE (2026-10-08). Seçici seçilen ülkenin YEREL yapılarını
 * listeler (tek kaynak `@rothern/shared` `localLegalForms`), her yapı mevcut
 * türe eşlenir, seçilen yerel ad `legalFormLocal` olarak gider. Listesi olmayan
 * ülke, Türkiye ve KKTC bugünkü genel dört seçeneği görür.
 */
describe("OnboardingClient — hukuki yapı ülkeye göre", () => {
  const GENERIC = ["Limited Şirket", "Anonim Şirket", "Şahıs Firması", "Diğer"];

  it("Türkiye: bugünkü dört seçenek, 'Limited Şirket' ön seçili", () => {
    render(<OnboardingClient />);
    expect(optionTexts(legalFormSelect())).toEqual(GENERIC);
    expect(legalFormSelect()).toHaveValue("LIMITED");
  });

  it.each([
    ["kktc", "Kuzey Kıbrıs"],
    // Listesi olmayan ülke.
    ["Kenya", "Kenya"],
  ])("%s: bugünkü genel dört seçenek, 'Limited Şirket' ön seçili", async (query, name) => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await pickCountry(user, query, name);
    expect(optionTexts(legalFormSelect())).toEqual(GENERIC);
    expect(legalFormSelect()).toHaveValue("LIMITED");
  });

  it.each([
    ["Alman", "Almanya", ["GmbH", "UG (haftungsbeschränkt)", "AG", "KG", "OHG", "GbR", "e.K."]],
    ["Rusya", "Rusya", ["ООО", "АО", "ПАО", "ИП", "Самозанятый"]],
    ["Birleşik Kr", "Birleşik Krallık", ["Ltd", "PLC", "LLP", "Sole trader"]],
  ])("%s: ülkenin yerel yapıları + 'Diğer'; ön seçim yok, genel adlar yok", async (query, name, forms) => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await pickCountry(user, query, name);
    const options = optionTexts(legalFormSelect());
    expect(options[0]).toBe("Seçin…");
    expect(options.at(-1)).toBe("Diğer");
    expect(options).toEqual(expect.arrayContaining(forms));
    for (const generic of GENERIC.slice(0, 3)) expect(options).not.toContain(generic);
    expect(legalFormSelect()).toHaveValue("");
  });

  it("yerel listede seçim yapılmadan 'Devam': seçicinin altında hata, odak seçicide; seçince kalkar", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await pickCountry(user, "Alman", "Almanya");
    await fill(user, screen.getByLabelText("Firma Unvanı *"), "Müller Handel");
    expect(screen.queryByText("Hukuki yapınızı seçin")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Devam" }));
    const select = legalFormSelect();
    expect(select).toHaveFocus();
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription("Hukuki yapınızı seçin");
    expect(select.closest("[data-field=companyType]")).toContainElement(screen.getByText("Hukuki yapınızı seçin"));
    await user.selectOptions(select, "GmbH");
    expect(select).toHaveValue("GmbH");
    expect(screen.queryByText("Hukuki yapınızı seçin")).toBeNull();
    expect(select).not.toHaveAttribute("aria-invalid");
  });

  it.each([
    ["GmbH", "LIMITED"],
    ["AG", "JOINT_STOCK"],
    ["KG", "OTHER"],
    ["e.K.", "SOLE_PROPRIETOR"],
    // Tek kişilik iş statüsü de listede (inceleme 2026-10-08): "Diğer"e yazılıp
    // OTHER kaydolsaydı kişisel vergi numarası başka firmalara açık kalırdı.
    ["Freiberufler", "SOLE_PROPRIETOR"],
  ])("DE '%s' seçimi → companyType %s + legalFormLocal yerel ad olarak gönderilir; özet yerel adı yazar", async (name, type) => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    open(0, { ...GERMANY, companyType: "", legalFormLocal: "", declarationAccepted: true });
    await user.selectOptions(legalFormSelect(), name);
    expect(legalFormSelect()).toHaveValue(name);
    // Listeden seçimde serbest metin kutusu açılmaz ("KG" türü "Diğer"le aynı olsa da).
    expect(screen.queryByLabelText("Hukuki yapı (yerel adıyla)")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(summaryValue("Hukuki Yapı")).toBe(name);
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ country: "DE", companyType: type, legalFormLocal: name }),
    );
  }, LONG);

  it("genel listede (TR) 'Diğer' dışındaki seçimde legalFormLocal gönderilmez; özet türün adını yazar", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    open(2, { companyType: "JOINT_STOCK", declarationAccepted: true });
    expect(summaryValue("Hukuki Yapı")).toBe("Anonim Şirket");
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).toHaveBeenCalledTimes(1);
    const body = h.completeAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.companyType).toBe("JOINT_STOCK");
    expect(body).not.toHaveProperty("legalFormLocal");
  });

  it("'Diğer' her listede serbest metin ister; örnekler ülkeye göre (Türk firmasına 'GmbH, LLC' önerilmez)", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    // Türkiye: Türk hukukundaki öteki yapılar.
    await user.selectOptions(legalFormSelect(), "OTHER");
    const free = () => screen.getByLabelText("Hukuki yapı (yerel adıyla)");
    // Yer tutucular kutularına sığacak kadar kısa (D-01; ölçüm ve bekçi:
    // `packages/i18n` `onboarding-copy.test`).
    expect(free()).toHaveAttribute("placeholder", "ör. kooperatif, adi ortaklık");
    await fill(user, screen.getByLabelText("Firma Unvanı *"), "Örnek Koop.");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(free()).toHaveFocus();
    expect(free()).toHaveAccessibleDescription("Hukuki yapınızı yazın");
    await fill(user, free(), "Kooperatif");
    expect(screen.queryByText("Hukuki yapınızı yazın")).toBeNull();

    // Yerel listesi olan ülke: listedeki yapılar örnek gösterilmez.
    await pickCountry(user, "Alman", "Almanya");
    expect(screen.queryByLabelText("Hukuki yapı (yerel adıyla)")).toBeNull();
    await user.selectOptions(legalFormSelect(), "OTHER");
    expect(free()).toHaveValue("");
    // Örnekler listede OLMAYAN yapılardır (17 ülkenin listesinde kooperatif var:
    // eskiden örnek "kooperatif"ti, İtalyan kooperatifi onu serbest metin yazıp
    // listedeki "Società cooperativa" yerine "Diğer" olarak kaydoluyordu).
    expect(free()).toHaveAttribute("placeholder", "Yerel adıyla yazın (ör. vakıf)");

    // Listesi olmayan ülke: genel örnekler.
    await pickCountry(user, "Kenya", "Kenya");
    await user.selectOptions(legalFormSelect(), "OTHER");
    expect(free()).toHaveAttribute("placeholder", "ör. GmbH, LLC, kooperatif");
  }, LONG);

  it("'Diğer' + serbest metin: companyType OTHER ve yazılan ad gönderilir", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    open(2, { ...GERMANY, companyType: "OTHER", legalFormLocal: " Stiftung ", declarationAccepted: true });
    expect(summaryValue("Hukuki Yapı")).toBe("Stiftung");
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ companyType: "OTHER", legalFormLocal: "Stiftung" }),
    );
  });

  // Yerel yapıların bir kısmı da "Diğer" türüne eşlenir (KG, OHG…). Serbest
  // metin kutusu, yazılan metin listedeki bir ada denk gelse de kapanmamalı.
  it("'Diğer'de yazarken metin listedeki bir yapının adına denk gelse de kutu açık kalır ('KGaA' yazarken 'KG'de kapanmaz)", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    open(0, { ...GERMANY, companyType: "", legalFormLocal: "", declarationAccepted: true });
    await user.selectOptions(legalFormSelect(), "OTHER");
    const free = screen.getByLabelText("Hukuki yapı (yerel adıyla)");
    await user.type(free, "KG");
    expect(legalFormSelect()).toHaveValue("OTHER");
    expect(free).toBeInTheDocument();
    expect(free).toHaveFocus();
    await user.type(free, "aA");
    expect(free).toHaveValue("KGaA");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ companyType: "OTHER", legalFormLocal: "KGaA" }),
    );
  }, LONG);

  it("'Diğer'e elle listedeki bir yapı yazılırsa eşlendiği türle gönderilir (tek kaynak yerel yapı listesi)", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    open(0, { ...GERMANY, companyType: "", legalFormLocal: "", declarationAccepted: true });
    await user.selectOptions(legalFormSelect(), "OTHER");
    await fill(user, screen.getByLabelText("Hukuki yapı (yerel adıyla)"), " GmbH ");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(summaryValue("Hukuki Yapı")).toBe("GmbH");
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ companyType: "LIMITED", legalFormLocal: "GmbH" }),
    );
  }, LONG);

  /**
   * Kayıt arayüz testi 2026-10 D-02: "kutu açık kalsın" kararı "kullanıcı bu
   * oturumda Diğer'i seçti" bayrağına bağlıydı ve bayrak taslakta yoktu —
   * yenileme ya da dil değişiminden sonra "KGaA" yazarken "KG"de kutu
   * kapanıyor, seçim listedeki "KG"ye atlıyor, odak <body>'ye düşüyordu.
   * Kural: yazarken hiçbir şey değişmez; listedeki ad, kutu odağı bırakınca ya
   * da adım gönderilince yapıya çevrilir.
   */
  describe("'Diğer' kutusu: yazarken hiçbir şey değişmez, listedeki ad odak çıkınca çevrilir (D-02)", () => {
    const freeBox = () => screen.queryByLabelText("Hukuki yapı (yerel adıyla)");
    /** Almanya, "Diğer" seçili, kutu boş ve odakta değil. */
    const openOther = async (user: User) => {
      open(0, { ...GERMANY, companyType: "", legalFormLocal: "" });
      await user.selectOptions(legalFormSelect(), "OTHER");
      return screen.getByLabelText("Hukuki yapı (yerel adıyla)");
    };

    it("YENİLEMEDEN / DİL DEĞİŞİMİNDEN SONRA da: 'KGaA' yazarken 'KG'de kutu kapanmaz, seçim 'Diğer'de, odak kutuda kalır", async () => {
      const user = userEvent.setup();
      // Yeniden bağlanma = taslaktan açılış: "Diğer" + "Stiftung" geri gelir.
      open(0, { ...GERMANY, companyType: "OTHER", legalFormLocal: "Stiftung" });
      const free = screen.getByLabelText("Hukuki yapı (yerel adıyla)");
      expect(free).toHaveValue("Stiftung");
      expect(legalFormSelect()).toHaveValue("OTHER");
      await user.clear(free);
      await user.type(free, "KG");
      expect(free).toBeInTheDocument();
      expect(free).toHaveFocus();
      expect(legalFormSelect()).toHaveValue("OTHER");
      await user.type(free, "aA");
      expect(free).toHaveValue("KGaA");
      expect(legalFormSelect()).toHaveValue("OTHER");
      // "GmbH" yazarken de seçim kendiliğinden "GmbH"ye dönmez.
      await user.clear(free);
      await user.type(free, "GmbH");
      expect(free).toHaveFocus();
      expect(free).toHaveValue("GmbH");
      expect(legalFormSelect()).toHaveValue("OTHER");
    }, LONG);

    it("yazılan ad listedeki bir yapıysa odak kutudan çıkınca (Tab) seçici o yapıyı gösterir ve kutu kapanır; listede olmayan ad kalır", async () => {
      const user = userEvent.setup();
      const free = await openOther(user);
      await user.type(free, "GmbH");
      expect(legalFormSelect()).toHaveValue("OTHER");
      await user.tab();
      expect(legalFormSelect()).toHaveValue("GmbH");
      expect(freeBox()).toBeNull();
      // Odak bir sonraki alanda — kaybolmadı.
      expect(document.activeElement).not.toBe(document.body);

      // Listede olmayan ad ("KGaA") serbest metin olarak kalır.
      await user.selectOptions(legalFormSelect(), "OTHER");
      await user.type(freeBox()!, "KGaA");
      await user.tab();
      expect(legalFormSelect()).toHaveValue("OTHER");
      expect(freeBox()).toHaveValue("KGaA");
    }, LONG);

    it("adım gönderilince de çevrilir (odak kutudan çıkmamış olsa da); eksik alan varsa adım değişmez", async () => {
      const user = userEvent.setup();
      open(0, { ...GERMANY, companyType: "", legalFormLocal: "", addressLine: "" });
      await user.selectOptions(legalFormSelect(), "OTHER");
      await user.type(screen.getByLabelText("Hukuki yapı (yerel adıyla)"), "AG");
      expect(legalFormSelect()).toHaveValue("OTHER");
      // Odak kutudayken gönderim (basış olmadan — klavye / yardımcı teknoloji).
      fireEvent.click(screen.getByRole("button", { name: "Devam" }));
      await waitFor(() => expect(legalFormSelect()).toHaveValue("AG"), SLOW);
      expect(freeBox()).toBeNull();
      expect(stepHeading(1)).toBeInTheDocument();
      expect(screen.getByText("Açık adresi yazın (en az 5 karakter)")).toBeInTheDocument();
    }, LONG);

    // Kutu kapanınca altındaki her şey yukarı kayar. Çevirme basışla bırakış
    // arasında yapılsaydı bırakış başka öğeye gelir, tıklama ("Devam") kaybolurdu.
    it("odağı bir BASIŞ aldıysa çevirme bırakıştan sonra yapılır: basış sürerken kutu ve seçim yerinde", async () => {
      const user = userEvent.setup();
      const free = await openOther(user);
      await user.type(free, "GmbH");
      const target = screen.getByLabelText("Firma Unvanı *");
      await user.pointer({ keys: "[MouseLeft>]", target });
      expect(target).toHaveFocus();
      expect(freeBox()).toHaveValue("GmbH");
      expect(legalFormSelect()).toHaveValue("OTHER");
      await user.pointer({ keys: "[/MouseLeft]", target });
      await waitFor(() => expect(legalFormSelect()).toHaveValue("GmbH"), SLOW);
      expect(freeBox()).toBeNull();
    }, LONG);

    it("pencere / sekme odağı kaybedince (alan hâlâ etkin öğe) çevrilmez: geri dönünce yazmaya devam edilir", async () => {
      const user = userEvent.setup();
      const free = await openOther(user);
      await user.type(free, "KG");
      // Pencere odağı kaybeder: kutuya `blur` gelir ama belgenin etkin öğesi odur.
      fireEvent.blur(free);
      expect(free).toHaveFocus();
      expect(freeBox()).toHaveValue("KG");
      expect(legalFormSelect()).toHaveValue("OTHER");
      // Geri dönüş: `focus` yeniden gelir, yazmaya devam.
      fireEvent.focus(free);
      await user.keyboard("aA");
      expect(freeBox()).toHaveValue("KGaA");
      expect(legalFormSelect()).toHaveValue("OTHER");
    }, LONG);

    // Yerel <select> listesi basışta açılır ve bırakışı sayfaya vermez: bekleyen
    // çevirme, kullanıcı kutuya döndükten SONRA çalışıp düzenlemeyi bitirmemeli.
    it("bırakışı gelmeyen basıştan (seçici listesi) sonra kutuya dönülürse düzenleme sürer: 'KG'de kutu kapanmaz", async () => {
      const user = userEvent.setup();
      const free = await openOther(user);
      await user.type(free, "GmbH");
      // Seçiciye basış: odak seçiciye geçer, bırakış (mouseup) gelmez.
      fireEvent.mouseDown(legalFormSelect());
      act(() => legalFormSelect().focus());
      expect(freeBox()).toHaveValue("GmbH");
      // Listeden yeniden "Diğer": kutu boşalır.
      fireEvent.change(legalFormSelect(), { target: { value: "OTHER" } });
      expect(freeBox()).toHaveValue("");
      await user.type(freeBox()!, "KG");
      // Bekleyen çevirmenin çalışabileceği görev geçsin.
      await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
      await user.type(freeBox()!, "aA");
      expect(freeBox()).toHaveValue("KGaA");
      expect(freeBox()).toHaveFocus();
      expect(legalFormSelect()).toHaveValue("OTHER");
    }, LONG);

    it("fareyle 'Devam': tıklama kaybolmaz, yazılan ad eşlendiği yapıyla sonraki adıma taşınır", async () => {
      const user = userEvent.setup();
      const free = await openOther(user);
      await user.type(free, "e.K.");
      await user.click(screen.getByRole("button", { name: "Devam" }));
      expect(stepHeading(2)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Geri" }));
      expect(legalFormSelect()).toHaveValue("e.K.");
      expect(freeBox()).toBeNull();
    }, LONG);

    it("settleTypedLegalForm: 'Diğer'e yazılan listedeki ad eşlendiği türe ve listedeki yazıma çevrilir; gerisi AYNI nesnedir", () => {
      const form = (companyType: string, legalFormLocal: string, country = "DE") => ({ country, companyType, legalFormLocal });
      expect(settleTypedLegalForm(form("OTHER", " GmbH "))).toEqual(form("LIMITED", "GmbH"));
      expect(settleTypedLegalForm(form("OTHER", "e.K."))).toEqual(form("SOLE_PROPRIETOR", "e.K."));
      for (const same of [
        // Listede olmayan ad, boş ad.
        form("OTHER", "KGaA"),
        form("OTHER", ""),
        // "Diğer" türüne eşlenen listedeki yapı: çevrilecek bir şey yok.
        form("OTHER", "KG"),
        // Listeden seçilmiş yapı, seçimsiz form.
        form("LIMITED", "GmbH"),
        form("", ""),
        // Yerel listesi olmayan ülke (Türkiye): yazılan her ad serbest metindir.
        form("OTHER", "GmbH", "TR"),
        form("OTHER", "Kooperatif", "TR"),
      ]) {
        expect(settleTypedLegalForm(same)).toBe(same);
      }
    });
  });

  it("yardımcılar: başlangıç seçimi, seçici değeri, seçimin form karşılığı", () => {
    expect(defaultLegalForm("TR")).toEqual({ companyType: "LIMITED", legalFormLocal: "" });
    expect(defaultLegalForm("XN")).toEqual({ companyType: "LIMITED", legalFormLocal: "" });
    expect(defaultLegalForm("KE")).toEqual({ companyType: "LIMITED", legalFormLocal: "" });
    expect(defaultLegalForm("")).toEqual({ companyType: "LIMITED", legalFormLocal: "" });
    expect(defaultLegalForm("DE")).toEqual({ companyType: "", legalFormLocal: "" });

    const value = (country: string, companyType: string, legalFormLocal = "") =>
      legalFormSelection({ country, companyType, legalFormLocal });
    expect(value("TR", "JOINT_STOCK")).toBe("JOINT_STOCK");
    expect(value("TR", "")).toBe("");
    expect(value("TR", "OTHER", "Kooperatif")).toBe("OTHER");
    expect(value("DE", "LIMITED", "GmbH")).toBe("GmbH");
    expect(value("DE", "OTHER", "Stiftung")).toBe("OTHER");
    // "Diğer" türüne eşlenen yerel yapı listeden seçilmiştir, serbest metin değildir.
    expect(value("DE", "OTHER", "KG")).toBe("KG");
    // Yerel listesi olan ülkede yerel adı olmayan tür seçim sayılmaz.
    expect(value("DE", "LIMITED")).toBe("");
    // BAŞKA ÜLKENİN yapısı hiçbir zaman seçili görünmez.
    expect(value("FR", "LIMITED", "GmbH")).toBe("");
    expect(value("DE", "LIMITED", "ООО")).toBe("");

    expect(pickLegalForm("TR", "SOLE_PROPRIETOR")).toEqual({ companyType: "SOLE_PROPRIETOR", legalFormLocal: "" });
    expect(pickLegalForm("RU", "ИП")).toEqual({ companyType: "SOLE_PROPRIETOR", legalFormLocal: "ИП" });
    expect(pickLegalForm("DE", "KG")).toEqual({ companyType: "OTHER", legalFormLocal: "KG" });
    expect(pickLegalForm("DE", "OTHER")).toEqual({ companyType: "OTHER", legalFormLocal: "" });
    expect(pickLegalForm("DE", "")).toEqual({ companyType: "", legalFormLocal: "" });
    // Yerel listesi olan ülkede genel tür değeri ve başka ülkenin yapısı seçilemez.
    expect(pickLegalForm("DE", "LIMITED")).toEqual({ companyType: "", legalFormLocal: "" });
    expect(pickLegalForm("DE", "ООО")).toEqual({ companyType: "", legalFormLocal: "" });
    expect(pickLegalForm("TR", "GmbH")).toEqual({ companyType: "LIMITED", legalFormLocal: "" });
  });

  it("sanitizeLegalForm: ülkeyle tutarsız seçim düşer; tür yerel adın eşlendiği türe çekilir; 'Diğer' metni kalır", () => {
    const clean = (country: string, companyType: string, legalFormLocal = "") => {
      const out = sanitizeLegalForm({ country, companyType, legalFormLocal, legalName: "X" });
      expect(out.legalName).toBe("X");
      return [out.companyType, out.legalFormLocal];
    };
    expect(clean("DE", "LIMITED", "GmbH")).toEqual(["LIMITED", "GmbH"]);
    // Tür yanlış gelse de yerel adın eşlendiği tür yazılır (tek kaynak shared).
    expect(clean("DE", "SOLE_PROPRIETOR", "AG")).toEqual(["JOINT_STOCK", "AG"]);
    expect(clean("DE", "LIMITED")).toEqual(["", ""]);
    expect(clean("FR", "LIMITED", "GmbH")).toEqual(["", ""]);
    expect(clean("TR", "LIMITED", "GmbH")).toEqual(["LIMITED", ""]);
    expect(clean("TR", "", "")).toEqual(["LIMITED", ""]);
    expect(clean("TR", "BOZUK", "")).toEqual(["LIMITED", ""]);
    expect(clean("TR", "OTHER", "Kooperatif")).toEqual(["OTHER", "Kooperatif"]);
    expect(clean("DE", "OTHER", "Stiftung")).toEqual(["OTHER", "Stiftung"]);
    expect(clean("DE", "OTHER", "KG")).toEqual(["OTHER", "KG"]);
    // "Diğer"e elle yazılmış listedeki yapı eşlendiği türe çekilir.
    expect(clean("DE", "OTHER", "GmbH")).toEqual(["LIMITED", "GmbH"]);
  });
});

/**
 * ÜLKE DEĞİŞİMİ (2026-10-08): hukuki yapı, vergi no ve adresin ülkeye bağlı
 * parçaları sıfırlanır; gerisi kalır; başka ülkenin listesinden bir değer
 * hiçbir zaman seçili kalmaz. Aynı ülkeyi yeniden seçmek hiçbir şeyi silmez.
 */
describe("OnboardingClient — ülke değişimi", () => {
  const FULL = {
    country: "TR",
    legalName: "Örnek Ltd.",
    companyType: "SOLE_PROPRIETOR",
    legalFormLocal: "",
    taxNumber: "10000000146",
    taxOffice: "Kadıköy VD",
    website: "ornek.com",
    city: "İstanbul",
    cityId: 745044 as number | null,
    district: "Kadıköy",
    stateRegion: "",
    neighborhood: "Caferağa",
    postalCode: "34710",
    addressLine: "Moda Cad. No:1",
    deliverySameAsBilling: false,
    deliveryCity: "Ankara",
    deliveryCityId: 323786 as number | null,
    deliveryStateRegion: "",
    deliveryDistrict: "Çankaya",
    deliveryNeighborhood: "Kızılay",
    deliveryPostalCode: "06100",
    deliveryAddressLine: "Depo Sok. No:2",
    authorizedTckn: "10000000146",
    mainCategoryIds: ["cat1"],
    subCategoryIds: ["39120000"],
    activities: ["MANUFACTURER"],
    declarationAccepted: true,
  };

  it("applyCountryChange: yalnız ülkeye bağlı alanlar sıfırlanır; hukuki yapı yeni ülkenin başlangıcına döner", () => {
    expect([...ONBOARDING_FORM_KEYS].sort()).toEqual(Object.keys(FULL).sort());
    const next = applyCountryChange(FULL, "DE");
    const reset = {
      country: "DE",
      // Almanya'nın yerel listesi var → seçimsiz.
      companyType: "",
      legalFormLocal: "",
      taxNumber: "",
      taxOffice: "",
      city: "",
      cityId: null,
      district: "",
      stateRegion: "",
      neighborhood: "",
      postalCode: "",
      deliveryCity: "",
      deliveryCityId: null,
      deliveryStateRegion: "",
      deliveryDistrict: "",
      deliveryNeighborhood: "",
      deliveryPostalCode: "",
    };
    expect(next).toEqual({ ...FULL, ...reset });
    // Kalanlar: unvan, web sitesi, açık adresler, teslimat tercihi, yetkili kimlik no, kategoriler, faaliyet, beyan.
    const kept = Object.keys(FULL).filter((k) => !(k in reset));
    expect(kept.sort()).toEqual(
      [
        "legalName", "website", "addressLine", "deliverySameAsBilling", "deliveryAddressLine",
        "authorizedTckn", "mainCategoryIds", "subCategoryIds", "activities", "declarationAccepted",
      ].sort(),
    );
    // Listesi olmayan ülkeye geçiş genel listenin başlangıcına döner (önceki "Şahıs Firması" taşınmaz).
    expect(applyCountryChange(FULL, "KE")).toMatchObject({ country: "KE", companyType: "LIMITED", legalFormLocal: "" });
  });

  // İnceleme R2 (2026-10-08): kayıtta telefon sorulmadığı için İngilizce arayüzde
  // form ÜLKESİZ açılır; kullanıcı alanları yazıp ülkeyi sonra seçebilir.
  it("applyCountryChange: İLK seçim (ülke boşken) yazılanları silmez; yalnız hukuki yapı ve şehir kimliği yenilenir", () => {
    const blank = {
      ...FULL,
      country: "",
      companyType: "JOINT_STOCK",
      legalFormLocal: "",
      taxNumber: "DE811910074",
      taxOffice: "",
      city: "Munich",
      cityId: 4242,
      district: "",
      stateRegion: "Bayern",
      neighborhood: "",
      postalCode: "80687",
    } as typeof FULL;
    const de = applyCountryChange(blank, "DE");
    expect(de).toMatchObject({
      country: "DE",
      taxNumber: "DE811910074",
      city: "Munich",
      cityId: null,
      stateRegion: "Bayern",
      postalCode: "80687",
      legalName: FULL.legalName,
      website: FULL.website,
      addressLine: FULL.addressLine,
    });
    // Listeli ülkede eski genel tür seçili kalamaz: yeni ülkenin başlangıcı.
    expect(de.companyType).not.toBe("JOINT_STOCK");

    // Türkiye seçilirse yazılan şehir il listesine eşlenir, eyalet / bölge boşalır.
    const tr = applyCountryChange({ ...blank, city: "istanbul", postalCode: "34710" }, "TR");
    expect(tr).toMatchObject({ country: "TR", city: "İstanbul", cityId: null, stateRegion: "", postalCode: "34710", taxNumber: "DE811910074" });
    // Listede olmayan şehir Türkiye için boş kalır (İl "Seçin…" gösterir).
    expect(applyCountryChange(blank, "TR").city).toBe("");
  });

  it("applyCountryChange: aynı ülke yeniden seçilirse form AYNI nesnedir; yerel seçim başka ülkeye taşınmaz", () => {
    expect(applyCountryChange(FULL, "TR")).toBe(FULL);
    const german = { ...FULL, country: "DE", companyType: "LIMITED", legalFormLocal: "GmbH" };
    expect(applyCountryChange(german, "DE")).toBe(german);
    for (const code of ["FR", "AT", "TR", "KE", "RU"]) {
      const moved = applyCountryChange(german, code);
      expect(moved.legalFormLocal).toBe("");
      expect(legalFormSelection(moved)).toBe(code === "TR" || code === "KE" ? "LIMITED" : "");
    }
  });

  it("D-065: aynı ülkeyi yeniden seçmek il/ilçe/vergi dairesini silmez; ülke değişince ülkeye bağlı alanlar sıfırlanır, gerisi kalır", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.selectOptions(legalFormSelect(), "JOINT_STOCK");
    await fill(user, screen.getByLabelText("Web siteniz"), "ornek.com");
    await fill(user, screen.getByLabelText("Mahalle"), "Caferağa");
    await fill(user, screen.getByLabelText("Posta Kodu"), "34710");
    await pickCountry(user, "Türk", "Türkiye");
    expect(screen.getByLabelText("İl *")).toHaveValue("İstanbul");
    expect(screen.getByLabelText("İlçe *")).toHaveValue("Kadıköy");
    expect(screen.getByLabelText("Vergi Dairesi *")).toHaveValue("Kadıköy VD");
    expect(screen.getByLabelText("Vergi No / TCKN *")).toHaveValue("1234567890");
    expect(legalFormSelect()).toHaveValue("JOINT_STOCK");

    await pickCountry(user, "Alman", "Almanya");
    // Sıfırlananlar.
    expect(legalFormSelect()).toHaveValue("");
    expect(screen.getByLabelText("KDV no (VAT) ya da vergi no *")).toHaveValue("");
    expect(screen.getByLabelText("Şehir *")).toHaveValue("");
    expect(screen.getByLabelText("Eyalet / Bölge")).toHaveValue("");
    expect(screen.getByLabelText("Posta Kodu")).toHaveValue("");
    // Kalanlar.
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveValue("Örnek Ltd.");
    expect(screen.getByLabelText("Web siteniz")).toHaveValue("ornek.com");
    expect(screen.getByLabelText("Açık Adres *")).toHaveValue("Moda Cad. No:1");

    // Almanya'da seçilen yapı Fransa'ya taşınmaz; Türkiye'ye dönünce de genel liste başlangıcı gelir.
    await user.selectOptions(legalFormSelect(), "GmbH");
    await pickCountry(user, "Fransa", "Fransa");
    expect(legalFormSelect()).toHaveValue("");
    expect(optionTexts(legalFormSelect())).not.toContain("GmbH");
    expect(optionTexts(legalFormSelect())).toContain("SARL");
    await pickCountry(user, "Türk", "Türkiye");
    expect(legalFormSelect()).toHaveValue("LIMITED");
    // Türkiye'ye dönüşte eski il / ilçe / mahalle / vergi dairesi geri gelmez.
    expect(screen.getByLabelText("İl *")).toHaveValue("");
    expect(screen.getByLabelText("Mahalle")).toHaveValue("");
    expect(screen.getByLabelText("Vergi Dairesi *")).toHaveValue("");
  }, LONG);

  it("ülke son adımdan dönülüp değiştirilince yetkili kimlik no, kategori ve beyan kalır", async () => {
    const user = userEvent.setup();
    open(2, { declarationAccepted: true });
    await user.click(screen.getByRole("button", { name: "Geri" }));
    await user.click(screen.getByRole("button", { name: "Geri" }));
    await pickCountry(user, "Alman", "Almanya");
    await waitFor(() => {
      expect(readDraft()).toMatchObject({
        step: 0,
        f: {
          country: "DE",
          companyType: "",
          taxNumber: "",
          city: "",
          legalName: "Örnek Ltd.",
          addressLine: "Moda Cad. No:1",
          authorizedTckn: "10000000146",
          mainCategoryIds: ["cat1"],
          declarationAccepted: true,
        },
      });
    }, SLOW);
  });
});

describe("OnboardingClient — adım 2 (faaliyet alanı)", () => {
  it("seçici sözleşmesi: etiket / ipucu / pencere başlığı katalogdan; seçim ana ve alt kategoriyi TEK yazmada günceller", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    const props = h.pickerProps.mock.calls.at(-1)![0];
    expect(props).toMatchObject({
      value: { mainIds: [], subIds: [] },
      label: "Ürün ve hizmetleriniz",
      modalTitle: "Ürün ve hizmetleriniz",
      error: undefined,
    });
    expect(props.hint).toMatch(/^Alıp sattığınız her şeyi tek listede işaretleyin/);
    await pickSector(user);
    expect(screen.getByTestId("kategori-degeri")).toHaveTextContent('{"mainIds":["cat1"],"subIds":[]}');
    // Ara tur yok: seçiciye hiçbir çizimde tutarsız çift verilmez.
    act(() => props.onChange({ mainIds: ["cat2"], subIds: ["39120000"] }));
    await waitFor(() =>
      expect(screen.getByTestId("kategori-degeri")).toHaveTextContent('{"mainIds":["cat2"],"subIds":["39120000"]}'),
    );
    for (const [p] of h.pickerProps.mock.calls) {
      expect([
        '{"mainIds":[],"subIds":[]}',
        '{"mainIds":["cat1"],"subIds":[]}',
        '{"mainIds":["cat2"],"subIds":["39120000"]}',
      ]).toContain(JSON.stringify(p.value));
    }
  });

  it("en az 1 sektör → 'Devam' son adıma geçer", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    await pickSector(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(stepHeading(3)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tamamla" })).toBeInTheDocument();
  });

  // code-category-11 / category-11 / signup-tr-9: kategori zorunlu ama ipucu
  // "boş bırakırsanız…" diyor, "Devam" açıklamasız pasif kalıyordu.
  it("kategori seçilmeden 'Devam': hata seçiciye verilir + odak seçicide; ipucu boş bırakmayı önermez", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    expect(screen.queryByText(/boş bırakırsanız/)).toBeNull();
    expect(screen.getByText(/En az bir seçim zorunludur\./)).toBeInTheDocument();
    expect(screen.queryByTestId("kategori-hatasi")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByTestId("kategori-hatasi")).toHaveTextContent("En az bir ürün ya da hizmet seçin");
    expect(screen.getByRole("button", { name: "Ürün / hizmet seçin" })).toHaveFocus();
    expect(queryStepHeading(3)).toBeNull();
    // Seçim yapılınca hata kalkar.
    await pickSector(user);
    expect(screen.queryByTestId("kategori-hatasi")).toBeNull();
  }, LONG);

  // recategory-new-6: satır kategori pencerelerindeki yükleme hatasıyla aynı
  // dili konuşur — "Yeniden dene" (eskiden "Tekrar dene") ve `role="alert"`
  // (eskiden düz paragraf, belirdiğinde okunmuyordu).
  it("kategori yüklenemezse duyurulan hata satırı + seçicilerle aynı 'Yeniden dene'", async () => {
    const user = userEvent.setup();
    h.roots.isError = true;
    h.roots.data = undefined;
    await goStep2(user);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Sektörler yüklenemedi.");
    expect(screen.queryByTestId("kategori-secici")).toBeNull();
    const retry = within(alert).getByRole("button", { name: "Yeniden dene" });
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
    await user.click(retry);
    expect(h.roots.refetch).toHaveBeenCalled();
  });

  it("faaliyet tipi açıklaması katalogdan (arayüz dili); seçim özetde", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    expect(screen.getByText("Ürünü kendi tesisinde imal ediyor")).toBeInTheDocument();
    await pickSector(user);
    await user.click(screen.getByRole("button", { name: /^Üretici/ }));
    await user.click(screen.getByRole("button", { name: /^Hizmet sağlayıcı/ }));
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(summaryValue("Faaliyet Tipi")).toBe("Üretici, Hizmet sağlayıcı");
  }, LONG);
});

describe("OnboardingClient — adım 3 (yetkili ve onay)", () => {
  it("TCKN boşken 'Tamamla': hata kimlik alanının altında, odak orada (beyandan önce); gönderim yok", async () => {
    const user = userEvent.setup();
    await goStep3(user);
    const tckn = screen.getByLabelText("T.C. Kimlik No *");
    expect(screen.queryByText("Geçerli bir T.C. Kimlik No girin")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).not.toHaveBeenCalled();
    expect(tckn).toHaveFocus();
    expect(tckn).toHaveAttribute("aria-invalid", "true");
    expect(tckn).toHaveAccessibleDescription("Geçerli bir T.C. Kimlik No girin");
    // Aynı basışta beyan eksiği de gösterilir.
    expect(screen.getByText("Tamamlamak için beyanı onaylayın")).toBeInTheDocument();
    expect(stepHeading(3)).toBeInTheDocument();
  }, LONG);

  // B: yetkili TCKN checksum'lı doğrulanır (backend isValidTckn birebir).
  it("geçersiz TCKN (checksum hatalı) → yazarken hata + 'Tamamla' göndermez", async () => {
    const user = userEvent.setup();
    await goStep3(user);
    const tckn = screen.getByLabelText("T.C. Kimlik No *");
    // Alan yalnız rakam alır, 11 hanede durur.
    await user.type(tckn, "1000a0000140999");
    expect(tckn).toHaveValue("10000000140");
    expect(screen.getByText(/Geçerli bir T\.C\. Kimlik No/i)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/i }));
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(tckn).toHaveFocus();
    expect(h.completeAsync).not.toHaveBeenCalled();
  }, LONG);

  it("beyan onayı + Tamamla → completeOnboarding beklenen payload'la çağrılır", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    await goStep3(user);
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");

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
        companyType: "LIMITED",
        taxNumber: "1234567890",
        authorizedTckn: "10000000146",
        mainCategoryIds: ["cat1"],
        subCategoryIds: [],
        declarationAccepted: true,
      }),
    );
  }, LONG);

  it("yurt dışı: kimlik no isteğe bağlıdır, etiketi ve ipucu hangi numaranın istendiğini söyler; boşken tamamlanır", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    open(2, { ...GERMANY, declarationAccepted: true });
    expect(screen.queryByLabelText("T.C. Kimlik No *")).toBeNull();
    const id = screen.getByLabelText("Yetkili Kimlik No");
    expect(id).toHaveAttribute("maxLength", "30");
    expect(id.closest("[data-field=authorizedTckn]")).toContainElement(
      screen.getByText("İsteğe bağlı — pasaport ya da ulusal kimlik numaranız"),
    );
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).toHaveBeenCalledTimes(1);
    expect((h.completeAsync.mock.calls[0]![0] as Record<string, unknown>).authorizedTckn).toBeUndefined();
  });

  it("Türkiye: kimlik no ipucu çizilmez (etiket kendini açıklar)", () => {
    open(2);
    expect(screen.getByLabelText("T.C. Kimlik No *")).toHaveAttribute("maxLength", "11");
    expect(screen.queryByText(/pasaport ya da ulusal kimlik/)).toBeNull();
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
    expect(screen.queryByRole("button", { name: /VIES ile doğrula/i })).toBeNull();
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
 * eyalet/bölge; özet "TCKN"/"Vergi dairesi" göstermez, hukuki yapıyı yerel
 * adıyla basar (2026-10-08: yerel ad seçiciden gelir, "Diğer"e yazılmaz).
 */
describe("OnboardingClient — yabancı firma", () => {
  it("DE: yerel hukuki yapı listeden seçilir, ayrı teslimat eyaleti gönderilir; özet yerel yapı + yabancı vergi etiketi", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    render(<OnboardingClient />);
    await pickCountry(user, "Alman", "Almanya");
    await fill(user, screen.getByLabelText("Firma Unvanı *"), "Müller Handel");
    await user.selectOptions(legalFormSelect(), "GmbH");
    // Listeden seçimde serbest metin kutusu açılmaz.
    expect(screen.queryByLabelText(/Hukuki yapı \(yerel/i)).toBeNull();
    await fill(user, screen.getByLabelText("KDV no (VAT) ya da vergi no *"), "DE811234567");
    await user.type(screen.getByLabelText("Şehir *"), "München");
    await user.type(screen.getAllByLabelText("Eyalet / Bölge")[0]!, "Bayern");
    await fill(user, screen.getByLabelText("Açık Adres *"), "Leopoldstr. 1");
    await user.click(screen.getByRole("checkbox", { name: /teslimat adresi olarak kullan/i }));
    const cities = screen.getAllByLabelText("Şehir *");
    expect(cities).toHaveLength(2);
    await user.type(cities[1]!, "Hamburg");
    const states = screen.getAllByLabelText("Eyalet / Bölge");
    expect(states).toHaveLength(2);
    await user.type(states[1]!, "Hamburg");
    await fill(user, screen.getAllByLabelText("Açık Adres *")[1]!, "Hafenstr. 2");
    await user.click(screen.getByRole("button", { name: "Devam" }));

    await pickSector(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));

    // AB ülkesi: etiket katalogdan (web.domain.taxId.label.EU), değer normalize.
    expect(summaryValue("KDV no (VAT) ya da vergi no")).toBe("811234567");
    expect(screen.queryByText("Vergi No / TCKN")).not.toBeInTheDocument();
    expect(screen.queryByText("Vergi Dairesi")).not.toBeInTheDocument();
    expect(summaryValue("Ülke")).toBe("Almanya");
    expect(summaryValue("Hukuki Yapı")).toBe("GmbH");
    // Ayrı teslimat adresi özetde (signup-tr-14).
    expect(summaryValue("Teslimat Adresi")).toBe("Hafenstr. 2, Hamburg, Hamburg");

    await user.click(screen.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/i }));
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "DE",
        // Ülke öneki atılır (tek kaynak shared normalizeTaxId; API aynı).
        taxNumber: "811234567",
        companyType: "LIMITED",
        legalFormLocal: "GmbH",
        stateRegion: "Bayern",
        deliverySameAsBilling: false,
        deliveryCity: "Hamburg",
        deliveryStateRegion: "Hamburg",
        deliveryAddressLine: "Hafenstr. 2",
      }),
    );
  }, 40_000); // Üç adımlı tam form + iki birleşik seçici: tam pakette yük altında 15 sn yetmiyor.
});

/**
 * 2026-09-27 uluslararası denetim: ülke artık "TR" ön seçili DEĞİL — arayüz
 * dili (tr → TR, ru → RU), öteki dillerde boş (bilinçli seçim).
 *
 * 2026-10-08 (sahip kararı): kayıt formu telefonu SORMAZ → yeni hesapta
 * `phone` null'dır, ülke yalnız dil kuralından gelir. Telefonu kayıtlı hesapta
 * (karar öncesi kayıt, eski web paketi) numaranın ülkesi eskisi gibi önce gelir.
 */
describe("OnboardingClient — başlangıç ülkesi ve ülkeye özgü alanlar", () => {
  it("initialOnboardingCountry: telefonsuz hesap (yeni kayıt) → dil kuralı", () => {
    for (const none of [null, undefined, "", "   "]) {
      expect(initialOnboardingCountry(none, "tr")).toBe("TR");
      expect(initialOnboardingCountry(none, "ru")).toBe("RU");
      // İngilizce (ve kural tanımayan her dil): boş — ülke bilinçli seçilir.
      expect(initialOnboardingCountry(none, "en")).toBe("");
      expect(initialOnboardingCountry(none, "de")).toBe("");
    }
  });

  it("initialOnboardingCountry: telefonu kayıtlı hesap (eski kayıt) → telefon ülkesi → dil → boş", () => {
    expect(initialOnboardingCountry("+7 9161234567", "en")).toBe("RU");
    expect(initialOnboardingCountry("+7 7011234567", "tr")).toBe("KZ");
    expect(initialOnboardingCountry("+49 301234567", "ru")).toBe("DE");
    // Kayda kapalı ülkenin telefonu (ABD) ülkeyi belirlemez.
    expect(initialOnboardingCountry("+1 2025550123", "en")).toBe("CA");
    // Çok alan kodlu NANP ülkesi alan kodundan (derin denetim LU-10).
    expect(initialOnboardingCountry("+1 8291234567", "en")).toBe("DO");
    // Kayda kapalı ülkenin telefonu (İran) → dil kuralına düşer.
    expect(initialOnboardingCountry("+989123456700", "en")).toBe("");
    expect(initialOnboardingCountry("+989123456700", "tr")).toBe("TR");
  });

  // Yeni kayıt: `/me` `user.phone` null döner. Ülke arayüz diliyle açılır;
  // "null" metni ya da ülkesiz kilitlenme yok.
  it("telefonsuz hesap, Rusça arayüz: Rusya ile açılır — Rus hukuki yapıları ve ИНН etiketi", () => {
    const locale = vi.spyOn(nextIntl, "useLocale").mockReturnValue("ru");
    try {
      h.meData = {
        user: { firstName: "Ivan", lastName: "Petrov", phone: null },
        company: { onboardingCompletedAt: null },
      };
      render(<OnboardingClient />);
      expect(screen.getByRole("combobox", { name: /^Ülke/ })).not.toHaveValue("");
      expect(screen.queryByLabelText("İl *")).not.toBeInTheDocument();
      expect(optionTexts(legalFormSelect())).toEqual(expect.arrayContaining(["ООО", "АО", "ИП", "Diğer"]));
      expect(screen.getByLabelText("Vergi kimlik no (ИНН / ОГРН) *")).toBeInTheDocument();
    } finally {
      locale.mockRestore();
    }
  });

  it("telefonsuz hesap, Türkçe arayüz: Türkiye ile açılır (il listesi, genel hukuki yapı listesi)", () => {
    h.meData = {
      user: { firstName: "Ada", lastName: "Yılmaz", phone: null },
      company: { onboardingCompletedAt: null },
    };
    render(<OnboardingClient />);
    expect(screen.getByRole("combobox", { name: /^Ülke/ })).toHaveValue("Türkiye");
    expect(screen.getByLabelText("İl *")).toBeInTheDocument();
    expect(screen.getByLabelText("Mahalle")).toBeInTheDocument();
  });

  it("+7 telefonlu kullanıcı (eski kayıt): Rusya ile açılır — Rus hukuki yapıları, ИНН etiketi + ipucu, önekli numara kabul", async () => {
    const user = userEvent.setup();
    h.meData = {
      user: { firstName: "Ivan", lastName: "Petrov", phone: "+7 9161234567" },
      company: { onboardingCompletedAt: null },
    };
    render(<OnboardingClient />);
    expect(screen.queryByLabelText("İl *")).not.toBeInTheDocument();
    expect(optionTexts(legalFormSelect())).toEqual(expect.arrayContaining(["ООО", "АО", "ПАО", "ИП", "Diğer"]));
    expect(legalFormSelect()).toHaveValue("");
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

  it("D-342 / D-353: alanlar DTO sınırlarını taşır; serbest hukuki yapı kutusu kendi adıyla", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveAttribute("maxLength", "150");
    expect(screen.getByLabelText("Açık Adres *")).toHaveAttribute("maxLength", "500");
    await user.selectOptions(legalFormSelect(), "OTHER");
    expect(screen.getAllByLabelText("Hukuki Yapı *")).toHaveLength(1);
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
    await pickSector(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    // Dil seçiciye dokunulmadı: taslağı yazan sürekli kayıt.
    await waitFor(() => {
      expect(readDraft()).toMatchObject({
        v: DRAFT_VERSION,
        step: 2,
        f: {
          country: "TR",
          legalName: "Örnek Ltd.",
          companyType: "LIMITED",
          district: "Kadıköy",
          authorizedTckn: "10000000146",
          mainCategoryIds: ["cat1"],
        },
      });
    }, SLOW);

    // F5 = yeniden bağlanma: son adım, aynı değerler.
    first.unmount();
    const second = render(<OnboardingClient />);
    expect(stepHeading(3)).toBeInTheDocument();
    expect(screen.getByLabelText("T.C. Kimlik No *")).toHaveValue("10000000146");
    expect(summaryValue("Sektörler")).toBe("Yazılım & IT · sektörün tamamı");
    // Okumak silmez: hemen ardından gelen ikinci yenileme de aynı taslağı bulur.
    expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull();
    second.unmount();
    render(<OnboardingClient />);
    expect(screen.getByLabelText("T.C. Kimlik No *")).toHaveValue("10000000146");
    await user.click(screen.getByRole("button", { name: "Geri" }));
    expect(screen.getByTestId("kategori-degeri")).toHaveTextContent('"mainIds":["cat1"]');
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
    await pickSector(user);
    await user.selectOptions(screen.getByRole("combobox", { name: "Dil" }), "en");
    expect(h.updateMeAsync).toHaveBeenCalledWith({ locale: "en" });
    // Gecikme beklenmez: yönlendirme hemen gelir.
    expect(readDraft()).toMatchObject({ v: DRAFT_VERSION, step: 1, f: { mainCategoryIds: ["cat1"] } });

    // LocaleUrlSync yönlendirmesi = yeniden bağlanma.
    first.unmount();
    render(<OnboardingClient />);
    expect(stepHeading(2)).toBeInTheDocument();
    expect(screen.getByTestId("kategori-degeri")).toHaveTextContent('"mainIds":["cat1"]');
    await user.click(screen.getByRole("button", { name: "Geri" }));
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveValue("Örnek Ltd.");
    expect(screen.getByLabelText("İlçe *")).toHaveValue("Kadıköy");
  }, LONG);

  // 2026-10-08: adım sırası ve hukuki yapı alanlarının anlamı değişti; eski
  // biçimdeki taslağın `step: 1`i artık başka bir adımdır. Taslak ATILMAZ
  // (inceleme 2026-10-08: dağıtım anında kaydın ortasındaki kurucu yazdığı her
  // şeyi kaybediyordu): alan adları aynı kaldığından değerler korunur, sihirbaz
  // yeni sıranın İLK adımından açılır.
  it.each([
    ["sürümsüz", { step: 1 }],
    ["sürüm 1", { v: 1, step: 2 }],
  ])("ESKİ BİÇİMDEKİ taslak (%s) atılmaz: 1. adımda açılır, yazılanlar yerinde", async (_label, head) => {
    const user = userEvent.setup();
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...head, f: { ...VALID_TR, legalName: "Eski Taslak A.Ş." } }),
    );
    render(<OnboardingClient />);
    expect(stepHeading(1)).toBeInTheDocument();
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveValue("Eski Taslak A.Ş.");
    expect(screen.getByLabelText("Vergi No / TCKN *")).toHaveValue("1234567890");
    expect(screen.getByLabelText("İlçe *")).toHaveValue("Kadıköy");
    // Türkiye'de genel liste: eski seçim (Limited Şirket) aynen geçerli.
    expect(legalFormSelect()).toHaveValue("LIMITED");
    // Sonraki adımların alanları da korunur: kategori (2.), kimlik no (3.).
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByTestId("kategori-degeri")).toHaveTextContent('"mainIds":["cat1"]');
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByLabelText("T.C. Kimlik No *")).toHaveValue("10000000146");
  });

  // Eski sihirbaz her ülkeye genel dört türü sunuyordu; yabancı firma "Diğer"e
  // yerel adını yazıyordu. Yeni sihirbaz taslağı ülkenin listesiyle uzlaştırır.
  it("ESKİ taslakta yabancı firma: 'Diğer'e yazılmış listedeki ad seçili gelir; genel tür seçimsiz açılır (yeniden seçilir)", () => {
    const foreign = { ...VALID_TR, ...GERMANY, legalName: "Müller Handel" };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 2, f: { ...foreign, companyType: "OTHER", legalFormLocal: "GmbH" } }));
    const first = render(<OnboardingClient />);
    expect(stepHeading(1)).toBeInTheDocument();
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveValue("Müller Handel");
    expect(legalFormSelect()).toHaveValue("GmbH");
    first.unmount();

    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 2, f: { ...foreign, companyType: "LIMITED", legalFormLocal: "" } }));
    render(<OnboardingClient />);
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveValue("Müller Handel");
    expect(legalFormSelect()).toHaveValue("");
  });

  it("bu kodun bilmediği sürümün taslağı okunmaz ve silinir: sihirbaz boş 1. adımda açılır", () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ v: DRAFT_VERSION + 1, step: 2, f: { ...VALID_TR, legalName: "Gelecek Taslak A.Ş." } }),
    );
    render(<OnboardingClient />);
    expect(stepHeading(1)).toBeInTheDocument();
    expect(screen.getByLabelText("Firma Unvanı *")).toHaveValue("");
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("taslaktaki hukuki yapı ülkenin listesinde yoksa seçimsiz açılır; listedeyse seçili gelir", () => {
    const view = open(0, { country: "FR", companyType: "LIMITED", legalFormLocal: "GmbH", taxNumber: "FR12345678901" });
    expect(legalFormSelect()).toHaveValue("");
    view.unmount();
    open(0, { country: "FR", companyType: "LIMITED", legalFormLocal: "SARL", taxNumber: "FR12345678901" });
    expect(legalFormSelect()).toHaveValue("SARL");
  });

  it("onboarding tamamlanınca taslak silinir ve geri yazılmaz", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    await goStep3(user);
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
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
    storeDraft(1, { legalName: "Başkası A.Ş." }, "rothern:onboarding-draft:u2");
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
describe("OnboardingClient — özet kaydedilecek şirket ve faaliyet bilgilerini listeler (signup-tr-14)", () => {
  it("ülke, web sitesi, adres, teslimat adresi, sektörler ve faaliyet tipleri özetde; yetkili adı ve kimlik no üstteki alanlarda — özette yinelenmez", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await fill(user, screen.getByLabelText(/Web siteniz/), "www.ozturkcelik.com.tr");
    await fill(user, screen.getByLabelText("Posta Kodu"), "34710");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await pickSector(user);
    await user.click(screen.getByRole("button", { name: /^Üretici/ }));
    await user.click(screen.getByRole("button", { name: /^Hizmet sağlayıcı/ }));
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");

    expect(summaryValue("Ülke")).toBe("Türkiye");
    expect(summaryValue("Firma Unvanı")).toBe("Örnek Ltd.");
    expect(summaryValue("Hukuki Yapı")).toBe("Limited Şirket");
    expect(summaryValue("Vergi No / TCKN")).toBe("1234567890");
    expect(summaryValue("Vergi Dairesi")).toBe("Kadıköy VD");
    expect(summaryValue("Web Sitesi")).toBe("www.ozturkcelik.com.tr");
    expect(summaryValue("Adres")).toBe("Moda Cad. No:1, 34710 Kadıköy / İstanbul");
    expect(summaryValue("Teslimat Adresi")).toBe("Fatura adresiyle aynı");
    expect(summaryValue("Rol")).toBe("Kurucu · satış koltuğu");
    // Bu testte yalnız sektörün tamamı seçildi: özet onu öyle yazar (CAT-D2)…
    expect(summaryLines("Sektörler")).toEqual(["Yazılım & IT · sektörün tamamı"]);
    expect(summaryValue("Faaliyet Tipi")).toBe("Üretici, Hizmet sağlayıcı");
    // Özetin ilk satırı ülke (alanların adımlardaki sırası).
    const terms = Array.from(document.querySelectorAll("dl dt")).map((dt) => dt.textContent);
    expect(terms.slice(0, 3)).toEqual(["Ülke", "Firma Unvanı", "Hukuki Yapı"]);
    // …ve tek tek seçilen ürün/hizmet olmadığından boş "Ürün ve Hizmetler: —" satırı basılmaz.
    expect(terms).not.toContain("Ürün ve Hizmetler");
    expect(terms.slice(-2)).toEqual(["Sektörler", "Faaliyet Tipi"]);
    // Yetkilinin adı ve kimlik numarası aynı ekranda alan olarak duruyor.
    expect(terms).not.toContain("Yetkili");
    expect(terms).not.toContain("T.C. Kimlik No");
    // Kimlik no ekrana düz metin olarak basılmaz (yalnız alanın değeri).
    expect(screen.queryByText("10000000146")).toBeNull();
  }, LONG);

  /** Geçerli, son adımda duran bir TR taslağı (yenileme sonrası durum). */
  const openSummaryDraft = (over: Record<string, unknown> = {}) =>
    open(2, {
      mainCategoryIds: ["39000000"],
      // Depoda ata zinciri de durur; özet yalnız kullanıcının seçtiğini yazar.
      subCategoryIds: ["39120000", "39121600", "39121614"],
      declarationAccepted: true,
      ...over,
    });

  it("seçilen ürün/hizmetler adlarıyla listelenir (ata zinciri değil, kullanıcının seçtiği)", () => {
    h.cats = [
      { id: "39121614", nameTr: "Kablo kanalları" },
      { id: "39000000", nameTr: "Elektrik Sistemleri" },
    ];
    openSummaryDraft();
    expect(screen.getByRole("button", { name: "Tamamla" })).toBeInTheDocument();
    expect(summaryValue("Ürün ve Hizmetler")).toBe("Kablo kanalları");
    // Altında seçim olan sektör işaretsiz yazılır (tamamı beyan edilmedi). Adı
    // sektör listesinde yoksa (gizli sektör, düşen liste) ad isteğinden gelir.
    expect(summaryLines("Sektörler")).toEqual(["Elektrik Sistemleri"]);
  });

  /**
   * Kayıt arayüz testi 2026-10 CAT-D2: özet, tamamı beyan edilen sektörü
   * "Sektörler = Kimyasal Maddeler" + "Ürün ve Hizmetler = —" diye yazıyor;
   * karışık seçimde sektörleri işaretsiz ve katalog sırasıyla (2. adımdaki
   * kartlardan farklı sırada) listeliyordu.
   */
  describe("kategori beyanı 2. adımdaki kartlar gibi okunur (CAT-D2)", () => {
    const NAMES = [
      { id: "12000000", nameTr: "Kimyasal Maddeler" },
      { id: "14000000", nameTr: "Kağıt Ürünler ve Malzemeler" },
      { id: "22000000", nameTr: "Ağır İş Ekipmanı" },
      { id: "31000000", nameTr: "Üretim Bileşenleri ve Malzemeleri" },
    ];

    it("yalnız sektörün tamamı: '<sektör> · sektörün tamamı'; 'Ürün ve Hizmetler' satırı yok", () => {
      h.roots.data = NAMES;
      openSummaryDraft({ mainCategoryIds: ["12000000"], subCategoryIds: [] });
      expect(summaryLines("Sektörler")).toEqual(["Kimyasal Maddeler · sektörün tamamı"]);
      // Boş "Ürün ve Hizmetler: —" satırı basılmaz.
      expect(screen.queryByText("Ürün ve Hizmetler", { selector: "dt" })).toBeNull();
    });

    it("karışık seçim: sektörler KART sırasıyla, tamamı beyan edilenler işaretli; seçimler de kart sırasıyla", () => {
      // Sektör listesi katalog sırasıyla gelir; kartlar KAYITLI sırayla çizilir.
      h.roots.data = NAMES;
      h.cats = [
        { id: "14111501", nameTr: "Fotokopi kağıdı" },
        { id: "31160000", nameTr: "Hırdavat" },
        { id: "31171500", nameTr: "Rulmanlar" },
      ];
      openSummaryDraft({
        mainCategoryIds: ["22000000", "31000000", "12000000", "14000000"],
        // Depoda ata zinciri de durur; alt kodların sırası kart sırası değildir.
        subCategoryIds: ["14110000", "14111500", "14111501", "31160000", "31170000", "31171500"],
      });
      expect(summaryLines("Sektörler")).toEqual([
        "Ağır İş Ekipmanı · sektörün tamamı",
        "Üretim Bileşenleri ve Malzemeleri",
        "Kimyasal Maddeler · sektörün tamamı",
        "Kağıt Ürünler ve Malzemeler",
      ]);
      expect(summaryValue("Ürün ve Hizmetler")).toBe("Hırdavat, Rulmanlar, Fotokopi kağıdı");
    });

    it("categoryDeclarationGroups: kayıtlı sektör sırası; altı boş grup = sektörün tamamı; ata zinciri seçim sayılmaz", () => {
      expect(
        categoryDeclarationGroups(
          ["22000000", "31000000", "12000000"],
          ["31160000", "31170000", "31171500", "31171501"],
        ),
      ).toEqual([
        { sector: "22000000", picks: [] },
        // 31170000 ve 31171500, 31171501'in atalarıdır; 31160000 ayrı bir seçimdir.
        { sector: "31000000", picks: ["31160000", "31171501"] },
        { sector: "12000000", picks: [] },
      ]);
      // Sektörü ana eksende olmayan seçim (eski kayıt) kendi grubunu sona açar.
      expect(categoryDeclarationGroups(["12000000"], ["14111501"])).toEqual([
        { sector: "12000000", picks: [] },
        { sector: "14000000", picks: ["14111501"] },
      ]);
      expect(categoryDeclarationGroups([], [])).toEqual([]);
    });
  });

  // Yenilemeyle geri gelen taslak sihirbazı doğrudan son adımda açabilir:
  // "Tamamla" önceki adımları da denetler, eksik alanın adımına döner.
  it("son adımda açılan taslakta önceki adım geçersizse 'Tamamla' göndermez, o alanın adımına döner", async () => {
    const user = userEvent.setup();
    openSummaryDraft({ postalCode: "123" });
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).not.toHaveBeenCalled();
    const postal = await screen.findByLabelText("Posta Kodu", {}, SLOW);
    expect(postal).toHaveFocus();
    expect(screen.getByText("Türkiye adresinde posta kodu 5 haneli olmalıdır")).toBeInTheDocument();
    expect(stepHeading(1)).toBeInTheDocument();
  });

  it("son adımda açılan taslakta kategori yoksa 'Tamamla' 2. adıma döner, hata seçicide", async () => {
    const user = userEvent.setup();
    openSummaryDraft({ mainCategoryIds: [], subCategoryIds: [] });
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).not.toHaveBeenCalled();
    expect(await screen.findByTestId("kategori-hatasi", {}, SLOW)).toHaveTextContent("En az bir ürün ya da hizmet seçin");
    expect(stepHeading(2)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ürün / hizmet seçin" })).toHaveFocus();
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
    await pickSector(user);
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
      // geçerli adımı göstergedeki `aria-current` öğesinden okur).
      const second = stepHeading(2);
      expect(second).toHaveFocus();
      expect(second).toHaveAccessibleDescription("Faaliyet alanı");
      expect(screen.getAllByText("Faaliyet alanı")).toHaveLength(1);
      expect(screen.getAllByRole("heading", { name: /Şirket bilgileri/i })).toHaveLength(1);
      expect(screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step")).toHaveTextContent(
        "Faaliyet alanı",
      );
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      // Kaydırılan öğe sihirbazın başlığı (üstünde yalnız logo çubuğu var).
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole("heading", { level: 1, name: "Şirket bilgileri" }));
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "start" });

      // Son adıma geçiş de aynı: başa kaydırma + odak başlıkta.
      await pickSector(user);
      await user.click(screen.getByRole("button", { name: "Devam" }));
      const third = stepHeading(3);
      expect(third).toHaveFocus();
      expect(third).toHaveAccessibleDescription("Yetkili ve onay");
      expect(screen.getAllByText("Yetkili ve onay")).toHaveLength(1);
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "start" });

      await user.click(screen.getByRole("button", { name: "Geri" }));
      expect(stepHeading(2)).toHaveFocus();
      await user.click(screen.getByRole("button", { name: "Geri" }));
      const first = stepHeading(1);
      expect(first).toHaveFocus();
      expect(first).toHaveAccessibleDescription("Şirket bilgileri");
      expect(screen.getAllByRole("heading", { name: /Şirket bilgileri/i })).toHaveLength(1);
      expect(scrollIntoView).toHaveBeenCalledTimes(4);

      // Eksik alanla basılan "Devam" adımı değiştirmez: BAŞA kaydırma yok, odak
      // alanda; alanın kendisi görünür kılınır (resignup-3, aşağıdaki describe).
      await user.clear(screen.getByLabelText("Vergi Dairesi *"));
      await user.click(screen.getByRole("button", { name: "Devam" }));
      expect(screen.getByLabelText("Vergi Dairesi *")).toHaveFocus();
      expect(scrollIntoView).toHaveBeenCalledTimes(5);
      expect(scrollIntoView.mock.contexts[4]).toBe(screen.getByLabelText("Vergi Dairesi *"));
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  }, LONG);
});

describe("OnboardingClient — sunucu hatası alanın adımında gösterilir (signup-tr-6)", () => {
  /** Geçerli, beyanı onaylı TR formu son adımda (yenileme sonrası durum). */
  const openReady = (over: Record<string, unknown> = {}) => open(2, { declarationAccepted: true, ...over });

  it("alanı bilinen ret (1. adım): sihirbaz o alanın adımına döner, hata alanın altında, değer düzeltilince kaybolur", async () => {
    const user = userEvent.setup();
    const message = "Türkiye adresinde posta kodu 5 haneli olmalıdır";
    h.completeAsync.mockRejectedValue(apiError(400, { message, i18nKey: "api.companyAddresses.trPostaKodu5Hane" }));
    openReady();
    await user.click(screen.getByRole("button", { name: "Tamamla" }));

    // 1. adım, hata Posta Kodu alanında — son adımda kırmızı kutu değil.
    const postal = await screen.findByLabelText("Posta Kodu", {}, SLOW);
    expect(stepHeading(1)).toBeInTheDocument();
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

  it("kategori reddi (2. adımın alanı): sihirbaz 'Faaliyet alanı'na döner, hata seçiciye verilir, odak seçicide", async () => {
    const user = userEvent.setup();
    const message = "Geçersiz alt kategori seçimi";
    h.completeAsync.mockRejectedValue(apiError(400, { message, i18nKey: "api.helpers.gecersizAltKategoriSecimi" }));
    openReady({ mainCategoryIds: ["cat2"] });
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(await screen.findByTestId("kategori-hatasi", {}, SLOW)).toHaveTextContent(message);
    expect(stepHeading(2)).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Ürün / hizmet seçin" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAccessibleDescription(message);
    // Hata yalnız seçicide: adımın hata kutusu ayrıca çizilmez.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    // Seçim değişince hata kalkar.
    await pickSector(user);
    await waitFor(() => expect(screen.queryByTestId("kategori-hatasi")).toBeNull());
  });

  it("yetkili kimlik no reddi (son adımın alanı): adım değişmez, hata kimlik alanının altında, odak orada", async () => {
    const user = userEvent.setup();
    const message = "Yetkili T.C. Kimlik No geçersiz";
    h.completeAsync.mockRejectedValue(apiError(400, { message, i18nKey: "api.companyAuth.yetkiliTCKimlikNoGecersiz" }));
    openReady();
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    const tckn = screen.getByLabelText("T.C. Kimlik No *");
    await waitFor(() => expect(tckn).toHaveAccessibleDescription(message), SLOW);
    expect(stepHeading(3)).toBeInTheDocument();
    expect(tckn).toHaveFocus();
    expect(tckn).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hukuki yapı reddi: 1. adıma döner, hata seçicinin altında; 'Diğer'in yerel adı reddedilirse serbest metin kutusunun altında", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockRejectedValue(apiError(400, { message: "Doğrulama hatası", errors: { companyType: "Geçersiz değer" } }));
    const first = openReady({ ...GERMANY });
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    await waitFor(() => expect(legalFormSelect()).toHaveAccessibleDescription(/Geçersiz değer/), SLOW);
    expect(legalFormSelect()).toHaveFocus();
    expect(stepHeading(1)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    // Başka bir yapı seçilince hata kalkar.
    await user.selectOptions(legalFormSelect(), "AG");
    expect(screen.queryByText(/Geçersiz değer/)).toBeNull();
    first.unmount();

    sessionStorage.clear();
    h.completeAsync.mockRejectedValue(
      apiError(400, { message: "Hukuki yapınızı yazın", i18nKey: "api.companyAuth.yerelHukukiYapiZorunlu" }),
    );
    openReady({ companyType: "OTHER", legalFormLocal: "Xy" });
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    const free = await screen.findByLabelText("Hukuki yapı (yerel adıyla)", {}, SLOW);
    expect(free).toHaveFocus();
    expect(free).toHaveAccessibleDescription("Hukuki yapınızı yazın");
  });

  it("alanı bilinmeyen ret: yalnız son adımdaki kutuda; herhangi bir değer değişince kaybolur", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockRejectedValue(apiError(400, { message: "Firma doğrulaması zaten tamamlanmış" }));
    openReady();
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(await screen.findByRole("alert", {}, SLOW)).toHaveTextContent("Firma doğrulaması zaten tamamlanmış");
    // Geri gidince kutu peşinden gelmez.
    await user.click(screen.getByRole("button", { name: "Geri" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Geri" }));
    expect(screen.queryByRole("alert")).toBeNull();
    // Bir değer düzeltilip son adıma dönülünce kutu yok ("Tamamla"ya basılmadan).
    await fill(user, screen.getByLabelText("Mahalle"), "Caferağa");
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.click(screen.getByRole("button", { name: "Devam" }));
    expect(screen.getByRole("button", { name: "Tamamla" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  }, LONG);

  it("serverErrorField: DTO alanı, katalog anahtarı ve kodla sahibi alanı bulur", () => {
    const f = { postalCode: "34710", deliveryPostalCode: "", deliverySameAsBilling: true, website: "", taxNumber: "", companyType: "LIMITED" };
    const of = (data: Record<string, unknown>, form = f) => serverErrorField(apiError(400, data), form as never);
    expect(of({ message: "Doğrulama hatası", errors: { website: "…" } })).toBe("website");
    expect(of({ message: "Doğrulama hatası", errors: { companyType: "…" } })).toBe("companyType");
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
    expect(of({ message: "x", i18nKey: "api.companyAuth.yerelHukukiYapiZorunlu" })).toBe("legalFormLocal");
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
    for (const p of ru) expect(p.label).toMatch(/^[Ѐ-ӿ]/);
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
      ...GERMANY,
      taxNumber: "DE811234567",
      city: "",
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
  it("sektör listesi yüklenemediyse 'Devam': odak 'Yeniden dene'de, kategori hatası yükleme hatasının altında ve düğmeye bağlı", async () => {
    const user = userEvent.setup();
    h.roots.isError = true;
    h.roots.data = undefined;
    open(1, { mainCategoryIds: [] });
    const retry = screen.getByRole("button", { name: "Yeniden dene" });
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
    await user.click(screen.getByRole("button", { name: "Ürün / hizmet seçin" }));
    expect(screen.getByRole("dialog", { name: "Ürün ve hizmetleriniz" })).toBeInTheDocument();
    // Arka plan tazelemesi düştü: hata + eldeki liste.
    h.roots.isError = true;
    view.rerender(<OnboardingClient />);
    expect(screen.queryByText(/Sektörler yüklenemedi/)).toBeNull();
    // Pencere açık kaldı (seçici sökülüp yeniden bağlanmadı), seçim yapılabiliyor.
    expect(screen.getByRole("dialog", { name: "Ürün ve hizmetleriniz" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yazılım & IT seç" }));
    expect(screen.getByTestId("kategori-degeri")).toHaveTextContent('"mainIds":["cat1"]');
  });

  // webcat-5: sihirbaz yalnız seçimleri soruyordu; seçici seçimler + sektörleri
  // sorduğu için sorgu anahtarı hiç tutmuyor, ikinci bir `by-ids` isteği
  // varsayılan seçeneklerle (429'da üç tekrar, 5xx'te genel toast) çıkıyordu.
  // Seçicinin kendi isteği kendi testinde; burada sihirbazın isteği kilitli.
  it.each([
    [1, "seçici çizili (2. adım)"],
    [2, "özet (son adım)"],
  ])("ad isteği seçiciyle AYNI id listesi (seçimler + sektörler) ve seçenekle yapılır — %i: %s", (step) => {
    open(step, {
      mainCategoryIds: ["39000000"],
      // Depoda ata zinciri de durur; adı sorulan kullanıcının seçtiği yapraktır.
      subCategoryIds: ["39120000", "39121600", "39121614"],
      declarationAccepted: true,
    });
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

/**
 * Kayıt denetimi 2026-10 üçüncü tur: hata yuvası olmayan alanın reddi
 * (resignup-1), yapıştırılan posta kodu (resignup-2), odaklanan alanın
 * etiketi (resignup-3).
 */
describe("OnboardingClient — kayıt denetimi 2026-10 üçüncü tur", () => {
  /** Geçerli, beyanı onaylı TR taslağı son adımda (yenileme sonrası durum). */
  const openSummary = (over: Record<string, unknown> = {}) => open(2, { declarationAccepted: true, ...over });
  const reject = (errors: Record<string, string>) =>
    h.completeAsync.mockRejectedValue(apiError(400, { message: "Doğrulama hatası", errors }));

  /** İleti duyuruluyor mu: `role="alert"` içinde ya da geçersiz bir denetimin açıklaması. */
  const announced = (node: HTMLElement): boolean =>
    node.closest('[role="alert"]') !== null ||
    Array.from(document.querySelectorAll('[aria-invalid="true"]')).some((el) =>
      (el.getAttribute("aria-describedby") ?? "").split(/\s+/).includes(node.id),
    );

  // resignup-1: API mahalle (150 karakter), faaliyet tipi gibi hata yuvası
  // OLMAYAN bir alanı reddedince sihirbaz o alanın adımına dönüyor ve HİÇBİR
  // ŞEY göstermiyordu (ileti yok, kutu yok, odak <body>'de). Formun her alanı
  // için: ret görünür ve duyurulur.
  it.each(ONBOARDING_FORM_KEYS)("sunucu '%s' alanını reddederse ileti görünür ve duyurulur", async (key) => {
    const user = userEvent.setup();
    reject({ [key]: "sunucu reddi" });
    openSummary();
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    const message = await screen.findByText(/sunucu reddi/, {}, SLOW);
    expect(message).toBeVisible();
    expect(announced(message)).toBe(true);
  });

  // Reddedilen alan SAHİBİ adımda gösterilir (2026-10-08 adım sırası).
  it.each([
    ["country", 1],
    ["legalName", 1],
    ["companyType", 1],
    ["taxNumber", 1],
    ["addressLine", 1],
    ["neighborhood", 1],
    ["mainCategoryIds", 2],
    ["subCategoryIds", 2],
    ["activities", 2],
    ["authorizedTckn", 3],
    ["declarationAccepted", 3],
  ] as const)("sunucu '%s' alanını reddederse sihirbaz %i. adımdadır", async (key, step) => {
    const user = userEvent.setup();
    reject({ [key]: "sunucu reddi" });
    openSummary();
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    await screen.findByText(/sunucu reddi/, {}, SLOW);
    // Adım göstergesinden okunur (rol sorgusu değil): odak ülke kutusuna gelince
    // açılan liste sayfanın kalanını yardımcı teknolojiden gizler.
    expect(document.querySelector('li[aria-current="step"]')).toHaveTextContent(
      ["Şirket bilgileri", "Faaliyet alanı", "Yetkili ve onay"][step - 1]!,
    );
  });

  // Koşullu çizilen yuvalar: yuva çiziliyken ret ALANIN ALTINDA (kutu yok),
  // çizili değilken kutuda. `hasErrorSlot` ile JSX ayrışırsa bu satırlar kırılır.
  const SEPARATE_DELIVERY = {
    deliverySameAsBilling: false,
    deliveryCity: "Ankara",
    deliveryPostalCode: "06100",
    deliveryAddressLine: "Depo Sok. No:2",
  };
  it.each([
    ["deliveryCity", SEPARATE_DELIVERY, "field"],
    ["deliveryPostalCode", SEPARATE_DELIVERY, "field"],
    ["deliveryAddressLine", SEPARATE_DELIVERY, "field"],
    ["companyType", {}, "field"],
    ["companyType", GERMANY, "field"],
    ["legalFormLocal", { companyType: "OTHER", legalFormLocal: "Kooperatif" }, "field"],
    // Listeden seçilen yerel adın serbest metin kutusu yok → adımın kutusunda.
    ["legalFormLocal", GERMANY, "box"],
    ["taxOffice", GERMANY, "box"],
    ["district", GERMANY, "box"],
  ] as const)("koşullu yuva — '%s' reddi: %o → %s", async (key, over, where) => {
    const user = userEvent.setup();
    reject({ [key]: "sunucu reddi" });
    openSummary(over);
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    const message = await screen.findByText(/sunucu reddi/, {}, SLOW);
    expect(announced(message)).toBe(true);
    if (where === "box") {
      expect(message).toHaveAttribute("role", "alert");
      expect(message).toHaveFocus();
    } else {
      // Alanın altında: geçersiz denetimin açıklaması, odak o denetimde; kutu yok.
      const control = document.activeElement as HTMLElement;
      expect(control).toHaveAttribute("aria-invalid", "true");
      expect(control).toHaveAccessibleDescription(/sunucu reddi/);
      expect(control.closest(`[data-field="${key}"]`)).not.toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    }
  });

  it("hata yuvası olmayan alan (mahalle): alanın adımına döner, ret adımın başındaki kutuda ALAN ADIYLA, odak kutuda", async () => {
    const user = userEvent.setup();
    reject({ neighborhood: "En fazla 100 karakter olabilir" });
    openSummary();
    await user.click(screen.getByRole("button", { name: "Tamamla" }));

    const box = await screen.findByRole("alert", {}, SLOW);
    expect(box).toHaveTextContent("Mahalle: En fazla 100 karakter olabilir");
    // 1. adım (mahalle orada) ve odak kutuda — <body>'de değil.
    expect(stepHeading(1)).toBeInTheDocument();
    expect(box).toHaveFocus();
    // Kutu adımın başında: ilk alandan (ülke) önce gelir.
    expect(
      box.compareDocumentPosition(screen.getByRole("combobox", { name: /^Ülke/ })) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Başka bir alanı değiştirmek kutuyu silmez; reddedilen alanı değiştirmek siler.
    await fill(user, screen.getByLabelText("Web siteniz"), "ornek.com");
    expect(screen.getByRole("alert")).toHaveTextContent("Mahalle:");
    await fill(user, screen.getByLabelText("Mahalle"), "Caferağa");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("2. adımın yuvasız alanı (faaliyet tipi): kutu o adımda, öteki adımlarda görünmez", async () => {
    const user = userEvent.setup();
    reject({ activities: "Geçersiz faaliyet tipi" });
    openSummary();
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    const box = await screen.findByRole("alert", {}, SLOW);
    expect(box).toHaveTextContent("Faaliyet Tipi: Geçersiz faaliyet tipi");
    expect(stepHeading(2)).toBeInTheDocument();
    expect(box).toHaveFocus();
    // Kutu adımın başında: kategori seçiciden önce.
    expect(
      box.compareDocumentPosition(screen.getByTestId("kategori-secici")) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Geri" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("yuvası o an çizili olmayan alan (ayrı teslimat adresi kapalıyken teslimat ili) da kutuda gösterilir", async () => {
    const user = userEvent.setup();
    reject({ deliveryCity: "Teslimat ili zorunlu" });
    openSummary();
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    const box = await screen.findByRole("alert", {}, SLOW);
    expect(box).toHaveTextContent("Teslimat Adresi – İl: Teslimat ili zorunlu");
    expect(stepHeading(1)).toBeInTheDocument();
  });

  it("listeden seçilen yerel hukuki yapı reddedilirse kutu alanı adıyla söyler", async () => {
    const user = userEvent.setup();
    reject({ legalFormLocal: "En fazla 80 karakter olabilir" });
    openSummary(GERMANY);
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    const box = await screen.findByRole("alert", {}, SLOW);
    expect(box).toHaveTextContent("Hukuki yapı (yerel adıyla): En fazla 80 karakter olabilir");
    expect(stepHeading(1)).toBeInTheDocument();
  });

  it("sahibi bilinmeyen ret: son adımdaki kutu 'Tamamla'nın üstünde, odağı alır (odak <body>'de kalmaz)", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockRejectedValue(apiError(400, { message: "Firma doğrulaması zaten tamamlanmış" }));
    openSummary();
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    const box = await screen.findByRole("alert", {}, SLOW);
    expect(box).toHaveTextContent("Firma doğrulaması zaten tamamlanmış");
    const finish = screen.getByRole("button", { name: "Tamamla" });
    expect(box).toHaveFocus();
    // Beyan kutusundan sonra, "Tamamla"dan önce.
    const declaration = screen.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/i });
    expect(declaration.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(finish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // resignup-2: alanın `maxLength`i (5) yapıştırılan metni rakam dışı
  // karakterler ayıklanmadan ÖNCE kesiyordu: " 34710" → "3471", "TR-34710" → "34".
  it.each([" 34710", "34 710", "TR-34710", "34710-1234"])(
    "Türkiye posta kodu: yapıştırılan '%s' beş rakamı korur",
    async (pasted) => {
      const user = userEvent.setup();
      render(<OnboardingClient />);
      const postal = screen.getByLabelText("Posta Kodu");
      await user.click(postal);
      await user.paste(pasted);
      expect(postal).toHaveValue("34710");
    },
  );

  it("Türkiye posta kodu: ayrı teslimat adresinin kutusu da aynı kuralla temizler; yabancı ülkede 12 karakter sınırı kalır", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await user.click(screen.getByRole("checkbox", { name: /teslimat adresi olarak kullan/i }));
    const delivery = screen.getAllByLabelText("Posta Kodu")[1]!;
    await user.click(delivery);
    await user.paste(" 06 100");
    expect(delivery).toHaveValue("06100");
    expect(delivery).not.toHaveAttribute("maxlength");
    await pickCountry(user, "alman", "Almanya");
    expect(screen.getAllByLabelText("Posta Kodu")[0]).toHaveAttribute("maxlength", "12");
  }, LONG);

  // resignup-3: tarayıcı odaklanan kutuyu görünüm alanının kenarına yaslıyor,
  // üstündeki etiket ekran dışında kalıyordu. Odak kaydırmasız verilir, alan
  // kaydırma payıyla (etiket + hata satırı) görünür kılınır.
  it("ilk hatalı alana gidiş: odak kaydırmasız, alan kaydırma payıyla görünür kılınır", async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      const user = userEvent.setup();
      render(<OnboardingClient />);
      focus.mockClear();
      await user.click(screen.getByRole("button", { name: "Devam" }));
      const legal = screen.getByLabelText("Firma Unvanı *");
      expect(legal).toHaveFocus();
      // Tarayıcının kendi (kenara yaslayan) kaydırması kapalı…
      const call = focus.mock.calls.findIndex((_, i) => focus.mock.contexts[i] === legal);
      expect(focus.mock.calls[call]).toEqual([{ preventScroll: true }]);
      // …alanı payıyla birlikte görünür kılan kaydırma açık.
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(legal);
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
      // Pay kartta tanımlı ve `data-field` kutularındaki denetimlere iner.
      const card = legal.closest('[class*="scroll-mt-"]');
      expect(card).not.toBeNull();
      expect(card!.className).toContain("[&_[data-field]_:is(input,select,textarea,button,[role=checkbox])]:scroll-mt-20");
      expect(card!.className).toContain("[&_[data-field]_:is(input,select,textarea,button,[role=checkbox])]:scroll-mb-16");
      expect(legal.closest("[data-field]")).not.toBeNull();
      // Hukuki yapı seçicisi de pay alan bir `data-field` kutusunda.
      expect(legalFormSelect().closest("[data-field=companyType]")).not.toBeNull();
    } finally {
      focus.mockRestore();
      Element.prototype.scrollIntoView = original;
    }
  });
});
