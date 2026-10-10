// @vitest-environment jsdom
/**
 * ÜRÜN FORMU — KATEGORİ DEĞİŞİNCE NİTELİK DEĞERLERİ (son canlı kontrol
 * 2026-10-10, NEW-PF-2).
 *
 * Ayıklama efekti `categoryId` değişir değişmez, yeni kategorinin tanımları
 * henüz okunmamışken (boş varsayılan) koşuyor ve HER değeri siliyordu: kardeş
 * kategoriye geçen ("Mika" → "Kuvars", aynı nitelik seti) ya da "güncel bir
 * kategori seçin" notuna uyan sahip, kayıtlı niteliklerini kaydederken
 * kaybediyordu. Kural: yalnız yeni kategorinin tanımları OKUNDUKTAN sonra ve
 * yalnız orada TANIMSIZ anahtarlar düşer; bekleyen / düşen okumada hiçbir şey
 * silinmez.
 *
 * Gözden geçirme REV-PF-1: kalan değer yalnız ANAHTARA göre değil yeni TANIMA
 * göre süzülür — aynı anahtar başka kategoride başka seçenek listesi ya da başka
 * türle tanımlıdır; yeni kategoride seçenek olmayan değer hiçbir kontrolde
 * görünmeden kayda gidiyordu.
 *
 * Gerçek `useCategoryAttributes` kancası + gerçek QueryClient; yalnız
 * `companyApi` sahte. Kategori kutusu sahte: seçimi iki düğme yapar.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  companyGet: vi.fn(),
  publicGet: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => true,
  useCompanyAuth: () => ({ user: null, company: null }),
}));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.companyGet, post: h.post, patch: h.patch },
}));
vi.mock("@/lib/api", () => ({ api: { get: h.publicGet } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satis/urunlerim",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/categories/category-selector-button", () => ({
  CategorySelectorButton: ({ onChange }: { onChange: (ids: string[]) => void }) => (
    <div>
      <button type="button" onClick={() => onChange(["31161600"])}>
        Kardeş kategoriyi seç
      </button>
      <button type="button" onClick={() => onChange([])}>
        Kategoriyi kaldır
      </button>
    </div>
  ),
}));

import { ProductShowcaseForm } from "../product-showcase-form";
import type { ProductShowcase } from "@/hooks/use-company-items";

const SAVED = "31161500";
const SIBLING = "31161600";
/** Eski kaydın gizli segmentteki kategorisi. */
const HIDDEN = "46181500";

const def = (key: string, nameTr: string, type = "TEXT") => ({
  key,
  nameTr,
  type,
  options: [],
  unit: null,
  isRequired: false,
  definedAt: "x",
});
/** Kayıtlı kategorinin seti. */
const SAVED_DEFS = [def("kalinlik", "Kalınlık", "NUMBER"), def("malzeme", "Malzeme"), def("sertifika", "Sertifika")];
/** Kardeş kategori: ikisi ortak, "Sertifika" yok, "Renk" yeni. */
const SIBLING_DEFS = [def("kalinlik", "Kalınlık", "NUMBER"), def("malzeme", "Malzeme"), def("renk", "Renk")];
const STORED = { kalinlik: "2,5", malzeme: "Çelik", sertifika: "CE" };

const PRODUCT: ProductShowcase = {
  id: "p1",
  name: "QA Mika Levha",
  slug: "qa-mika-levha",
  isPublic: false,
  publishedAt: null,
  reviewStatus: "DRAFT",
  submittedAt: null,
  reviewedAt: null,
  rejectReason: null,
  categoryId: SAVED,
  description: "Isıya dayanıklı mika levha, 2,5 mm kalınlık. ".repeat(4),
  images: ["https://cdn.rothern.com/mika.webp"],
  videoUrl: null,
  externalUrl: null,
  documents: null,
  keywords: ["mika levha"],
  attributes: STORED,
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: "10",
  unit: "adet",
  unitCode: "PCE",
  brand: null,
  mpn: null,
  specification: null,
  completion: { score: 0, missing: [] },
  publishBlockers: [],
  attributeDefs: [],
} as unknown as ProductShowcase;

/** Seçenekli nitelik (tek / çoklu seçim). */
const select = (
  key: string,
  nameTr: string,
  type: "SINGLE_SELECT" | "MULTI_SELECT",
  options: string[],
  isRequired = false,
) => ({ ...def(key, nameTr, type), options, isRequired });

/** Kardeş kategorinin nitelik okuması testin elinde: yanıtlar, düşürür ya da bekletir. */
let sibling: { resolve: (defs: unknown[]) => void; reject: (err: unknown) => void };
/** Kayıtlı kategorinin sunucudaki nitelik seti (test değiştirebilir). */
let savedDefs: unknown[];

function renderForm(product: ProductShowcase = PRODUCT) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProductShowcaseForm product={product} unit="adet" onClose={() => {}} />
    </QueryClientProvider>,
  );
}

const attributeRequests = () =>
  h.companyGet.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/company/items/attributes/"));

/** "Taslak olarak kaydet" → sunucuya giden nitelikler. */
async function savedAttributes(user: ReturnType<typeof userEvent.setup>) {
  h.patch.mockResolvedValue({ data: PRODUCT });
  await user.click(screen.getByRole("button", { name: "Diğer işlemler" }));
  await user.click(await screen.findByRole("menuitem", { name: "Taslak olarak kaydet" }));
  await waitFor(() => expect(h.patch).toHaveBeenCalled());
  const [, body] = h.patch.mock.calls[0]!;
  return (body as { categoryId: string | null; attributes: Record<string, unknown> }).attributes;
}

beforeEach(() => {
  for (const fn of [h.companyGet, h.publicGet, h.post, h.patch]) fn.mockReset();
  savedDefs = SAVED_DEFS;
  h.companyGet.mockImplementation((url: string) => {
    if (String(url).endsWith(`/company/items/attributes/${SIBLING}`)) {
      return new Promise((resolve, reject) => {
        sibling = { resolve: (defs) => resolve({ data: defs }), reject };
      });
    }
    return Promise.resolve({ data: String(url).includes("/company/items/attributes/") ? savedDefs : [] });
  });
  h.publicGet.mockResolvedValue({ data: [] });
});

describe("ürün formu — kategori değişince nitelik değerleri (NEW-PF-2)", () => {
  it("yeni kategorinin de tanımladığı değerler KALIR; yalnız orada tanımsız olan düşer", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(await screen.findByLabelText("Kalınlık")).toHaveValue("2,5");

    await user.click(screen.getByRole("button", { name: "Kardeş kategoriyi seç" }));
    await waitFor(() => expect(attributeRequests()).toContain(`/company/items/attributes/${SIBLING}`));
    await act(async () => sibling.resolve(SIBLING_DEFS));

    // Kardeş kategorinin alanları çizildi; ortak iki değer yerinde.
    expect(await screen.findByLabelText("Renk")).toHaveValue("");
    expect(screen.getByLabelText("Kalınlık")).toHaveValue("2,5");
    expect(screen.getByLabelText("Malzeme")).toHaveValue("Çelik");
    expect(screen.queryByLabelText("Sertifika")).toBeNull();
    // Kayda da ortak değerler gider; yeni kategoride tanımsız "Sertifika" gitmez.
    expect(await savedAttributes(user)).toEqual({ kalinlik: "2,5", malzeme: "Çelik" });
  });

  it("yeni kategorinin tanımları BEKLENİRKEN hiçbir değer silinmez", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByLabelText("Kalınlık");

    await user.click(screen.getByRole("button", { name: "Kardeş kategoriyi seç" }));
    await waitFor(() => expect(attributeRequests()).toContain(`/company/items/attributes/${SIBLING}`));
    // Tanımlar okunmadan "bu kategoride nitelik yok" denmez (yanlış boş durum).
    expect(screen.queryByText(/Bu kategoride tanımlı nitelik yok/)).toBeNull();
    // Yanıt gelmedi: eskiden bu anda bütün değerler silinmişti.
    expect(await savedAttributes(user)).toEqual(STORED);
  });

  it("yeni kategorinin tanımları OKUNAMADIYSA hiçbir değer silinmez (ayıklamayı sunucu yapar)", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByLabelText("Kalınlık");

    await user.click(screen.getByRole("button", { name: "Kardeş kategoriyi seç" }));
    await waitFor(() => expect(attributeRequests()).toContain(`/company/items/attributes/${SIBLING}`));
    await act(async () => sibling.reject(Object.assign(new Error("Network Error"), { isAxiosError: true })));

    // Okunamayan tanım "nitelik yok" değil, hata + yeniden dene.
    expect(screen.queryByText(/Bu kategoride tanımlı nitelik yok/)).toBeNull();
    expect(await screen.findByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
    expect(await savedAttributes(user)).toEqual(STORED);
  });

  it("kategori kaldırılıp yenisi seçilince de ortak değerler durur", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByLabelText("Kalınlık");

    await user.click(screen.getByRole("button", { name: "Kategoriyi kaldır" }));
    expect(await screen.findByText(/Önce 1\. bölümde kategori seçin/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kardeş kategoriyi seç" }));
    await waitFor(() => expect(attributeRequests()).toContain(`/company/items/attributes/${SIBLING}`));
    await act(async () => sibling.resolve(SIBLING_DEFS));

    expect(await screen.findByLabelText("Kalınlık")).toHaveValue("2,5");
    expect(screen.getByLabelText("Malzeme")).toHaveValue("Çelik");
  });

  it("eski (gizli segmentteki) kategoriden güncel kategoriye geçen ürün kayıtlı değerlerini korur", async () => {
    const user = userEvent.setup();
    renderForm({ ...PRODUCT, categoryId: HIDDEN } as ProductShowcase);
    // Gizli kategorinin nitelik formu yok: değerler kayıtta durur, alan çizilmez.
    expect(await screen.findByText(/Önce 1\. bölümde kategori seçin/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kardeş kategoriyi seç" }));
    await waitFor(() => expect(attributeRequests()).toEqual([`/company/items/attributes/${SIBLING}`]));
    await act(async () => sibling.resolve(SIBLING_DEFS));

    expect(await screen.findByLabelText("Kalınlık")).toHaveValue("2,5");
    expect(screen.getByLabelText("Malzeme")).toHaveValue("Çelik");
    expect(await savedAttributes(user)).toEqual({ kalinlik: "2,5", malzeme: "Çelik" });
  });
});

/**
 * Gözden geçirme REV-PF-1: 22 anahtar matriste birden çok düğümde, farklı
 * seçenek listesiyle tanımlı ("malzeme": bir ailede Çelik / Alüminyum, kardeşinde
 * Pamuk / Polyester). Yalnız anahtara bakan ayıklama yeni kategoride seçenek
 * OLMAYAN değeri form durumunda bırakıyordu: basılı çip yok, seçim kutusu
 * "Seçiniz", ray yıldızlı niteliği dolu sayıyor; "Pamuk"a basınca kayda
 * ["Çelik", "Pamuk"] + form "Levha" gidiyordu — sahibin göremediği ve
 * kaldıramadığı değerler herkese açık ürün sayfasında etiketleniyordu.
 */
describe("ürün formu — aynı anahtar, farklı tanım (REV-PF-1)", () => {
  const STARRED = /Kategoriye özel yıldızlı \(\*\) nitelikler/;
  const rail = () => within(screen.getByRole("region", { name: "Tamamlanma" }));
  const chip = (name: string) => screen.getByRole("button", { name });

  async function pickSibling(user: ReturnType<typeof userEvent.setup>, defs: unknown[]) {
    await user.click(screen.getByRole("button", { name: "Kardeş kategoriyi seç" }));
    await waitFor(() => expect(attributeRequests()).toContain(`/company/items/attributes/${SIBLING}`));
    await act(async () => sibling.resolve(defs));
  }

  it("yeni kategoride seçenek OLMAYAN değer düşer: kontrol boş, ray yıldızlı niteliği ister, kayda yalnız görünen gider", async () => {
    const user = userEvent.setup();
    savedDefs = [
      select("malzeme", "Malzeme", "MULTI_SELECT", ["Çelik", "Alüminyum"], true),
      select("form", "Form", "SINGLE_SELECT", ["Levha", "Çubuk"]),
      def("kalinlik", "Kalınlık", "NUMBER"),
    ];
    renderForm({ ...PRODUCT, attributes: { malzeme: ["Çelik"], form: "Levha", kalinlik: "2,5" } } as ProductShowcase);
    expect(await screen.findByLabelText("Form")).toHaveValue("Levha");
    expect(chip("Çelik")).toHaveAttribute("aria-pressed", "true");
    // Zorunlu "Malzeme" dolu: ray yıldızlı nitelik istemez.
    expect(rail().queryByText(STARRED)).toBeNull();

    await pickSibling(user, [
      select("malzeme", "Malzeme", "MULTI_SELECT", ["Pamuk", "Polyester"], true),
      select("form", "Form", "SINGLE_SELECT", ["Kumaş", "İplik"]),
      def("kalinlik", "Kalınlık", "NUMBER"),
    ]);

    // Ekran: hiçbir çip basılı değil, seçim kutusu boş; sayı alanı değerini korur.
    expect(await screen.findByRole("button", { name: "Pamuk" })).toHaveAttribute("aria-pressed", "false");
    expect(chip("Polyester")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Form")).toHaveValue("");
    expect(screen.getByLabelText("Kalınlık")).toHaveValue("2,5");
    // Durum ekranla aynı: zorunlu "Malzeme" artık BOŞ — ray ister.
    await waitFor(() => expect(rail().getByText(STARRED)).toBeInTheDocument());

    await user.click(chip("Pamuk"));
    // Eskiden: { malzeme: ["Çelik", "Pamuk"], form: "Levha", kalinlik: "2,5" }.
    expect(await savedAttributes(user)).toEqual({ malzeme: ["Pamuk"], kalinlik: "2,5" });
  });

  it("iki kategoride de seçenek olan değerler kalır: çoklu seçim KESİŞİME iner, ortak tek seçim durur", async () => {
    const user = userEvent.setup();
    savedDefs = [
      select("malzeme", "Malzeme", "MULTI_SELECT", ["Çelik", "Alüminyum", "Bakır"]),
      select("form", "Form", "SINGLE_SELECT", ["Levha", "Çubuk"]),
    ];
    renderForm({ ...PRODUCT, attributes: { malzeme: ["Çelik", "Bakır"], form: "Levha" } } as ProductShowcase);
    await screen.findByLabelText("Form");

    await pickSibling(user, [
      select("malzeme", "Malzeme", "MULTI_SELECT", ["Bakır", "Pirinç"]),
      select("form", "Form", "SINGLE_SELECT", ["Levha", "Boru"]),
    ]);

    expect(await screen.findByRole("button", { name: "Pirinç" })).toHaveAttribute("aria-pressed", "false");
    expect(chip("Bakır")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Form")).toHaveValue("Levha");
    expect(await savedAttributes(user)).toEqual({ malzeme: ["Bakır"], form: "Levha" });
  });

  it("tür uyuşmazlığı: metin değeri çoklu seçime, liste değeri metin alanına TAŞINMAZ; yazılan metin / sayı durur", async () => {
    const user = userEvent.setup();
    savedDefs = [
      def("malzeme", "Malzeme"),
      select("sertifika", "Sertifika", "MULTI_SELECT", ["CE", "TSE"]),
      def("kalinlik", "Kalınlık", "NUMBER"),
      def("renk", "Renk"),
    ];
    renderForm({
      ...PRODUCT,
      attributes: { malzeme: "Çelik", sertifika: ["CE"], kalinlik: "2,5", renk: "Gri" },
    } as ProductShowcase);
    await screen.findByLabelText("Kalınlık");

    await pickSibling(user, [
      // Eskiden serbest metindi; burada seçenekli ("Çelik" seçeneklerde olsa da metin → liste taşınmaz).
      select("malzeme", "Malzeme", "MULTI_SELECT", ["Çelik", "Pamuk"]),
      // Eskiden çoklu seçimdi; burada serbest metin.
      def("sertifika", "Sertifika"),
      def("kalinlik", "Kalınlık", "NUMBER"),
      def("renk", "Renk"),
    ]);

    expect(await screen.findByRole("button", { name: "Pamuk" })).toHaveAttribute("aria-pressed", "false");
    expect(chip("Çelik")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Sertifika")).toHaveValue("");
    expect(screen.getByLabelText("Renk")).toHaveValue("Gri");
    expect(await savedAttributes(user)).toEqual({ kalinlik: "2,5", renk: "Gri" });
  });
});
