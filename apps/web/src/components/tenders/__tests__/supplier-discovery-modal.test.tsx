// @vitest-environment jsdom
/**
 * AI tedarikçi keşfi → "Davet E-postası Gönder" sözleşmesi (2026-09-27):
 *  - YAYIN ÖNCESİ (talep yok, `onCollect` verildi): e-posta HEMEN GİTMEZ —
 *    seçilen adresler forma eklenir; genel "Rothern'e katıl" daveti
 *    (`invite-by-email/batch`) artık hiç çağrılmaz.
 *  - Kayıtlı talepte: talebe özel davet ucu; adres başına GERÇEK sonuç
 *    satırda görünür (gönderilemeyen "Gönderildi" diye işaretlenmez).
 *  - Web araması talebin görünürlük ülkeleriyle çağrılır.
 *  - DAVET DİLİ satır başına: varsayılanı firmanın ülkesinden (`DE` → English),
 *    yoksa e-posta uzantısı, yoksa arayüz dili; kullanıcı değiştirebilir ve
 *    seçim (adres + dil + ülke) taslağa/API'ye taşınır. Ülke şehrin yanında.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  external: vi.fn(),
  resume: vi.fn(),
  /** Bitmiş aramanın sonucunu tek istekle geri okuyan çağrı (AS-1). */
  finished: vi.fn(),
  sendExternal: vi.fn(),
  discovery: vi.fn(),
  inviteMembers: vi.fn(),
  inviteConnection: vi.fn(),
  /** Pencerenin davet kancalarına verdiği seçenekler (AS-2: `skipErrorToast`). */
  hookOptions: { sendExternal: undefined as unknown, inviteMembers: undefined as unknown },
  detail: { data: undefined as unknown, isLoading: false },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-connections", () => ({
  useInviteConnection: () => ({ mutateAsync: h.inviteConnection, isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", () => ({
  useListingDetail: () => h.detail,
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: vi.fn(), post: vi.fn() } }));
// Web araması (başlat + yokla) kancanın işidir ve kendi testinde sınanır; pencere
// yalnız SÖZÜ görür: `h.external` yeni aramanın, `h.resume` devralınan aramanın
// sözü. Hata sınıfı ve sabitler gerçek modülden gelir.
vi.mock("@/hooks/use-supplier-discovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-supplier-discovery")>()),
  useSupplierDiscovery: () => ({ mutateAsync: h.discovery, isPending: false }),
  searchExternalSuppliers: h.external,
  resumeExternalSupplierSearch: h.resume,
  readFinishedExternalSearch: h.finished,
  useExternalTenderInvite: (options?: unknown) => {
    h.hookOptions.sendExternal = options;
    return { mutateAsync: h.sendExternal, isPending: false };
  },
  useInviteDiscoveredMembers: (options?: unknown) => {
    h.hookOptions.inviteMembers = options;
    return { mutateAsync: h.inviteMembers, isPending: false };
  },
}));

import {
  ExternalSearchError,
  PENDING_EXTERNAL_SEARCH_KEEP_MS,
  PENDING_EXTERNAL_SEARCH_KEY,
  readPendingExternalSearch,
  savePendingExternalSearch,
  type ExternalSearchOptions,
} from "@/hooks/use-supplier-discovery";
import { SupplierDiscoveryModal } from "../supplier-discovery-modal";

// Pencerenin oturumu (sonuçlar, seçim, sekme) React Query önbelleğinde yaşar:
// her test kendi boş önbelleğiyle başlar.
let queryClient: QueryClient;
function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Providers });

type Row = Record<string, unknown>;
type Scope = "LOCAL" | "ABROAD";
/**
 * Web araması ucunun yanıtı — NEDEN bildirmeyen ESKİ API'nin biçimi
 * (`{ companies, incompleteScopes }`; `scopes` alanını da tanımaz).
 */
const found = (companies: Row[], incompleteScopes: Scope[] = []) => ({ companies, incompleteScopes });
/**
 * Güncel API'nin yanıtı (kancadan geçmiş hâli): eksik geçişler NEDENLERİYLE,
 * bütçe reddinde sunucunun metniyle; uç istekte `scopes` tanır.
 */
const partial = (
  companies: Row[],
  reasons: Partial<Record<Scope, "TIMEOUT" | "PROVIDER" | "BUDGET">> = {},
  messages: Partial<Record<Scope, string>> = {},
) => ({
  companies,
  incompleteScopes: (["LOCAL", "ABROAD"] as const).filter((s) => s in reasons),
  incompleteReasons: reasons,
  incompleteMessages: messages,
  supportsScopes: true,
});
/** Sunucunun AI bütçe reddi (403 `AI_BUDGET_EXCEEDED`), istek dilindeki metniyle. */
const budgetRefusal = (message: string) => ({
  isAxiosError: true,
  response: { status: 403, data: { message, code: "AI_BUDGET_EXCEEDED", i18nKey: "api.ai.budget.dailyCap" } },
});
const cand = (name: string, email: string, extra: Row = {}): Row => ({
  name,
  city: null,
  country: "TR",
  website: null,
  email,
  reason: "r",
  ...extra,
});

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Süren aramanın kaydı (R6-02) sekme deposundadır: testler arasında taşınmasın.
  sessionStorage.clear();
  h.discovery.mockReset().mockResolvedValue([]);
  h.external.mockReset().mockResolvedValue(
    found([
      { name: "Baret A.Ş.", city: "İzmir", country: "TR", website: null, email: "info@baret.com", reason: "Üretici" },
      { name: "Kask Ltd.", city: null, website: null, email: "satis@kask.com", reason: "Bayi" },
    ]),
  );
  h.resume.mockReset().mockReturnValue(new Promise(() => {}));
  // Varsayılan: sunucu kimliği artık bilmiyor (gösterilecek sonuç yok).
  h.finished.mockReset().mockResolvedValue(null);
  h.sendExternal.mockReset();
  h.inviteMembers.mockReset();
  h.inviteConnection.mockReset();
  h.detail = { data: undefined, isLoading: false };
  Object.values(h.toast).forEach((f) => f.mockReset());
});

afterEach(() => {
  vi.useRealTimers();
});

const openWebTab = () => fireEvent.click(screen.getByRole("tab", { name: /Web'de Ara/ }));
const clickSearch = () => fireEvent.click(screen.getByRole("button", { name: "Web'de Ara" }));

async function searchWeb(firstRow = "Baret A.Ş.") {
  openWebTab();
  clickSearch();
  await screen.findByText(firstRow);
}

/** Elle çözülen arama: bekleme durumunu ve pencere kapalıyken biten aramayı sınamak için. */
function deferredSearch() {
  let resolve: (v: unknown) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  h.external.mockReturnValueOnce(
    new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
  );
  return {
    resolve: async (v: unknown) => {
      await act(async () => {
        resolve(v);
      });
    },
    reject: async (e: unknown) => {
      await act(async () => {
        reject(e);
      });
    },
  };
}

const listingModal = (props: { isOpen?: boolean; listingId?: string } = {}) => (
  <SupplierDiscoveryModal
    isOpen={props.isOpen ?? true}
    onClose={() => {}}
    categoryIds={["39121600"]}
    listingId={props.listingId ?? "l1"}
  />
);

describe("SupplierDiscoveryModal — dış davet", () => {
  it("yayın öncesi: seçilen adres forma eklenir, e-posta GİTMEZ; arama hedef ülkelerle", async () => {
    const onCollect = vi.fn();
    render(
      <SupplierDiscoveryModal
        isOpen
        onClose={() => {}}
        categoryIds={["39121600"]}
        itemNames={["Baret"]}
        targetCountries={["DE"]}
        onCollect={onCollect}
      />,
    );
    await searchWeb();
    expect(h.external.mock.calls[0][0]).toMatchObject({ targetCountries: ["DE"] });
    fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
    fireEvent.click(screen.getByRole("button", { name: "Talebe ekle (1)" }));
    expect(onCollect).toHaveBeenCalledWith([{ email: "info@baret.com", locale: "tr", country: "TR" }]);
    expect(h.sendExternal).not.toHaveBeenCalled();
  });

  it("kayıtlı talep: talebe özel davet; gönderilemeyen adres 'Gönderildi' işaretlenmez", async () => {
    h.sendExternal.mockResolvedValue([
      { email: "info@baret.com", status: "SENT" },
      { email: "satis@kask.com", status: "SUPPRESSED", reason: "Adres e-posta almıyor" },
    ]);
    render(listingModal());
    await searchWeb();
    expect(h.external.mock.calls[0][0]).toMatchObject({ listingId: "l1" });
    fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
    fireEvent.click(screen.getByLabelText("Kask Ltd. seç"));
    fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (2)" }));
    await waitFor(() =>
      expect(h.sendExternal).toHaveBeenCalledWith({
        listingId: "l1",
        invites: [
          { email: "info@baret.com", locale: "tr", country: "TR" },
          { email: "satis@kask.com", locale: "tr", country: null },
        ],
        source: "AI_FORM",
      }),
    );
    expect(await screen.findByText("Gönderildi")).toBeInTheDocument();
    expect(screen.getByText("Adres e-posta almıyor")).toBeInTheDocument();
    // N5 — adres başına toast YOK: neden satırında, özet gönder şeridinde.
    expect(h.toast.warning).not.toHaveBeenCalled();
    expect(screen.getByText("1 davet gönderildi · 1 adrese gönderilemedi (nedeni satırında)")).toBeInTheDocument();
  });

  it("davet dili: ülkeden varsayılan (DE → English, .kz → Русский), ülke şehrin yanında, satırda değiştirilebilir", async () => {
    h.external.mockResolvedValue(
      found([
        { name: "Rohr GmbH", city: "Munich", country: "DE", website: "rohr.de", email: "info@rohr.de", reason: "Hersteller" },
        { name: "Truby TOO", city: null, country: null, website: null, email: "sales@truby.kz", reason: "Дилер" },
      ]),
    );
    const onCollect = vi.fn();
    render(
      <SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} onCollect={onCollect} />,
    );
    await searchWeb("Rohr GmbH");
    const rohr = screen.getByText("Rohr GmbH").closest("li") as HTMLElement;
    expect(within(rohr).getByText("Munich")).toBeInTheDocument();
    expect(within(rohr).getByText("Almanya")).toBeInTheDocument();
    const rohrLang = screen.getByLabelText("Rohr GmbH için davet dili") as HTMLSelectElement;
    const trubyLang = screen.getByLabelText("Truby TOO için davet dili") as HTMLSelectElement;
    expect(rohrLang.value).toBe("en");
    expect(trubyLang.value).toBe("ru");
    // Kullanıcı Alman firmaya Rusça göndermeyi seçer.
    fireEvent.change(rohrLang, { target: { value: "ru" } });
    fireEvent.click(screen.getByLabelText("Rohr GmbH seç"));
    fireEvent.click(screen.getByLabelText("Truby TOO seç"));
    fireEvent.click(screen.getByRole("button", { name: "Talebe ekle (2)" }));
    expect(onCollect).toHaveBeenCalledWith([
      { email: "info@rohr.de", locale: "ru", country: "DE" },
      { email: "sales@truby.kz", locale: "ru", country: null },
    ]);
  });

  it("kayıtlı talep, Platformda sekmesi: üye DOĞRUDAN talebe davet edilir (bağlantı daveti değil); davetli olan kilitli", async () => {
    h.discovery.mockResolvedValue([
      { companyId: "co1", name: "Bağlantı AŞ", city: "Bursa", rothernId: "R1", matchedCategories: ["Cıvatalar"], strongMatch: true, matchedItems: [], connectionStatus: "NONE", alreadyInvited: false },
      { companyId: "co2", name: "Somun Ltd", city: null, rothernId: "R2", matchedCategories: [], strongMatch: false, matchedItems: [], connectionStatus: "NONE", alreadyInvited: true },
    ]);
    h.inviteMembers.mockReset().mockResolvedValue([{ companyId: "co1", status: "INVITED" }]);
    render(listingModal());
    await screen.findByText("Bağlantı AŞ");
    expect(screen.getByText("Talebe davetli")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Talebe davet et" }));
    await waitFor(() => expect(h.inviteMembers).toHaveBeenCalledWith({ listingId: "l1", companyIds: ["co1"] }));
    expect(h.toast.success).toHaveBeenCalledWith("1 Rothern üyesi talebe davet edildi");
    expect(await screen.findAllByText("Talebe davetli")).toHaveLength(2);
  });
});

describe("SupplierDiscoveryModal — hata ve talep kipi metinleri (arayüz testi O-058, D-098)", () => {
  it("öneri çağrısı reddedilince (403 doğrulama kilidi) boş durum değil sunucunun nedeni görünür", async () => {
    h.discovery.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: "AI tedarikçi keşfi firma doğrulaması gerektirir" } },
    });
    render(listingModal());
    expect(await screen.findByRole("alert")).toHaveTextContent("firma doğrulaması gerektirir");
    expect(screen.queryByText("Bu kategorilerde önerilebilecek yeni firma bulunamadı.")).toBeNull();
  });

  it("403 TIER_REQUIRED: hata + doğrulama CTA'sı; davet akışını anlatan altbilgi yok (webB-04 yeniden doğrulama)", async () => {
    h.discovery.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: { message: "Bu özellik firma doğrulaması gerektirir.", code: "TIER_REQUIRED" },
      },
    });
    render(listingModal());
    expect(await screen.findByRole("alert")).toHaveTextContent("firma doğrulaması gerektirir");
    // Tek eylem doğrulama akışı; paket sayfası yok (ücretsiz dönem 2026-10-07).
    expect(screen.getByRole("link", { name: "Firmanızı doğrulayın" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
    expect(document.querySelector('a[href*="/company/premium"]')).toBeNull();
    expect(screen.queryByText(/doğrudan talebinize davet edilir/)).toBeNull();
  });

  it("kilit dışı hata: CTA yok, altbilgi yine gizli; başarıda altbilgi görünür", async () => {
    h.discovery.mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } });
    const { rerender } = render(listingModal());
    expect(await screen.findByRole("alert")).toHaveTextContent("Öneriler yüklenemedi");
    expect(screen.queryByRole("link", { name: "Firmanızı doğrulayın" })).toBeNull();
    expect(document.querySelector('a[href="/company/ayarlar/dogrulama"]')).toBeNull();
    expect(screen.queryByText(/doğrudan talebinize davet edilir/)).toBeNull();
    rerender(listingModal({ isOpen: false }));
    rerender(listingModal());
    expect(await screen.findByText(/doğrudan talebinize davet edilir/)).toBeInTheDocument();
  });

  it("talepten açılışta giriş ve altbilgi bağlantı akışını anlatmaz", async () => {
    render(listingModal());
    expect(screen.getByText(/Platformdaki üyeleri doğrudan talebe davet edin/)).toBeInTheDocument();
    expect(screen.queryByText(/kabul edince satın alma talebinize davet edebilirsiniz/)).toBeNull();
    openWebTab();
    expect(screen.getByText(/bu talebe özel davet e-postası gider/)).toBeInTheDocument();
    expect(screen.queryByText(/firma bağlantılarınıza eklenir/)).toBeNull();
  });
});

/**
 * ELLE "AI ile tedarikçi bul" YOLU — uçtan uca gözden geçirme (2026-10-08).
 * Yayın sonrası tur bulduğunu kendisi davet ediyor; alıcının seçip davet
 * ettiği tek yer bu pencere, o yüzden düzgün çalışması şart.
 */
describe("SupplierDiscoveryModal — elle yol düzeltmeleri (2026-10-08)", () => {
  it("talepten açılış: talep bağlamı yüklenirken 'önce kategori seçin' DEMEZ, bekleme gösterir; yüklenince talebin kategorisi ve kalemleriyle arar", async () => {
    h.detail = { data: undefined, isLoading: true };
    const { rerender } = render(<SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={[]} listingId="l1" />);
    expect(screen.queryByText(/Önce satın alma talebinin kategorisini seçin/)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Eşleşen firmalar aranıyor");
    expect(h.discovery).not.toHaveBeenCalled();

    h.detail = { data: { categoryIds: ["31161600"], items: [{ name: "M6 cıvata" }] }, isLoading: false };
    rerender(<SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={[]} listingId="l1" />);
    await waitFor(() =>
      expect(h.discovery).toHaveBeenCalledWith({ type: "ALIM", categoryIds: ["31161600"], itemNames: ["M6 cıvata"], listingId: "l1" }),
    );
    expect(await screen.findByText("Bu kategorilerde önerilebilecek yeni firma bulunamadı.")).toBeInTheDocument();
  });

  it("öneri isteği sürerken 'öneri yok' boş durumu çizilmez", async () => {
    let resolve: (rows: unknown[]) => void = () => {};
    h.discovery.mockReturnValue(new Promise((res) => (resolve = res)));
    render(listingModal());
    expect(screen.getByRole("status")).toHaveTextContent("Eşleşen firmalar aranıyor");
    expect(screen.queryByText("Bu kategorilerde önerilebilecek yeni firma bulunamadı.")).not.toBeInTheDocument();
    resolve([]);
    expect(await screen.findByText("Bu kategorilerde önerilebilecek yeni firma bulunamadı.")).toBeInTheDocument();
  });

  it("web aramasının bulduğu ROTHERN ÜYESİ düşmez: ayrı grupta listelenir ve doğrudan talebe davet edilir (e-posta daveti değil)", async () => {
    h.external.mockResolvedValue(
      found([
        { name: "Baret A.Ş.", city: "İzmir", country: "TR", website: null, email: "info@baret.com", reason: "Üretici", status: "SUGGESTED" },
        { name: "Üye Kask AŞ", city: "Bursa", country: "TR", website: null, email: "satis@uyekask.com", reason: "Kayıtlı üretici", status: "MEMBER", memberCompanyId: "co9" },
        // Aynı üyenin ikinci adresi tek satır.
        { name: "Üye Kask AŞ", city: "Bursa", country: "TR", website: null, email: "info@uyekask.com", reason: "r", status: "MEMBER", memberCompanyId: "co9" },
      ]),
    );
    h.inviteMembers.mockResolvedValue([{ companyId: "co9", status: "INVITED" }]);
    render(listingModal());
    await searchWeb();
    const group = screen.getByRole("region", { name: "Rothern'de kayıtlı" });
    expect(group).toHaveTextContent("Üye Kask AŞ");
    expect(screen.getAllByText("Üye Kask AŞ")).toHaveLength(1);
    // Üyenin adresi e-posta daveti listesine girmez.
    expect(screen.queryByLabelText("Üye Kask AŞ seç")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("satis@uyekask.com")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Üye Kask AŞ firmasını talebe davet et" }));
    await waitFor(() => expect(h.inviteMembers).toHaveBeenCalledWith({ listingId: "l1", companyIds: ["co9"] }));
    expect(h.sendExternal).not.toHaveBeenCalled();
    expect(await screen.findByText("Talebe davetli")).toBeInTheDocument();
    expect(h.toast.success).toHaveBeenCalledWith("1 Rothern üyesi talebe davet edildi");
  });

  it("gönderimden sonra seçim KAYBOLMAZ: davet edilen düşer; günlük sınıra takılan seçili kalır; sonucu kesinleşen satır kilitlenir; adresi geçersiz aday atlanmaz, işaretlenir", async () => {
    h.external.mockResolvedValue(
      found([
        cand("Baret A.Ş.", "info@baret.com"),
        cand("Kask Ltd.", "satis@kask.com"),
        cand("Eski Ltd.", "eski@firma.com"),
        cand("Bozuk Ltd.", "bozuk@firma.com"),
      ]),
    );
    h.sendExternal.mockResolvedValue([
      { email: "info@baret.com", status: "QUEUED" },
      { email: "satis@kask.com", status: "DAILY_LIMIT", reason: "Günlük dış davet limitine ulaşıldı" },
      { email: "eski@firma.com", status: "ALREADY_INVITED", reason: "Bu adrese daha önce davet gönderilmiş" },
    ]);
    render(listingModal());
    await searchWeb();
    for (const name of ["Baret A.Ş.", "Kask Ltd.", "Eski Ltd.", "Bozuk Ltd."]) fireEvent.click(screen.getByLabelText(`${name} seç`));
    // Alıcı adresi düzeltirken bozar.
    fireEvent.change(screen.getByDisplayValue("bozuk@firma.com"), { target: { value: "bozuk@" } });
    // D11 — düğmedeki sayı GİDECEK adres sayısıdır (4 seçili, 3'ü geçerli).
    fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (3)" }));
    await waitFor(() => expect(h.sendExternal).toHaveBeenCalledTimes(1));
    expect(h.sendExternal.mock.calls[0][0].invites.map((i: { email: string }) => i.email)).toEqual([
      "info@baret.com",
      "satis@kask.com",
      "eski@firma.com",
    ]);
    // Davet edilen: kilitli, seçim düştü.
    await waitFor(() => expect(screen.getByLabelText("Baret A.Ş. seç")).toBeDisabled());
    expect(screen.getByLabelText("Baret A.Ş. seç")).not.toBeChecked();
    // Günlük sınır: yeniden denenebilir → seçili kalır.
    expect(screen.getByLabelText("Kask Ltd. seç")).toBeChecked();
    expect(screen.getByLabelText("Kask Ltd. seç")).toBeEnabled();
    // Zaten davetli: sonuç kesin → kilitli, seçili değil.
    expect(screen.getByLabelText("Eski Ltd. seç")).toBeDisabled();
    expect(screen.getByLabelText("Eski Ltd. seç")).not.toBeChecked();
    // Adresi geçersiz: hiç gönderilmedi → seçili kalır, şeritte kalıcı olarak söylenir (toast değil).
    expect(screen.getByLabelText("Bozuk Ltd. seç")).toBeChecked();
    expect(screen.getByText("1 seçili adayın e-posta adresi geçersiz; düzeltilene dek davet gönderilmez")).toBeInTheDocument();
    expect(h.toast.warning).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Davet E-postası Gönder (1)" })).toBeInTheDocument();
    // Adres düzeltilince kesinleşmiş satır yeniden seçilebilir.
    fireEvent.change(screen.getByDisplayValue("eski@firma.com"), { target: { value: "yeni@firma.com" } });
    expect(screen.getByLabelText("Eski Ltd. seç")).toBeEnabled();
  });

  it("Platformda: sunucunun reddettiği üye (NOT_ELIGIBLE) yeniden denenmez — düğme yerine neden; iki ret türü de bildirilir", async () => {
    h.discovery.mockResolvedValue([
      { companyId: "co1", name: "Bağlantı AŞ", city: null, rothernId: "R1", matchedCategories: [], strongMatch: true, matchedItems: [], connectionStatus: "NONE", alreadyInvited: false },
      { companyId: "co2", name: "Somun Ltd", city: null, rothernId: "R2", matchedCategories: [], strongMatch: true, matchedItems: [], connectionStatus: "NONE", alreadyInvited: false },
      { companyId: "co3", name: "Pul AŞ", city: null, rothernId: "R3", matchedCategories: [], strongMatch: true, matchedItems: [], connectionStatus: "NONE", alreadyInvited: false },
    ]);
    h.inviteMembers.mockResolvedValue([
      { companyId: "co1", status: "INVITED" },
      { companyId: "co2", status: "NOT_ELIGIBLE" },
      { companyId: "co3", status: "DAILY_LIMIT" },
    ]);
    render(listingModal());
    await screen.findByText("Bağlantı AŞ");
    fireEvent.click(screen.getByRole("button", { name: "Güçlü eşleşenleri davet et (3)" }));
    await waitFor(() => expect(h.inviteMembers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalledWith("Günlük davet sınırı doldu"));
    expect(h.toast.warning).toHaveBeenCalledWith("Bu talebi göremiyor (ülke kısıtı ya da engel)");
    expect(await screen.findByText("Talebe davetli")).toBeInTheDocument();
    expect(screen.getByText("Bu talebi göremiyor (ülke kısıtı ya da engel)")).toBeInTheDocument();
    // Reddedilen için düğme yok; günlük sınıra takılan yarın yeniden denenebilir.
    expect(screen.getAllByRole("button", { name: "Talebe davet et" })).toHaveLength(1);
    // Davet edilebilecek tek güçlü eşleşen kaldı: toplu düğme yok.
    expect(screen.queryByRole("button", { name: /Güçlü eşleşenleri davet et/ })).not.toBeInTheDocument();
  });
});

/**
 * CANLI DOĞRULAMA TURU (2026-10-09) — alıcının "AI ile tedarikçi bul"
 * penceresi; kusur numaraları `live-verification.json` `agent3` kaydından.
 */
describe("SupplierDiscoveryModal — canlı doğrulama turu (2026-10-09)", () => {
  describe("D2 — sıradaki davet 'Gönderildi' diye yazılmaz", () => {
    it("QUEUED: 'Sıraya alındı' + planlanan gönderim anı (ürün saat dilimi); 'Gönderildi' yalnız SENT'te", async () => {
      h.sendExternal.mockResolvedValue([
        // 06:40 UTC = İstanbul 09:40.
        { email: "info@baret.com", status: "QUEUED", sendAfter: "2026-10-09T06:40:00.000Z" },
        { email: "satis@kask.com", status: "SENT" },
      ]);
      render(listingModal());
      await searchWeb();
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      fireEvent.click(screen.getByLabelText("Kask Ltd. seç"));
      fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (2)" }));
      const baret = (await screen.findByText("Sıraya alındı · planlanan gönderim: 9 Eki 2026 09:40")).closest("li") as HTMLElement;
      expect(within(baret).getByText("Baret A.Ş.")).toBeInTheDocument();
      expect(within(baret).queryByText("Gönderildi")).toBeNull();
      const kask = screen.getByText("Kask Ltd.").closest("li") as HTMLElement;
      expect(within(kask).getByText("Gönderildi")).toBeInTheDocument();
      // İki sonuç ayrı söylenir — gönder şeridindeki özet satırında (N5: toast değil).
      expect(screen.getByText("1 davet sıraya alındı · 1 davet gönderildi")).toBeInTheDocument();
      expect(h.toast.success).not.toHaveBeenCalled();
      // Sıradaki satır da kilitlidir (yeniden gönderilmez).
      expect(screen.getByLabelText("Baret A.Ş. seç")).toBeDisabled();
    });

    it("QUEUED ama planlanan an yoksa zamansız 'Sıraya alındı'", async () => {
      h.sendExternal.mockResolvedValue([{ email: "info@baret.com", status: "QUEUED" }]);
      render(listingModal());
      await searchWeb();
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (1)" }));
      expect(await screen.findByText("Sıraya alındı")).toBeInTheDocument();
      expect(screen.queryByText("Gönderildi")).toBeNull();
    });

    /**
     * AUTO-COUNT-1 gözden geçirmesi (F3): pencere davet yanıtını kuyruk satırından
     * tek başına okuyordu — bu hafta başka bir davet almış adres için "Sıraya
     * alındı · planlanan gönderim: 12 Eki 09:13" diyor, aynı sayfadaki "E-postayla
     * davet edilenler" bölümü aynı adres için "Gönderilmedi" diyordu. Yanıt artık
     * bölümle aynı öngörüyü taşır (`sendAfter` gerçek saat / `notSentReason`).
     */
    it("F3: sırada ama talep kapanmadan GİDEMEYECEK davet 'Sıraya alındı' demez — 'Gönderilmedi' + nedeni; özet onu gönderilemeyene sayar; satır kilitli kalır", async () => {
      h.sendExternal.mockResolvedValue([
        { email: "info@baret.com", status: "QUEUED", notSentReason: "FREQUENCY" },
        // Frendeki ama zamanında çıkabilecek adres: yanıttaki saat frenin bittiği pencere (06:00 UTC = İstanbul 09:00).
        { email: "satis@kask.com", status: "QUEUED", sendAfter: "2026-10-19T06:00:00.000Z" },
      ]);
      render(listingModal());
      await searchWeb();
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      fireEvent.click(screen.getByLabelText("Kask Ltd. seç"));
      fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (2)" }));
      // Bölümün aynı satır için yazdığı durum ve neden (tek etiket kaynağı).
      const baret = (
        await screen.findByText("Gönderilmedi · Adres bu hafta başka bir davet aldı; talep kapanmadan sıra gelmedi")
      ).closest("li") as HTMLElement;
      expect(within(baret).getByText("Baret A.Ş.")).toBeInTheDocument();
      expect(within(baret).queryByText(/Sıraya alındı/)).toBeNull();
      const kask = screen.getByText("Kask Ltd.").closest("li") as HTMLElement;
      expect(within(kask).getByText("Sıraya alındı · planlanan gönderim: 19 Eki 2026 09:00")).toBeInTheDocument();
      // Özet: bir davet sırada, biri gönderilemedi — "2 davet sıraya alındı" DEĞİL.
      expect(screen.getByText("1 davet sıraya alındı · 1 adrese gönderilemedi (nedeni satırında)")).toBeInTheDocument();
      expect(screen.queryByText(/2 davet sıraya alındı/)).toBeNull();
      // Kuyruk satırı duruyor: adres yeniden gönderilemez (sunucu "zaten davetli" derdi).
      expect(screen.getByLabelText("Baret A.Ş. seç")).toBeDisabled();
      expect(screen.getByLabelText("Baret A.Ş. seç")).not.toBeChecked();
    });

    it("F3: sırası talep kapandıktan sonra gelen davet kendi nedenini yazar; tanınmayan neden kodu yalnız 'Gönderilmedi' der (ham kod basılmaz)", async () => {
      h.sendExternal.mockResolvedValue([
        { email: "info@baret.com", status: "QUEUED", notSentReason: "CLOSES_FIRST" },
        { email: "satis@kask.com", status: "QUEUED", notSentReason: "YENI_BIR_KOD" },
      ]);
      render(listingModal());
      await searchWeb();
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      fireEvent.click(screen.getByLabelText("Kask Ltd. seç"));
      fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (2)" }));
      expect(
        await screen.findByText("Gönderilmedi · Talep, e-postanın gönderilebileceği mesai saatinden önce kapanıyor"),
      ).toBeInTheDocument();
      const kask = screen.getByText("Kask Ltd.").closest("li") as HTMLElement;
      expect(within(kask).getByText("Gönderilmedi")).toBeInTheDocument();
      expect(screen.queryByText(/YENI_BIR_KOD/)).toBeNull();
      // Hiçbiri gitmeyecek: özet yalnız onu söyler.
      expect(screen.getByText("2 adrese gönderilemedi (nedeni satırında)")).toBeInTheDocument();
      expect(screen.queryByText(/sıraya alındı/i)).toBeNull();
    });
  });

  describe("D4 — pencereyi kapatmak ücretli aramayı atmaz", () => {
    it("kapat → aç: sonuçlar, seçim, yazılan adres ve sekme yerinde; yeni arama yapılmaz", async () => {
      const { rerender } = render(listingModal());
      await searchWeb();
      fireEvent.click(screen.getByLabelText("Kask Ltd. seç"));
      fireEvent.change(screen.getByDisplayValue("info@baret.com"), { target: { value: "satinalma@baret.com" } });
      // Escape / arka plan / X — hepsi çağıranın `isOpen`ini kapatır.
      rerender(listingModal({ isOpen: false }));
      await waitFor(() => expect(screen.queryByText("Baret A.Ş.")).toBeNull());
      rerender(listingModal());
      expect(screen.getByRole("tab", { name: /Web'de Ara/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText("Baret A.Ş.")).toBeInTheDocument();
      expect(screen.getByLabelText("Kask Ltd. seç")).toBeChecked();
      expect(screen.getByLabelText("Baret A.Ş. seç")).not.toBeChecked();
      expect(screen.getByDisplayValue("satinalma@baret.com")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(1);
    });

    it("arama sürerken kapatılırsa arama sürer; sonuç yeniden açılışta oradadır (kapalıyken tek bilgi toast'ı)", async () => {
      const search = deferredSearch();
      const { rerender } = render(listingModal());
      openWebTab();
      clickSearch();
      expect(screen.getByRole("status")).toHaveTextContent("Web'de aranıyor");
      rerender(listingModal({ isOpen: false }));
      await search.resolve(found([cand("Geç Gelen A.Ş.", "info@gecgelen.com")]));
      expect(h.toast.success).toHaveBeenCalledWith("Web araması tamamlandı — sonuçları görmek için pencereyi yeniden açın");
      rerender(listingModal());
      expect(screen.getByText("Geç Gelen A.Ş.")).toBeInTheDocument();
      expect(screen.queryByRole("timer")).toBeNull();
      expect(h.external).toHaveBeenCalledTimes(1);
    });

    it("arama sürerken kapatıp açınca bekleme durumu sürer, ikinci arama başlamaz", async () => {
      const search = deferredSearch();
      const { rerender } = render(listingModal());
      openWebTab();
      clickSearch();
      rerender(listingModal({ isOpen: false }));
      rerender(listingModal());
      expect(screen.getByRole("status")).toHaveTextContent("Web'de aranıyor");
      expect(screen.getByRole("button", { name: "Web'de Ara" })).toBeDisabled();
      await search.resolve(found([cand("Geç Gelen A.Ş.", "info@gecgelen.com")]));
      expect(screen.getByText("Geç Gelen A.Ş.")).toBeInTheDocument();
      // Pencere açıkken biten arama için toast yok (sonuç gövdede).
      expect(h.toast.success).not.toHaveBeenCalled();
    });

    it("başka talep başka oturumdur: sonuçlar taşınmaz; eski talebin geç gelen yanıtı yeni talebe yazılmaz, kendi talebine dönünce oradadır", async () => {
      const { rerender } = render(listingModal());
      await searchWeb();
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      const late = deferredSearch();
      clickSearch();
      rerender(listingModal({ listingId: "l2" }));
      // Yeni talep: Platformda sekmesi, web sonucu ve süren arama yok.
      expect(screen.getByRole("tab", { name: "Platformda" })).toHaveAttribute("aria-selected", "true");
      openWebTab();
      expect(screen.queryByText("Baret A.Ş.")).toBeNull();
      expect(screen.queryByRole("timer")).toBeNull();
      expect(screen.getByRole("button", { name: "Web'de Ara" })).toBeEnabled();
      await late.resolve(found([cand("Eski Talep Adayı", "a@eskitalep.com")]));
      expect(screen.queryByText("Eski Talep Adayı")).toBeNull();
      // Ücretli sonuç atılmaz: ilk talebe dönünce oradadır.
      rerender(listingModal({ listingId: "l1" }));
      expect(screen.getByRole("tab", { name: /Web'de Ara/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText("Eski Talep Adayı")).toBeInTheDocument();
    });

    it("aynı talebin iki penceresi (görünür düğme + ⋮ menüsü) AYNI oturumu görür; ikinci pencere paralel arama başlatamaz", async () => {
      const search = deferredSearch();
      const view = (first: boolean, second: boolean) => (
        <>
          <SupplierDiscoveryModal isOpen={first} onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />
          <SupplierDiscoveryModal isOpen={second} onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />
        </>
      );
      const { rerender } = render(view(true, false));
      openWebTab();
      clickSearch();
      // İlk pencere kapanır, talep sayfasındaki öteki giriş açılır.
      rerender(view(false, false));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      rerender(view(false, true));
      expect(screen.getByRole("tab", { name: /Web'de Ara/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("status")).toHaveTextContent("Web'de aranıyor");
      expect(screen.getByRole("button", { name: "Web'de Ara" })).toBeDisabled();
      await search.resolve(found([cand("Ortak Aday A.Ş.", "info@ortak.com")]));
      expect(screen.getByText("Ortak Aday A.Ş.")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(1);
      // Sonucu gören açık pencere vardı → toast yok.
      expect(h.toast.success).not.toHaveBeenCalled();
      fireEvent.click(screen.getByLabelText("Ortak Aday A.Ş. seç"));
      rerender(view(false, false));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      rerender(view(true, false));
      expect(screen.getByLabelText("Ortak Aday A.Ş. seç")).toBeChecked();
    });

    it("oturum değişince (giriş / çıkış önbelleği siler) sonuçlar da silinir; süren aramanın yanıtı yazılmaz", async () => {
      const { rerender } = render(listingModal());
      await searchWeb();
      const late = deferredSearch();
      clickSearch();
      act(() => {
        queryClient.clear();
      });
      await late.resolve(found([cand("Önceki Hesap Adayı", "a@onceki.com")]));
      rerender(listingModal());
      expect(screen.queryByText("Baret A.Ş.")).toBeNull();
      expect(screen.queryByText("Önceki Hesap Adayı")).toBeNull();
      expect(screen.queryByRole("timer")).toBeNull();
      expect(h.toast.success).not.toHaveBeenCalled();
      expect(queryClient.getQueryCache().findAll({ queryKey: ["supplier-discovery-session"] }).every((q) => q.state.data === undefined)).toBe(true);
    });

    it("yeni arama başarısız olursa önceki sonuçlar ve seçim durur", async () => {
      render(listingModal());
      await searchWeb();
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      h.external.mockRejectedValueOnce({ isAxiosError: true, response: { status: 503, data: { message: "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin." } } });
      clickSearch();
      expect(await screen.findByRole("alert")).toHaveTextContent("AI isteği zaman aşımına uğradı");
      expect(screen.getByText("Önceki aramanın sonuçları aşağıda duruyor.")).toBeInTheDocument();
      expect(screen.getByLabelText("Baret A.Ş. seç")).toBeChecked();
    });
  });

  describe("D7 — sonuç gövdede kalır; hata başına tek mesaj", () => {
    it("hiç sonuç yok: kalıcı 'bulunamadı' durumu (toast değil)", async () => {
      h.external.mockResolvedValue(found([]));
      render(listingModal());
      openWebTab();
      clickSearch();
      expect(await screen.findByText("Web aramasında uygun firma bulunamadı")).toBeInTheDocument();
      expect(screen.getByText("Bölge yazarak ya da bölgeyi değiştirerek yeniden arayabilirsiniz.")).toBeInTheDocument();
      expect(h.toast.info).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /Davet E-postası Gönder/ })).toBeNull();
    });

    it("bulunanların hiçbiri davet edilemiyorsa firmalar NEDENLERİYLE listelenir ('e-postası yok' demez)", async () => {
      h.external.mockResolvedValue(
        found([
          cand("Eski Ltd", "eski@x.com", { status: "ALREADY_INVITED" }),
          cand("Schrauben GmbH", "a@x.de", { country: "DE", status: "CONSENT_REQUIRED" }),
        ]),
      );
      render(listingModal());
      openWebTab();
      clickSearch();
      expect(
        await screen.findByText("Arama firma buldu, ancak hiçbiri bu talebe yeni davet edilemiyor. Nedenleri aşağıda."),
      ).toBeInTheDocument();
      const eski = screen.getByText("Eski Ltd").closest("li") as HTMLElement;
      expect(within(eski).getByText("Daha önce davet edildi")).toBeInTheDocument();
      const schrauben = screen.getByText("Schrauben GmbH").closest("li") as HTMLElement;
      expect(within(schrauben).getByText("Bu ülkeye izinsiz davet gönderilmiyor")).toBeInTheDocument();
      expect(within(schrauben).getByText("Almanya")).toBeInTheDocument();
      expect(h.toast.info).not.toHaveBeenCalled();
      // Seçilecek satır ve gönder düğmesi yok.
      expect(screen.queryByLabelText("Eski Ltd seç")).toBeNull();
      expect(screen.queryByRole("button", { name: /Davet E-postası Gönder/ })).toBeNull();
    });

    it("bir kısmı davet edilemiyorsa onlar da kaybolmaz: listenin altında nedenleriyle durur", async () => {
      h.external.mockResolvedValue(
        found([cand("Baret A.Ş.", "info@baret.com"), cand("Eski Ltd", "eski@x.com", { status: "ALREADY_INVITED" })]),
      );
      render(listingModal());
      await searchWeb();
      const block = screen.getByText("Davet edilemeyen firmalar (1)").closest("details") as HTMLElement;
      expect(within(block).getByText("Eski Ltd")).toBeInTheDocument();
      expect(within(block).getByText("Daha önce davet edildi")).toBeInTheDocument();
    });

    it("arama başarısız: mesaj + 'Yeniden ara' gövdede kalır, toast YOK; yeniden arama çalışır", async () => {
      h.external.mockRejectedValueOnce({ isAxiosError: true, response: undefined });
      render(listingModal());
      openWebTab();
      clickSearch();
      expect(await screen.findByRole("alert")).toHaveTextContent("Web araması başarısız — tekrar deneyin");
      expect(h.toast.error).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
      expect(await screen.findByText("Baret A.Ş.")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(h.external).toHaveBeenCalledTimes(2);
    });

    it("sunucunun nedeni (zaman aşımı) olduğu gibi gösterilir", async () => {
      h.external.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 503, data: { message: "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin." } },
      });
      render(listingModal());
      openWebTab();
      clickSearch();
      expect(await screen.findByRole("alert")).toHaveTextContent("AI isteği zaman aşımına uğradı — lütfen tekrar deneyin.");
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(h.toast.error).not.toHaveBeenCalled();
    });

    it("pencere kapalıyken düşen arama: tek toast; yeniden açılışta mesaj gövdede", async () => {
      const search = deferredSearch();
      const { rerender } = render(listingModal());
      openWebTab();
      clickSearch();
      rerender(listingModal({ isOpen: false }));
      await search.reject({ isAxiosError: true, response: undefined });
      expect(h.toast.error).toHaveBeenCalledTimes(1);
      expect(h.toast.error).toHaveBeenCalledWith("Web araması başarısız — tekrar deneyin");
      rerender(listingModal());
      expect(screen.getByRole("alert")).toHaveTextContent("Web araması başarısız — tekrar deneyin");
      expect(screen.getByRole("button", { name: "Yeniden ara" })).toBeInTheDocument();
    });
  });

  describe("kısmi sonuç — bir geçiş yanıt vermedi (nedeni bildirmeyen eski API: eskisi gibi)", () => {
    it("yanıt vermeyen geçiş adıyla söylenir; öteki geçişin adayları listelenir", async () => {
      h.external.mockResolvedValue(found([cand("Yerli Rulman A.Ş.", "satis@yerlirulman.com", { scope: "LOCAL" })], ["ABROAD"]));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      expect(screen.getByText(/^Yurt dışı araması yanıt vermedi\./)).toBeInTheDocument();
      expect(screen.getByLabelText("Yerli Rulman A.Ş. seç")).toBeEnabled();
      expect(screen.getByRole("button", { name: "Yeniden ara" })).toBeInTheDocument();
    });

    it("yurt içi yanıt vermediyse o söylenir; tam yanıtta not yok", async () => {
      h.external.mockResolvedValue(found([cand("Abroad GmbH", "info@abroad.de", { country: "DE" })], ["LOCAL"]));
      const { unmount } = render(listingModal());
      await searchWeb("Abroad GmbH");
      expect(screen.getByText(/^Yurt içi araması yanıt vermedi\./)).toBeInTheDocument();
      unmount();
      h.external.mockResolvedValue(found([cand("Tam A.Ş.", "info@tam.com")]));
      render(listingModal());
      await searchWeb("Tam A.Ş.");
      expect(screen.queryByText(/araması yanıt vermedi/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Yeniden ara" })).toBeNull();
    });

    it("'Yeniden ara' eldeki adayların ÜSTÜNE ekler: seçim ve yazılan adres durur, yeni adaylar sona gelir, not kalkar", async () => {
      h.external.mockResolvedValueOnce(
        found(
          [
            cand("Yerli Rulman A.Ş.", "satis@yerlirulman.com"),
            cand("Yerli Bilya Ltd.", "info@yerlibilya.com", { website: "yerlibilya.com" }),
          ],
          ["ABROAD"],
        ),
      );
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      fireEvent.click(screen.getByLabelText("Yerli Rulman A.Ş. seç"));
      fireEvent.change(screen.getByDisplayValue("info@yerlibilya.com"), { target: { value: "ihracat@yerlibilya.com" } });
      const retry = deferredSearch();
      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
      // Eski API `scopes` alanını tanımaz (gövdeyi 400 ile reddeder): alan
      // GÖNDERİLMEZ, bütün geçişler eskisi gibi yeniden aranır.
      expect(h.external).toHaveBeenCalledTimes(2);
      expect(h.external.mock.calls[1][0]).not.toHaveProperty("scopes");
      // Üstüne ekleyen arama sürerken eldeki liste kullanılabilir kalır.
      expect(screen.getByRole("timer")).toBeInTheDocument();
      expect(screen.getByLabelText("Yerli Rulman A.Ş. seç")).toBeChecked();
      expect(screen.getByLabelText("Yerli Rulman A.Ş. seç")).toBeEnabled();
      await retry.resolve(
        found([
          // Aynı firma ikinci yanıtta da gelir — ikinci kez listelenmez
          // (aynı adres; başka posta kutusuyla ama aynı siteyle gelen de).
          cand("Yerli Rulman A.Ş.", "satis@yerlirulman.com"),
          cand("Yerli Bilya Sanayi", "ankara@yerlibilya.com", { website: "https://www.yerlibilya.com/iletisim" }),
          cand("Bearing GmbH", "sales@bearing.de", { country: "DE" }),
        ]),
      );
      expect(screen.getAllByText("Yerli Rulman A.Ş.")).toHaveLength(1);
      expect(screen.getByLabelText("Yerli Rulman A.Ş. seç")).toBeChecked();
      expect(screen.getByDisplayValue("ihracat@yerlibilya.com")).toBeInTheDocument();
      expect(screen.getByDisplayValue("sales@bearing.de")).toBeInTheDocument();
      const names = screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"));
      expect(names).toEqual(["Yerli Rulman A.Ş. seç", "Yerli Bilya Ltd. seç", "Bearing GmbH seç"]);
      expect(screen.queryByText(/araması yanıt vermedi/)).toBeNull();
    });

    it("yeniden arama yine aynı geçişi alamazsa not durur", async () => {
      h.external.mockResolvedValue(found([cand("Yerli Rulman A.Ş.", "satis@yerlirulman.com")], ["ABROAD"]));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
      await waitFor(() => expect(h.external).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole("timer")).toBeNull());
      expect(screen.getByText(/^Yurt dışı araması yanıt vermedi\./)).toBeInTheDocument();
      expect(screen.getAllByText("Yerli Rulman A.Ş.")).toHaveLength(1);
    });
  });

  describe("eksik geçişin nedeni — 'Yeniden ara' YALNIZ eksiği arar (API `incompleteReasons` / `scopes`)", () => {
    const TIMEOUT_NOTE =
      "Yurt dışı araması çok uzun sürdü ve tamamlanamadı. Listede yalnızca yanıt veren aramanın sonuçları var; eksik kalanı tamamlamak için yeniden arayabilirsiniz.";
    const PROVIDER_NOTE =
      "Yurt dışı aramasında arama hizmeti yanıt vermedi. Listede yalnızca yanıt veren aramanın sonuçları var; eksik kalanı tamamlamak için yeniden arayabilirsiniz.";
    const BUDGET_NOTE =
      "Yurt dışı araması AI kullanım sınırı nedeniyle yapılamadı. Listede yalnızca yapılan aramanın sonuçları var.";
    const POOL_FULL = "Firmanızın aylık AI bütçesi doldu — AI özellikleri gelecek ay yeniden açılır.";
    const DAILY_CAP = "Günlük AI kullanım tavanına ulaşıldı — yarın tekrar deneyin.";
    const yerli = () => cand("Yerli Rulman A.Ş.", "satis@yerlirulman.com", { scope: "LOCAL" });
    const retryButton = () => screen.getByRole("button", { name: "Yeniden ara" });
    const lastSearch = () => h.external.mock.calls[h.external.mock.calls.length - 1][0] as Row;

    it("süre yetmedi: not bunu söyler; 'Yeniden ara' yalnız eksik geçişi arar ve yeni adayları eldeki listeye EKLER — yinelenen yok, seçim / yazılan adres / gönderim durumu yerinde, not kalkar", async () => {
      h.external.mockResolvedValueOnce(
        partial(
          [
            yerli(),
            cand("Yerli Bilya Ltd.", "info@yerlibilya.com", { website: "yerlibilya.com", scope: "LOCAL" }),
            cand("Yerli Mil San.", "satis@yerlimil.com", { scope: "LOCAL" }),
          ],
          { ABROAD: "TIMEOUT" },
        ),
      );
      h.sendExternal.mockResolvedValue([{ email: "satis@yerlimil.com", status: "SENT" }]);
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      expect(screen.getByText(TIMEOUT_NOTE)).toBeInTheDocument();
      expect(screen.queryByText(/araması yanıt vermedi/)).toBeNull();
      // Satır durumları: biri davet edildi, biri seçili, birinin adresi düzeltildi.
      fireEvent.click(screen.getByLabelText("Yerli Mil San. seç"));
      fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (1)" }));
      expect(await screen.findByText("Gönderildi")).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Yerli Rulman A.Ş. seç"));
      fireEvent.change(screen.getByDisplayValue("info@yerlibilya.com"), { target: { value: "ihracat@yerlibilya.com" } });

      const retry = deferredSearch();
      fireEvent.click(retryButton());
      // Yanıt vermiş geçiş (yurt içi) ikinci kez aranmaz ve ödenmez.
      expect(h.external).toHaveBeenCalledTimes(2);
      expect(lastSearch()).toMatchObject({ type: "ALIM", listingId: "l1", scopes: ["ABROAD"] });
      // Eldeki liste arama sürerken kullanılabilir kalır.
      expect(screen.getByRole("timer")).toBeInTheDocument();
      expect(screen.getByLabelText("Yerli Rulman A.Ş. seç")).toBeEnabled();
      await retry.resolve(
        partial([
          // Aynı firma (aynı site, başka posta kutusu) ikinci kez listelenmez.
          cand("Yerli Bilya Sanayi", "ankara@yerlibilya.com", { website: "https://www.yerlibilya.com/iletisim", scope: "ABROAD" }),
          cand("Bearing GmbH", "sales@bearing.de", { country: "DE", scope: "ABROAD" }),
          cand("Kugellager AG", "info@kugellager.de", { country: "DE", scope: "ABROAD" }),
        ]),
      );
      const names = screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"));
      expect(names).toEqual([
        "Yerli Rulman A.Ş. seç",
        "Yerli Bilya Ltd. seç",
        "Yerli Mil San. seç",
        "Bearing GmbH seç",
        "Kugellager AG seç",
      ]);
      expect(screen.getByLabelText("Yerli Rulman A.Ş. seç")).toBeChecked();
      expect(screen.getByLabelText("Bearing GmbH seç")).not.toBeChecked();
      expect(screen.getByDisplayValue("ihracat@yerlibilya.com")).toBeInTheDocument();
      expect(screen.getByDisplayValue("sales@bearing.de")).toBeInTheDocument();
      // Gönderim durumu yerinde: davet edilen satır kilitli ve "Gönderildi".
      const sent = screen.getByText("Yerli Mil San.").closest("li") as HTMLElement;
      expect(within(sent).getByText("Gönderildi")).toBeInTheDocument();
      expect(screen.getByLabelText("Yerli Mil San. seç")).toBeDisabled();
      // Arama tamamlandı: not ve düğme kalktı.
      expect(screen.queryByText(TIMEOUT_NOTE)).toBeNull();
      expect(screen.queryByRole("button", { name: "Yeniden ara" })).toBeNull();
    });

    it("ana düğme YENİ aramadır: kısmi sonuç eldeyken de her şeyi arar (`scopes` yok) ve sonuç eldekinin yerine geçer", async () => {
      h.external.mockResolvedValueOnce(partial([yerli()], { ABROAD: "TIMEOUT" }));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      h.external.mockResolvedValueOnce(partial([cand("Yeni Arama A.Ş.", "info@yeniarama.com")]));
      clickSearch();
      expect(await screen.findByText("Yeni Arama A.Ş.")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(2);
      expect(lastSearch()).not.toHaveProperty("scopes");
      expect(screen.queryByText("Yerli Rulman A.Ş.")).toBeNull();
      expect(screen.queryByText(TIMEOUT_NOTE)).toBeNull();
    });

    it("arama hizmeti yanıt vermedi: not bunu söyler; yurt içi eksikse yalnız o aranır", async () => {
      h.external.mockResolvedValueOnce(
        partial([cand("Abroad GmbH", "info@abroad.de", { country: "DE", scope: "ABROAD" })], { LOCAL: "PROVIDER" }),
      );
      render(listingModal());
      await searchWeb("Abroad GmbH");
      expect(
        screen.getByText(
          "Yurt içi aramasında arama hizmeti yanıt vermedi. Listede yalnızca yanıt veren aramanın sonuçları var; eksik kalanı tamamlamak için yeniden arayabilirsiniz.",
        ),
      ).toBeInTheDocument();
      h.external.mockResolvedValueOnce(partial([yerli()]));
      fireEvent.click(retryButton());
      expect(await screen.findByText("Yerli Rulman A.Ş.")).toBeInTheDocument();
      expect(lastSearch()).toMatchObject({ scopes: ["LOCAL"] });
      expect(screen.getByText("Abroad GmbH")).toBeInTheDocument();
      expect(screen.queryByText(/arama hizmeti yanıt vermedi/)).toBeNull();
    });

    it("yeniden aranan geçiş yine yanıt vermezse not YENİ nedeniyle durur; aranan geçiş artık yoksa (boş yanıt) not kalkar", async () => {
      h.external.mockResolvedValueOnce(partial([yerli()], { ABROAD: "TIMEOUT" }));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      h.external.mockResolvedValueOnce(partial([], { ABROAD: "PROVIDER" }));
      fireEvent.click(retryButton());
      expect(await screen.findByText(PROVIDER_NOTE)).toBeInTheDocument();
      expect(screen.queryByText(TIMEOUT_NOTE)).toBeNull();
      expect(screen.getAllByText("Yerli Rulman A.Ş.")).toHaveLength(1);
      // Talep arada tek ülkeye daraltıldı: o geçiş yok, sunucu boş ve TAM yanıt döner.
      h.external.mockResolvedValueOnce(partial([]));
      fireEvent.click(retryButton());
      await waitFor(() => expect(screen.queryByText(PROVIDER_NOTE)).toBeNull());
      expect(h.external).toHaveBeenCalledTimes(3);
      expect(lastSearch()).toMatchObject({ scopes: ["ABROAD"] });
      expect(screen.getByLabelText("Yerli Rulman A.Ş. seç")).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Yeniden ara" })).toBeNull();
    });

    it("yalnız eksiği arayan istek HATAYLA düşerse eldeki sonuç ve not durur; hata kutusundaki 'Yeniden ara' yine yalnız eksiği arar", async () => {
      h.external.mockResolvedValueOnce(partial([yerli()], { ABROAD: "TIMEOUT" }));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      fireEvent.click(screen.getByLabelText("Yerli Rulman A.Ş. seç"));
      h.external.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 503, data: { message: "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin." } },
      });
      fireEvent.click(retryButton());
      expect(await screen.findByRole("alert")).toHaveTextContent("AI isteği zaman aşımına uğradı — lütfen tekrar deneyin.");
      expect(screen.getByText("Önceki aramanın sonuçları aşağıda duruyor.")).toBeInTheDocument();
      expect(screen.getByText(TIMEOUT_NOTE)).toBeInTheDocument();
      expect(screen.getByLabelText("Yerli Rulman A.Ş. seç")).toBeChecked();
      // Tek düğme (hata kutusunda) — düşen aramayı yineler: yine yalnız yurt dışı.
      expect(screen.getAllByRole("button", { name: "Yeniden ara" })).toHaveLength(1);
      h.external.mockResolvedValueOnce(partial([cand("Bearing GmbH", "sales@bearing.de", { country: "DE" })]));
      fireEvent.click(retryButton());
      expect(await screen.findByText("Bearing GmbH")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(3);
      expect(lastSearch()).toMatchObject({ scopes: ["ABROAD"] });
      expect(screen.getByLabelText("Yerli Rulman A.Ş. seç")).toBeChecked();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText(TIMEOUT_NOTE)).toBeNull();
    });

    it("`scopes` alanını tanımayan uca düşen istek (400): sonraki 'Yeniden ara' alanı GÖNDERMEZ — eskisi gibi her şeyi arayıp üstüne ekler", async () => {
      h.external.mockResolvedValueOnce(partial([yerli()], { ABROAD: "TIMEOUT" }));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      h.external.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 400, data: { message: "Doğrulama hatası", errors: { scopes: "property scopes should not exist" } } },
      });
      fireEvent.click(retryButton());
      expect(await screen.findByRole("alert")).toHaveTextContent("property scopes should not exist");
      expect(lastSearch()).toMatchObject({ scopes: ["ABROAD"] });
      expect(screen.getByText(TIMEOUT_NOTE)).toBeInTheDocument();
      // Eski uç: yanıtı da nedensiz (eski biçim).
      h.external.mockResolvedValueOnce(found([yerli(), cand("Bearing GmbH", "sales@bearing.de", { country: "DE" })]));
      fireEvent.click(retryButton());
      expect(await screen.findByText("Bearing GmbH")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(3);
      expect(lastSearch()).not.toHaveProperty("scopes");
      expect(screen.getAllByText("Yerli Rulman A.Ş.")).toHaveLength(1);
      expect(screen.queryByText(TIMEOUT_NOTE)).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("ana düğmenin yeni araması düşerse hata kutusundaki 'Yeniden ara' o aramayı yineler: her şey aranır (`scopes` yok), eldekinin üstüne eklenir", async () => {
      h.external.mockResolvedValueOnce(partial([yerli()], { ABROAD: "TIMEOUT" }));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      h.external.mockRejectedValueOnce({ isAxiosError: true, response: undefined });
      clickSearch();
      expect(await screen.findByRole("alert")).toHaveTextContent("Web araması başarısız — tekrar deneyin");
      h.external.mockResolvedValueOnce(partial([yerli(), cand("Bearing GmbH", "sales@bearing.de", { country: "DE" })]));
      fireEvent.click(retryButton());
      expect(await screen.findByText("Bearing GmbH")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(3);
      expect(lastSearch()).not.toHaveProperty("scopes");
      expect(screen.getAllByText("Yerli Rulman A.Ş.")).toHaveLength(1);
      expect(screen.queryByText(TIMEOUT_NOTE)).toBeNull();
    });

    it("bütçe reddi: sunucunun metni gösterilir, 'Yeniden ara' SUNULMAZ; adaylar kullanılabilir, ana düğme açık", async () => {
      h.external.mockResolvedValueOnce(partial([yerli()], { ABROAD: "BUDGET" }, { ABROAD: POOL_FULL }));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      expect(screen.getByText(BUDGET_NOTE)).toBeInTheDocument();
      expect(screen.getByText(POOL_FULL)).toBeInTheDocument();
      expect(screen.queryByText(/yeniden arayabilirsiniz/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Yeniden ara" })).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByLabelText("Yerli Rulman A.Ş. seç")).toBeEnabled();
      expect(screen.getByRole("button", { name: "Web'de Ara" })).toBeEnabled();
      expect(h.external).toHaveBeenCalledTimes(1);
    });

    it("bütçe reddi metinsiz gelirse not kendi cümlesiyle kalır (yine 'Yeniden ara' yok)", async () => {
      h.external.mockResolvedValueOnce(partial([yerli()], { LOCAL: "BUDGET" }));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      const note = screen.getByText(
        "Yurt içi araması AI kullanım sınırı nedeniyle yapılamadı. Listede yalnızca yapılan aramanın sonuçları var.",
      );
      expect((note.closest("[role=status]") as HTMLElement).textContent).toBe(note.textContent);
      expect(screen.queryByRole("button", { name: "Yeniden ara" })).toBeNull();
    });

    it("yalnız eksiği arayan istek BÜTÇE REDDİYLE düşerse (403) not bütçe metnine döner: hata kutusu ve 'Yeniden ara' yok, eldeki sonuç ve seçim durur", async () => {
      h.external.mockResolvedValueOnce(partial([yerli()], { ABROAD: "TIMEOUT" }));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      fireEvent.click(screen.getByLabelText("Yerli Rulman A.Ş. seç"));
      const retry = deferredSearch();
      fireEvent.click(retryButton());
      expect(lastSearch()).toMatchObject({ scopes: ["ABROAD"] });
      await retry.reject(budgetRefusal(DAILY_CAP));
      expect(screen.queryByRole("timer")).toBeNull();
      expect(screen.getByText(BUDGET_NOTE)).toBeInTheDocument();
      expect(screen.getByText(DAILY_CAP)).toBeInTheDocument();
      expect(screen.queryByText(TIMEOUT_NOTE)).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("button", { name: "Yeniden ara" })).toBeNull();
      expect(screen.getByLabelText("Yerli Rulman A.Ş. seç")).toBeChecked();
      // Not gövdede göründü: toast yok.
      expect(h.toast.error).not.toHaveBeenCalled();
      expect(h.external).toHaveBeenCalledTimes(2);
    });

    it("bütçe reddi pencere kapalıyken gelirse TEK toast (sekme ipucu yok); yeniden açılışta not bütçe metniyle durur", async () => {
      h.external.mockResolvedValueOnce(partial([yerli()], { ABROAD: "PROVIDER" }));
      const { rerender } = render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      const retry = deferredSearch();
      fireEvent.click(retryButton());
      rerender(listingModal({ isOpen: false }));
      await retry.reject(budgetRefusal(DAILY_CAP));
      expect(h.toast.error).toHaveBeenCalledTimes(1);
      expect(h.toast.error).toHaveBeenCalledWith(DAILY_CAP);
      rerender(listingModal());
      expect(screen.getByText(BUDGET_NOTE)).toBeInTheDocument();
      expect(screen.getByText(DAILY_CAP)).toBeInTheDocument();
      expect(screen.getByText("Yerli Rulman A.Ş.")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("button", { name: "Yeniden ara" })).toBeNull();
    });

    it("bütçe reddi 'Platformda' sekmesindeyken gelirse de TEK toast, 'Yeniden ara'ya yönlendiren ipucu olmadan", async () => {
      h.external.mockResolvedValueOnce(partial([yerli()], { ABROAD: "TIMEOUT" }));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      const retry = deferredSearch();
      fireEvent.click(retryButton());
      fireEvent.click(screen.getByRole("tab", { name: "Platformda" }));
      await retry.reject(budgetRefusal(DAILY_CAP));
      expect(h.toast.error).toHaveBeenCalledTimes(1);
      expect(h.toast.error).toHaveBeenCalledWith(DAILY_CAP);
      openWebTab();
      expect(screen.getByText(DAILY_CAP)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Yeniden ara" })).toBeNull();
    });

    it("birden çok eksik geçiş: bütçenin reddettiği yeniden ARANMAZ ve notuyla durur; öteki aranır, yanıt verince yalnız onun notu kalkar", async () => {
      h.external.mockResolvedValueOnce(
        partial([yerli()], { LOCAL: "BUDGET", ABROAD: "TIMEOUT" }, { LOCAL: POOL_FULL }),
      );
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      expect(screen.getByText(POOL_FULL)).toBeInTheDocument();
      expect(screen.getByText(TIMEOUT_NOTE)).toBeInTheDocument();
      h.external.mockResolvedValueOnce(partial([cand("Bearing GmbH", "sales@bearing.de", { country: "DE" })]));
      fireEvent.click(retryButton());
      expect(await screen.findByText("Bearing GmbH")).toBeInTheDocument();
      expect(lastSearch().scopes).toEqual(["ABROAD"]);
      expect(screen.queryByText(TIMEOUT_NOTE)).toBeNull();
      // Aranmayan (bütçenin reddettiği) geçiş sunucunun metniyle durur; aranacak geçiş kalmadı.
      expect(screen.getByText(POOL_FULL)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Yeniden ara" })).toBeNull();
    });

    it("yeni aramanın (ana düğme) bütçe reddi nota YAZILMAZ: her zamanki hata kutusu, eldeki not olduğu gibi", async () => {
      h.external.mockResolvedValueOnce(partial([yerli()], { ABROAD: "TIMEOUT" }));
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      h.external.mockRejectedValueOnce(budgetRefusal(DAILY_CAP));
      clickSearch();
      expect(await screen.findByRole("alert")).toHaveTextContent(DAILY_CAP);
      expect(screen.getByText(TIMEOUT_NOTE)).toBeInTheDocument();
      expect(screen.queryByText(BUDGET_NOTE)).toBeNull();
    });

    it("not metinleri üç dilde: neden başına ayrı cümle, iki geçiş ve yedek dal", async () => {
      const { createTranslator } = await import("use-intl/core");
      const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
      const keys = ["kismiSonucZamanAsimi", "kismiSonucHizmet", "kismiSonucButce"] as const;
      const texts = (["tr", "en", "ru"] as const).map((locale) => {
        const t = createTranslator({
          locale,
          messages: messagesFor(locale, WEB_NAMESPACES),
          namespace: "web.panel.requests.supplierDiscoveryModal" as never,
          onError: (e) => {
            throw e;
          },
        }) as unknown as (key: string, values?: Record<string, string>) => string;
        return keys.map((key) => (["LOCAL", "ABROAD", "ALL"] as const).map((scope) => t(key, { scope })));
      });
      const [trTexts, enTexts, ruTexts] = texts;
      expect(trTexts![0]![1]).toBe(TIMEOUT_NOTE);
      expect(trTexts![1]![1]).toBe(PROVIDER_NOTE);
      expect(trTexts![2]![1]).toBe(BUDGET_NOTE);
      expect(enTexts!.map((byScope) => byScope[1])).toEqual([
        "The search abroad took too long and could not be completed. The list shows only the results of the search that responded; you can search again to get the rest.",
        "The search service did not respond during the search abroad. The list shows only the results of the search that responded; you can search again to get the rest.",
        "The search abroad could not be run because of the AI usage limit. The list shows only the results of the search that was run.",
      ]);
      expect(ruTexts!.map((byScope) => byScope[1])).toEqual([
        "Поиск за рубежом занял слишком много времени и не был завершён. В списке только результаты той части поиска, которая ответила; чтобы получить остальное, можно повторить поиск.",
        "При поиске за рубежом поисковый сервис не ответил. В списке только результаты той части поиска, которая ответила; чтобы получить остальное, можно повторить поиск.",
        "Поиск за рубежом не выполнен из-за лимита использования ИИ. В списке только результаты выполненной части поиска.",
      ]);
      // Her dilde üç geçiş dalı da ayrı metindir (yurt içi / yurt dışı / yedek);
      // bütçe notu yeniden aramayı ÖNERMEZ.
      for (const byKey of texts) {
        for (const byScope of byKey) expect(new Set(byScope).size).toBe(3);
      }
      expect(trTexts![2]!.join(" ")).not.toMatch(/yeniden ara/i);
      expect(enTexts![2]!.join(" ")).not.toMatch(/search again/i);
      expect(ruTexts![2]!.join(" ")).not.toMatch(/повторит/i);
    });
  });

  describe("D9 — karşılanan kalemler, üyenin ülkesi, yakın zamanda davet notu", () => {
    it("web adayı talepteki hangi kalemleri karşıladığını gösterir (kalem sıra numaraları aramaya giden listeye göre)", async () => {
      h.external.mockResolvedValue(
        found([
          cand("Tubacex", "sales@tubacex.com", { matchedItems: [1] }),
          cand("Melesi", "info@melesi.com", { matchedItems: [3, 2] }),
          cand("Hepsi A.Ş.", "info@hepsi.com", { matchedItems: [1, 2, 3] }),
          cand("Bilinmiyor Ltd.", "info@bilinmiyor.com", { matchedItems: [] }),
        ]),
      );
      render(
        <SupplierDiscoveryModal
          isOpen
          onClose={() => {}}
          categoryIds={[]}
          // Boş ad sunucuda da sayılmaz: sıra numaraları kaymamalı.
          itemNames={["Dikişsiz boru", "  ", "Dirsek", "Flanş"]}
          listingId="l1"
        />,
      );
      await searchWeb("Tubacex");
      expect(h.external.mock.calls[0][0].itemNames).toEqual(["Dikişsiz boru", "Dirsek", "Flanş"]);
      const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
      expect(within(row("Tubacex")).getByText("Karşıladığı kalemler (1/3): Dikişsiz boru")).toBeInTheDocument();
      expect(within(row("Melesi")).getByText("Karşıladığı kalemler (2/3): Flanş, Dirsek")).toBeInTheDocument();
      expect(within(row("Hepsi A.Ş.")).getByText("Talepteki 3 kalemin tümünü karşılıyor")).toBeInTheDocument();
      expect(within(row("Bilinmiyor Ltd.")).queryByText(/kalem/)).toBeNull();
    });

    it("Platformda: üyenin ÜLKESİ bayrak + adla yazılır (ISO kodu değil)", async () => {
      h.discovery.mockResolvedValue([
        { companyId: "co1", name: "Lager GmbH", city: "Munich", country: "DE", rothernId: "R1", matchedCategories: [], strongMatch: false, matchedItems: [], connectionStatus: "NONE", alreadyInvited: false },
      ]);
      render(listingModal());
      const row = (await screen.findByText("Lager GmbH")).closest("li") as HTMLElement;
      expect(within(row).getByText("Munich")).toBeInTheDocument();
      expect(within(row).getByText("Almanya")).toBeInTheDocument();
      expect(row.querySelector('img[src$="/de.svg"]')).not.toBeNull();
      expect(within(row).queryByText("DE")).toBeNull();
    });

    it("adres yakın zamanda davet aldıysa gecikme / özet notu görünür", async () => {
      h.external.mockResolvedValue(
        found([cand("Önceden Davetli A.Ş.", "info@onceden.com", { recentlyInvited: true }), cand("Yeni A.Ş.", "info@yeni.com")]),
      );
      render(listingModal());
      await searchWeb("Önceden Davetli A.Ş.");
      const note = "Bu adres son 7 günde başka bir davet aldı: e-postanız gecikebilir ya da diğer davetlerle tek özette gidebilir.";
      expect(within(screen.getByText("Önceden Davetli A.Ş.").closest("li") as HTMLElement).getByText(note)).toBeInTheDocument();
      expect(screen.getAllByText(note)).toHaveLength(1);
    });
  });

  describe("D10 — toplu seçim ve liste alanı", () => {
    it("'Tümünü seç' yalnız seçilebilir satırları seçer; 'Seçimi temizle' boşaltır", async () => {
      h.external.mockResolvedValue(
        found([cand("Bir A.Ş.", "a@bir.com"), cand("İki A.Ş.", "a@iki.com"), cand("Üç A.Ş.", "a@uc.com")]),
      );
      h.sendExternal.mockResolvedValue([{ email: "a@bir.com", status: "QUEUED" }]);
      render(listingModal());
      await searchWeb("Bir A.Ş.");
      expect(screen.getByText("3 aday · 0 seçili")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Seçimi temizle" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Tümünü seç" }));
      expect(screen.getByText("3 aday · 3 seçili")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Davet E-postası Gönder (3)" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Tümünü seç" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Seçimi temizle" }));
      expect(screen.getByText("3 aday · 0 seçili")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Davet E-postası Gönder (0)" })).toBeDisabled();
      // Bir satır davet edilince kilitlenir; "Tümünü seç" onu seçmez.
      fireEvent.click(screen.getByLabelText("Bir A.Ş. seç"));
      fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (1)" }));
      await waitFor(() => expect(screen.getByLabelText("Bir A.Ş. seç")).toBeDisabled());
      fireEvent.click(screen.getByRole("button", { name: "Tümünü seç" }));
      expect(screen.getByLabelText("Bir A.Ş. seç")).not.toBeChecked();
      expect(screen.getByText("3 aday · 2 seçili")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Davet E-postası Gönder (2)" })).toBeEnabled();
    });

    it("liste pencerenin çoğunu kullanır: açıklama ve altbilgi kaydırılan gövdede, gönder şeridi dışında; yükseklik dvh", async () => {
      render(listingModal());
      openWebTab();
      const panel = screen.getByRole("dialog").querySelector('[class*="100dvh"]') as HTMLElement;
      expect(panel).not.toBeNull();
      const body = panel.querySelector(".overflow-y-auto") as HTMLElement;
      expect(body.className).toContain("flex-1");
      // Giriş açıklaması sabit başlıkta değil, kaydırılan gövdede…
      expect(body).toContainElement(screen.getByText(/Platformdaki üyeleri doğrudan talebe davet edin/));
      clickSearch();
      await screen.findByText("Baret A.Ş.");
      // …ve adaylar listelenince yer tutmaz.
      expect(screen.queryByText(/Platformdaki üyeleri doğrudan talebe davet edin/)).toBeNull();
      expect(body).toContainElement(screen.getByText(/bu talebe özel davet e-postası gider/));
      expect(body).toContainElement(screen.getByText(/Firma başına günde en fazla/));
      expect(body).toContainElement(screen.getByText("Baret A.Ş."));
      // Başlık, sekmeler ve gönder şeridi kaydırılan alanın dışında (küçülmez).
      const send = screen.getByRole("button", { name: /Davet E-postası Gönder/ });
      expect(body).not.toContainElement(send);
      expect(body).not.toContainElement(screen.getByRole("tablist"));
      expect((send.closest("div.border-t") as HTMLElement).className).toContain("shrink-0");
    });

    it("üye satırı dar ekranda sarar: metin tam genişlik alabilir, eylem sona yaslanır", async () => {
      h.external.mockResolvedValue(
        found([cand("Üye Kask AŞ", "satis@uyekask.com", { status: "MEMBER", memberCompanyId: "co9", reason: "Uzun bir gerekçe metni" })]),
      );
      render(listingModal());
      await searchWeb("Üye Kask AŞ");
      const li = screen.getByText("Üye Kask AŞ").closest("li") as HTMLElement;
      expect(li.className).toContain("flex-wrap");
      const text = screen.getByText("Uzun bir gerekçe metni").parentElement as HTMLElement;
      expect(text.className).toContain("flex-[1_1_12rem]");
      const action = within(li).getByRole("button", { name: "Üye Kask AŞ firmasını talebe davet et" });
      expect(action.className).toContain("ml-auto");
    });
  });

  describe("D11 — adresi geçersiz seçili satır", () => {
    it("alan işaretlenir (aria-invalid + mesaj) ve düğmedeki sayıya girmez; düzeltilince işaret kalkar", async () => {
      render(listingModal());
      await searchWeb();
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      fireEvent.click(screen.getByLabelText("Kask Ltd. seç"));
      const field = screen.getByLabelText("Baret A.Ş. e-posta adresi");
      expect(field).not.toHaveAttribute("aria-invalid");
      fireEvent.change(field, { target: { value: "satis@" } });
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription("Geçerli bir e-posta adresi yazın");
      expect(screen.getByRole("button", { name: "Davet E-postası Gönder (1)" })).toBeEnabled();
      expect(screen.getByText("1 seçili adayın e-posta adresi geçersiz; düzeltilene dek davet gönderilmez")).toBeInTheDocument();
      // Seçili olmayan satırın adresi bozuksa işaretlenmez (gönderilmeyecek).
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      expect(field).not.toHaveAttribute("aria-invalid");
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      fireEvent.change(field, { target: { value: "satis@baret.com" } });
      expect(field).not.toHaveAttribute("aria-invalid");
      expect(screen.getByRole("button", { name: "Davet E-postası Gönder (2)" })).toBeEnabled();
      expect(screen.queryByText(/e-posta adresi geçersiz/)).toBeNull();
    });

    it("yalnız geçersiz adres seçiliyse gönder düğmesi pasif (0)", async () => {
      render(listingModal());
      await searchWeb();
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      fireEvent.change(screen.getByLabelText("Baret A.Ş. e-posta adresi"), { target: { value: "" } });
      expect(screen.getByRole("button", { name: "Davet E-postası Gönder (0)" })).toBeDisabled();
      expect(h.sendExternal).not.toHaveBeenCalled();
    });
  });

  describe("D12 — bekleme durumu", () => {
    it("role=status, dürüst süre metni ve saniye sayan sayaç", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      const search = deferredSearch();
      render(listingModal());
      openWebTab();
      clickSearch();
      const status = screen.getByRole("status");
      // N1 — dürüst süre: arama gündüz 70-90 sn sürüyor, "1,5 dakikaya kadar" tutmuyordu.
      expect(status).toHaveTextContent(
        "Web'de aranıyor… Arama genellikle bir-iki dakika sürer; yoğun saatlerde daha uzun sürebilir.",
      );
      expect(status).not.toHaveTextContent("1,5 dakika");
      expect(status).not.toHaveTextContent("30-60");
      expect(screen.getByRole("timer")).toHaveTextContent("Geçen süre: 0 sn");
      expect(screen.getByText(/Pencereyi kapatabilirsiniz: arama sürer/)).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("timer")).toHaveTextContent("Geçen süre: 3 sn");
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      // Bir dakikadan sonra "dk + sn" (arama dakikalar sürebilir).
      expect(screen.getByRole("timer")).toHaveTextContent("Geçen süre: 1 dk 3 sn");
      act(() => {
        vi.advanceTimersByTime(117_000);
      });
      expect(screen.getByRole("timer")).toHaveTextContent("Geçen süre: 3 dk 0 sn");
      await search.resolve(found([cand("Baret A.Ş.", "info@baret.com")]));
      expect(screen.queryByRole("timer")).toBeNull();
      expect(screen.getByText("Baret A.Ş.")).toBeInTheDocument();
    });

    it("kapatıp açınca sayaç gerçek geçen süreden sürer", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      const search = deferredSearch();
      const { rerender } = render(listingModal());
      openWebTab();
      clickSearch();
      rerender(listingModal({ isOpen: false }));
      act(() => {
        vi.advanceTimersByTime(40_000);
      });
      rerender(listingModal());
      expect(screen.getByRole("timer")).toHaveTextContent("Geçen süre: 40 sn");
      await search.resolve(found([]));
    });
  });

  describe("R2 — arama biterken pencere 'Platformda' sekmesindeyse sonuç kaybolmaz", () => {
    const webTab = () => screen.getByRole("tab", { name: /Web'de Ara/ });
    const toPlatform = () => fireEvent.click(screen.getByRole("tab", { name: "Platformda" }));

    it("başarı: sekmeyi gösteren TEK toast; arama sürerken web sekmesinin simgesi döner", async () => {
      const search = deferredSearch();
      render(listingModal());
      openWebTab();
      expect(webTab().querySelector(".animate-spin")).toBeNull();
      clickSearch();
      // Web sekmesindeyken bekleme bloğu görünür; sekme simgesi ayrıca dönmez.
      expect(screen.getByRole("timer")).toBeInTheDocument();
      expect(webTab().querySelector(".animate-spin")).toBeNull();
      // Alıcı beklerken üyeleri davet etmek için öteki sekmeye geçer.
      toPlatform();
      expect(screen.queryByRole("timer")).toBeNull();
      // Arama sürüyor: web sekmesi başlığında dönen simge.
      expect(webTab().querySelector(".animate-spin")).not.toBeNull();
      await search.resolve(found([cand("Geç Gelen A.Ş.", "info@gecgelen.com")]));
      expect(h.toast.success).toHaveBeenCalledTimes(1);
      expect(h.toast.success).toHaveBeenCalledWith("Web araması tamamlandı — sonuçlar “Web'de Ara (AI)” sekmesinde");
      expect(h.toast.error).not.toHaveBeenCalled();
      expect(webTab().querySelector(".animate-spin")).toBeNull();
      // Sonuç web sekmesinde duruyor.
      expect(screen.queryByText("Geç Gelen A.Ş.")).toBeNull();
      openWebTab();
      expect(screen.getByText("Geç Gelen A.Ş.")).toBeInTheDocument();
    });

    it("hata: mesaj tek toast olarak verilir ve 'Yeniden ara'nın yeri söylenir; kutu web sekmesinde durur", async () => {
      const search = deferredSearch();
      render(listingModal());
      openWebTab();
      clickSearch();
      toPlatform();
      await search.reject({
        isAxiosError: true,
        response: { status: 503, data: { message: "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin." } },
      });
      expect(h.toast.error).toHaveBeenCalledTimes(1);
      expect(h.toast.error).toHaveBeenCalledWith("AI isteği zaman aşımına uğradı — lütfen tekrar deneyin.", {
        description: "Yeniden aramak için “Web'de Ara (AI)” sekmesine geçin",
      });
      expect(h.toast.success).not.toHaveBeenCalled();
      // Platformda sekmesinde hata kutusu yok; web sekmesinde kalıcı.
      expect(screen.queryByText(/zaman aşımına uğradı/)).toBeNull();
      openWebTab();
      expect(screen.getByRole("alert")).toHaveTextContent("AI isteği zaman aşımına uğradı");
      expect(screen.getByRole("button", { name: "Yeniden ara" })).toBeInTheDocument();
    });

    it("arama biterken web sekmesine DÖNÜLMÜŞSE toast yok (sonuç gövdede)", async () => {
      const search = deferredSearch();
      render(listingModal());
      openWebTab();
      clickSearch();
      toPlatform();
      openWebTab();
      await search.resolve(found([cand("Geç Gelen A.Ş.", "info@gecgelen.com")]));
      expect(screen.getByText("Geç Gelen A.Ş.")).toBeInTheDocument();
      expect(h.toast.success).not.toHaveBeenCalled();
    });

    it("sekme metinleri üç dilde: sekmenin o dildeki adını taşır", async () => {
      const { createTranslator } = await import("use-intl/core");
      const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
      const texts = (["tr", "en", "ru"] as const).map((locale) => {
        const t = createTranslator({
          locale,
          messages: messagesFor(locale, WEB_NAMESPACES),
          namespace: "web.panel.requests.supplierDiscoveryModal" as never,
          onError: (e) => {
            throw e;
          },
        }) as unknown as (key: string, values?: Record<string, string>) => string;
        const tab = t("webDeAraAi");
        return [t("aramaTamamlandiSekmede", { tab }), t("aramaHatasiSekmede", { tab })];
      });
      expect(texts).toEqual([
        ["Web araması tamamlandı — sonuçlar “Web'de Ara (AI)” sekmesinde", "Yeniden aramak için “Web'de Ara (AI)” sekmesine geçin"],
        [
          "The web search has finished — the results are on the “Search the web (AI)” tab",
          "Switch to the “Search the web (AI)” tab to search again",
        ],
        [
          "Поиск в интернете завершён — результаты на вкладке «Поиск в интернете (ИИ)»",
          "Чтобы повторить поиск, перейдите на вкладку «Поиск в интернете (ИИ)»",
        ],
      ]);
    });
  });

  describe("R3 — sunucunun yanıtı pencerede saklanan üye durumundan önce gelir", () => {
    const member = (companyId: string, name: string, over: Row = {}): Row => ({
      companyId,
      name,
      city: null,
      rothernId: `R-${companyId}`,
      matchedCategories: [],
      // Toplu davet yalnız güçlü eşleşenlere sunulur (N2).
      strongMatch: true,
      matchedItems: [],
      connectionStatus: "NONE",
      alreadyInvited: false,
      ...over,
    });
    const NOT_ELIGIBLE = "Bu talebi göremiyor (ülke kısıtı ya da engel)";

    it("davet düzenleme formunda kaldırıldıysa yeniden açılışta satır 'Talebe davetli' kalmaz; saklanan ret (NOT_ELIGIBLE) de düşer, toplu davet düğmesi ikisini de sayar", async () => {
      h.discovery.mockResolvedValue([member("co1", "Bağlantı AŞ"), member("co2", "Somun Ltd"), member("co3", "Pul AŞ")]);
      h.inviteMembers.mockResolvedValue([
        { companyId: "co1", status: "INVITED" },
        { companyId: "co2", status: "NOT_ELIGIBLE" },
        { companyId: "co3", status: "INVITED" },
      ]);
      const { rerender } = render(listingModal());
      await screen.findByText("Bağlantı AŞ");
      fireEvent.click(screen.getByRole("button", { name: "Güçlü eşleşenleri davet et (3)" }));
      expect(await screen.findAllByText("Talebe davetli")).toHaveLength(2);
      expect(screen.getByText(NOT_ELIGIBLE)).toBeInTheDocument();

      // Pencere kapanır. Alıcı düzenleme formunda co1'in davetini kaldırır ve
      // ülke kapsamını genişletir; co3'ün daveti durur. Sunucu bunu söyler.
      rerender(listingModal({ isOpen: false }));
      h.discovery.mockResolvedValue([
        member("co1", "Bağlantı AŞ"),
        member("co2", "Somun Ltd"),
        member("co3", "Pul AŞ", { alreadyInvited: true }),
      ]);
      rerender(listingModal());
      await waitFor(() => expect(h.discovery).toHaveBeenCalledTimes(2));
      await screen.findByText("Bağlantı AŞ");

      const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
      expect(within(row("Bağlantı AŞ")).queryByText("Talebe davetli")).toBeNull();
      expect(within(row("Bağlantı AŞ")).getByRole("button", { name: "Talebe davet et" })).toBeEnabled();
      expect(screen.queryByText(NOT_ELIGIBLE)).toBeNull();
      expect(within(row("Somun Ltd")).getByRole("button", { name: "Talebe davet et" })).toBeEnabled();
      // Sunucunun hâlâ davetli dediği satır davetli kalır.
      expect(within(row("Pul AŞ")).getByText("Talebe davetli")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Güçlü eşleşenleri davet et (2)" })).toBeInTheDocument();
    });

    it("web aramasının bulduğu üye: platform yanıtı 'davetli değil' diyorsa düğme geri gelir; yanıtta OLMAYAN üyenin saklanan durumu kalır", async () => {
      h.external.mockResolvedValue(
        found([
          cand("Üye Kask AŞ", "satis@uyekask.com", { status: "MEMBER", memberCompanyId: "co9" }),
          cand("Yalnız Web Üyesi", "info@yalnizweb.com", { status: "MEMBER", memberCompanyId: "co8" }),
        ]),
      );
      h.discovery.mockResolvedValue([member("co9", "Üye Kask AŞ")]);
      h.inviteMembers.mockImplementation(async ({ companyIds }: { companyIds: string[] }) =>
        companyIds.map((companyId) => ({ companyId, status: "INVITED" })),
      );
      const { rerender } = render(listingModal());
      await searchWeb("Üye Kask AŞ");
      fireEvent.click(screen.getByRole("button", { name: "Üye Kask AŞ firmasını talebe davet et" }));
      await waitFor(() => expect(screen.queryByRole("button", { name: "Üye Kask AŞ firmasını talebe davet et" })).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "Yalnız Web Üyesi firmasını talebe davet et" }));
      await waitFor(() => expect(screen.getAllByText("Talebe davetli")).toHaveLength(2));

      // co9'un daveti düzenleme formunda kaldırıldı; pencere yeniden açılır (web sekmesi oturumda).
      rerender(listingModal({ isOpen: false }));
      rerender(listingModal());
      await waitFor(() => expect(h.discovery).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole("button", { name: "Üye Kask AŞ firmasını talebe davet et" })).toBeEnabled();
      // Platform yanıtında olmayan üye için taze bilgi yok → saklanan durum kalır.
      const webOnly = screen.getByText("Yalnız Web Üyesi").closest("li") as HTMLElement;
      expect(within(webOnly).getByText("Talebe davetli")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(1);
    });
  });

  describe("R4 — 'Yeniden ara' odağı kaybetmez", () => {
    it("hata kutusundaki düğme arama başlayınca kaldırılır: odak kalıcı bekleme bloğuna geçer ve arama bitince de orada kalır", async () => {
      h.external.mockRejectedValueOnce({ isAxiosError: true, response: undefined });
      render(listingModal());
      openWebTab();
      clickSearch();
      const retry = await screen.findByRole("button", { name: "Yeniden ara" });
      retry.focus();
      expect(document.activeElement).toBe(retry);

      const search = deferredSearch();
      fireEvent.click(retry);
      // Hata kutusu (ve düğme) gitti; odak belgeye düşmedi.
      expect(screen.queryByRole("button", { name: "Yeniden ara" })).toBeNull();
      const stop = document.activeElement as HTMLElement;
      expect(stop).not.toBe(document.body);
      expect(stop).toHaveAttribute("tabindex", "-1");
      expect(stop).toContainElement(screen.getByRole("status"));
      expect(screen.getByRole("status")).toHaveTextContent("Web'de aranıyor");
      expect(screen.getByRole("dialog")).toContainElement(stop);

      // Arama bitince bekleme metni kalkar ama durak bağlı kalır: odak yerinde.
      await search.resolve(found([cand("Baret A.Ş.", "info@baret.com")]));
      expect(screen.queryByRole("timer")).toBeNull();
      expect(document.body).toContainElement(stop);
      expect(document.activeElement).toBe(stop);
      expect(stop).toBeEmptyDOMElement();
      // Sonuçlar duraktan SONRA gelir: sonraki Tab ilk adaya gider.
      const firstRow = screen.getByLabelText("Baret A.Ş. seç");
      expect(stop.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("arama yine düşerse yeni 'Yeniden ara' duraktan hemen sonradır; kısmi sonuç kutusundaki düğme de odağı durağa alır", async () => {
      h.external.mockRejectedValueOnce({ isAxiosError: true, response: undefined });
      render(listingModal());
      openWebTab();
      clickSearch();
      const first = await screen.findByRole("button", { name: "Yeniden ara" });
      first.focus();
      h.external.mockRejectedValueOnce({ isAxiosError: true, response: undefined });
      fireEvent.click(first);
      const again = await screen.findByRole("button", { name: "Yeniden ara" });
      const stop = document.activeElement as HTMLElement;
      expect(stop).toHaveAttribute("tabindex", "-1");
      expect(stop.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      // Kısmi sonuç: düğme yerinde kalır ama arama sürerken pasifleşir.
      h.external.mockResolvedValueOnce(found([cand("Yerli Rulman A.Ş.", "satis@yerlirulman.com")], ["ABROAD"]));
      fireEvent.click(again);
      await screen.findByText("Yerli Rulman A.Ş.");
      const partial = screen.getByRole("button", { name: "Yeniden ara" });
      partial.focus();
      const pending = deferredSearch();
      fireEvent.click(partial);
      expect(partial).toBeDisabled();
      expect(document.activeElement).toBe(stop);
      await pending.resolve(found([cand("Yerli Rulman A.Ş.", "satis@yerlirulman.com")]));
    });
  });

  describe("R6 — gönder şeridindeki düğme pencereden taşmaz", () => {
    // Düğmenin KENDİ sınıfı (Catalyst tabanındaki `*:data-[slot=icon]:shrink-0` simgeye aittir, sayılmaz).
    const own = (el: HTMLElement) => el.className.split(/\s+/);

    it("düğmeler `shrink-0` / tek satır zorlaması taşımaz: şeritten uzun etiket (RU, 375 px) düğmeyi daraltır ve sarar", async () => {
      const { unmount } = render(listingModal());
      await searchWeb();
      const send = screen.getByRole("button", { name: /Davet E-postası Gönder/ });
      expect(own(send)).not.toContain("shrink-0");
      expect(own(send)).not.toContain("whitespace-nowrap");
      expect(own(send)).toContain("max-w-full");
      // Şerit sarar: tek başına şeritten geniş düğme kendi satırında daralır.
      const bar = send.parentElement as HTMLElement;
      expect(own(bar)).toContain("flex-wrap");
      unmount();

      render(<SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} itemNames={["Baret"]} onCollect={vi.fn()} />);
      await searchWeb();
      const add = screen.getByRole("button", { name: /Talebe ekle/ });
      expect(own(add)).not.toContain("shrink-0");
      expect(own(add)).not.toContain("whitespace-nowrap");
      expect(own(add)).toContain("max-w-full");
    });
  });

  describe("D13 — adresin alan adı siteden farklı", () => {
    it("farklıysa 'doğrulayın' ipucu; aynıysa (alt alan adı dahil) yok; adres düzeltilince kalkar", async () => {
      h.external.mockResolvedValue(
        found([
          cand("Silkar Endaş", "satis@silkarendas.com", { website: "https://www.endas.com/iletisim" }),
          cand("Aynı A.Ş.", "info@mail.ayni.com.tr", { website: "www.ayni.com.tr" }),
          cand("Sitesiz Ltd.", "info@sitesiz.com"),
        ]),
      );
      render(listingModal());
      await searchWeb("Silkar Endaş");
      const hint = "Adresin alan adı (silkarendas.com) firmanın sitesinden (endas.com) farklı — göndermeden önce adresi doğrulayın.";
      const field = screen.getByLabelText("Silkar Endaş e-posta adresi");
      expect(field).toHaveAccessibleDescription(hint);
      expect(screen.getAllByText(/firmanın sitesinden/)).toHaveLength(1);
      fireEvent.change(field, { target: { value: "satis@endas.com" } });
      expect(screen.queryByText(/firmanın sitesinden/)).toBeNull();
    });
  });
});

/**
 * CANLI YENİDEN DOĞRULAMA (2026-10-09) — `live-recheck.json` N1 / N2 / N4 / N5.
 */
describe("SupplierDiscoveryModal — canlı yeniden doğrulama (2026-10-09)", () => {
  const SESSION_ROOT = "supplier-discovery-session";
  const sessionOf = (listingId: string) =>
    queryClient.getQueryData([SESSION_ROOT, `l:${listingId}`]) as Record<string, unknown> | undefined;
  const optionsOf = (call: number) => h.external.mock.calls[call][1] as ExternalSearchOptions;
  const raw500 = { isAxiosError: true, response: { status: 500, data: { statusCode: 500, message: "Internal server error" } } };
  const own = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
  const translator = async (locale: "tr" | "en" | "ru") => {
    const { createTranslator } = await import("use-intl/core");
    const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
    return createTranslator({
      locale,
      messages: messagesFor(locale, WEB_NAMESPACES),
      namespace: "web.panel.requests.supplierDiscoveryModal" as never,
      onError: (e) => {
        throw e;
      },
    }) as unknown as (key: string, values?: Record<string, string | number>) => string;
  };

  describe("N1 — web araması zaman uyumsuz: kimlik oturumda, arama aynı kalır", () => {
    it("arama kimliği oturuma yazılır; sayfa yeniden bağlanınca başlatanın izlediği arama ne yeniden BAŞLATILIR ne de ikinci kez yoklanır", async () => {
      const search = deferredSearch();
      const { unmount } = render(listingModal());
      openWebTab();
      clickSearch();
      const options = optionsOf(0);
      // Yeni arama: başlatma ucu denenir; bekleme tavanı aramanın başladığı andan.
      expect(options.sync).toBeUndefined();
      expect(options.since).toBe(sessionOf("l1")?.searchSince);
      expect(sessionOf("l1")?.searchId).toBeNull();
      act(() => options.onStarted?.("s-1"));
      expect(sessionOf("l1")?.searchId).toBe("s-1");

      // Sayfa yeniden bağlanır (aynı önbellek): pencere örneği yenidir.
      unmount();
      render(listingModal());
      expect(screen.getByRole("status")).toHaveTextContent("Web'de aranıyor");
      expect(screen.getByRole("button", { name: "Web'de Ara" })).toBeDisabled();
      expect(h.external).toHaveBeenCalledTimes(1);
      expect(h.resume).not.toHaveBeenCalled();

      await search.resolve(found([cand("Geç Gelen A.Ş.", "info@gecgelen.com")]));
      expect(screen.getByText("Geç Gelen A.Ş.")).toBeInTheDocument();
      expect(sessionOf("l1")?.searchId).toBeNull();
      expect(h.toast.success).not.toHaveBeenCalled();
    });

    /** Önceki sayfadan kalan oturum: arama sürüyor, sunucudaki kimliği belli, izleyen döngü yok. */
    const seedOrphanSearch = (over: Record<string, unknown> = {}) =>
      queryClient.setQueryData([SESSION_ROOT, "l:l1"], {
        tab: "external",
        web: null,
        searchSince: Date.now() - 40_000,
        searchMode: "replace",
        searchScopes: null,
        searchToken: 900_001,
        searchId: "s-9",
        searchItems: ["Rulman 6204", "Keçe"],
        syncOnly: false,
        searchError: null,
        region: "",
        emailDrafts: {},
        langDrafts: {},
        selected: [],
        sendStatus: {},
        sendNote: null,
        invited: [],
        memberStatus: {},
        ...over,
      });

    it("izleyeni olmayan süren arama DEVRALINIR: kimlikle yoklama sürer (yeni arama yok), sonuç oturuma yazılır; iki pencere tek kez devralır", async () => {
      let resolve: (v: unknown) => void = () => {};
      h.resume.mockReset().mockReturnValueOnce(new Promise((res) => (resolve = res)));
      seedOrphanSearch();
      const since = sessionOf("l1")?.searchSince;
      const view = (open: boolean) => (
        <>
          <SupplierDiscoveryModal isOpen={false} onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />
          <SupplierDiscoveryModal isOpen={open} onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />
        </>
      );
      // Sayfa bağlanır, pencere KAPALI: arama yine de devralınır.
      const { rerender } = render(view(false));
      await waitFor(() => expect(h.resume).toHaveBeenCalledTimes(1));
      const [searchId, options] = h.resume.mock.calls[0] as [string, ExternalSearchOptions];
      expect(searchId).toBe("s-9");
      // Tavan aramanın BAŞLADIĞI andan sayılır.
      expect(options.since).toBe(since);
      expect(options.shouldStop?.()).toBe(false);
      expect(h.external).not.toHaveBeenCalled();

      await act(async () => {
        resolve(found([cand("Devralınan A.Ş.", "info@devralinan.com", { matchedItems: [2] })]));
      });
      // Sonucu gören pencere yoktu → tek bilgi toast'ı.
      expect(h.toast.success).toHaveBeenCalledTimes(1);
      expect(h.toast.success).toHaveBeenCalledWith("Web araması tamamlandı — sonuçları görmek için pencereyi yeniden açın");
      rerender(view(true));
      const row = screen.getByText("Devralınan A.Ş.").closest("li") as HTMLElement;
      // Karşılanan kalem, aramaya GİDEN kalem listesinden (oturumda saklı) çözülür.
      expect(within(row).getByText("Karşıladığı kalemler (1/2): Keçe")).toBeInTheDocument();
      expect(screen.queryByRole("timer")).toBeNull();
      expect(h.resume).toHaveBeenCalledTimes(1);
      expect(h.external).not.toHaveBeenCalled();
    });

    it("devralınan aramanın kimliği artık bilinmiyorsa (API yeniden başladı) 'yarıda kesildi' + 'Yeniden ara' YENİ arama başlatır", async () => {
      h.resume.mockReset().mockRejectedValueOnce(new ExternalSearchError("INTERRUPTED", { statusCode: 404 }));
      seedOrphanSearch();
      render(listingModal());
      expect(await screen.findByRole("alert")).toHaveTextContent("Web araması yarıda kesildi — yeniden arayın");
      expect(screen.queryByRole("timer")).toBeNull();
      // Pencere açık ve web sekmesinde: mesaj gövdede, toast yok.
      expect(h.toast.error).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
      expect(await screen.findByText("Baret A.Ş.")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(1);
      expect(h.external.mock.calls[0][0]).toMatchObject({ type: "ALIM", listingId: "l1" });
      expect(h.resume).toHaveBeenCalledTimes(1);
    });

    it("8 dakikada sonuç gelmezse pencere bunu kendi metniyle söyler", async () => {
      h.external.mockRejectedValueOnce(new ExternalSearchError("TIMED_OUT"));
      render(listingModal());
      openWebTab();
      clickSearch();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Web araması beklenenden uzun sürdü ve sonuç alınamadı — yeniden arayın",
      );
      expect(screen.getByRole("button", { name: "Yeniden ara" })).toBeInTheDocument();
    });

    it("sunucuda düşen aramanın (FAILED) nedeni eş zamanlı ucun hatası gibi okunur: metin gövdede, bütçe reddi nota", async () => {
      // Tek geçişli arama zaman aşımına uğradı: sunucunun istek dilindeki metni.
      h.external.mockRejectedValueOnce(
        new ExternalSearchError("FAILED", {
          statusCode: 503,
          serverMessage: "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin.",
        }),
      );
      const { unmount } = render(listingModal());
      openWebTab();
      clickSearch();
      expect(await screen.findByRole("alert")).toHaveTextContent("AI isteği zaman aşımına uğradı — lütfen tekrar deneyin.");
      unmount();

      // Yalnız eksiği arayan aramayı bütçe reddetti (403 kodu FAILED içinde gelir).
      queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const POOL_FULL = "Firmanızın aylık AI bütçesi doldu — AI özellikleri gelecek ay yeniden açılır.";
      h.external
        .mockReset()
        .mockResolvedValueOnce(partial([cand("Yerli Rulman A.Ş.", "satis@yerlirulman.com")], { ABROAD: "TIMEOUT" }))
        .mockRejectedValueOnce(
          new ExternalSearchError("FAILED", { statusCode: 403, code: "AI_BUDGET_EXCEEDED", serverMessage: POOL_FULL }),
        );
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
      expect(await screen.findByText(POOL_FULL)).toBeInTheDocument();
      expect(h.external.mock.calls[1][0]).toMatchObject({ scopes: ["ABROAD"] });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("button", { name: "Yeniden ara" })).toBeNull();
      expect(screen.getByText("Yerli Rulman A.Ş.")).toBeInTheDocument();
    });

    it("başlatma ucu yoksa (eski API) bağlamın sonraki aramaları doğrudan eş zamanlı uca gider; başka talep yeniden dener", async () => {
      h.external.mockImplementationOnce(async (_input: unknown, options: ExternalSearchOptions) => {
        // Kanca: başlatma ucu 404 verdi, arama eş zamanlı uca düştü.
        options.onSyncFallback?.();
        return found([cand("Baret A.Ş.", "info@baret.com")]);
      });
      const { rerender } = render(listingModal());
      await searchWeb();
      expect(optionsOf(0).sync).toBeUndefined();
      expect(sessionOf("l1")?.syncOnly).toBe(true);
      clickSearch();
      await waitFor(() => expect(h.external).toHaveBeenCalledTimes(2));
      expect(optionsOf(1).sync).toBe(true);
      await waitFor(() => expect(screen.queryByRole("timer")).toBeNull());
      // Başka talebin oturumu ayrıdır: başlatma ucu yeniden denenir.
      rerender(listingModal({ listingId: "l2" }));
      openWebTab();
      clickSearch();
      await waitFor(() => expect(h.external).toHaveBeenCalledTimes(3));
      expect(optionsOf(2).sync).toBeUndefined();
    });

    it("oturum silinince (çıkış / başka hesap) yoklama bırakılır", async () => {
      deferredSearch();
      render(listingModal());
      openWebTab();
      clickSearch();
      const options = optionsOf(0);
      expect(options.shouldStop?.()).toBe(false);
      act(() => {
        queryClient.clear();
      });
      expect(options.shouldStop?.()).toBe(true);
      // Silinen oturuma kimlik de yazılmaz.
      act(() => options.onStarted?.("s-1"));
      expect(sessionOf("l1")).toBeUndefined();
    });

    it("bekleme metinleri üç dilde: dürüst süre, dakikalı sayaç, kesilme ve süre dolması", async () => {
      const texts = await Promise.all(
        (["tr", "en", "ru"] as const).map(async (locale) => {
          const t = await translator(locale);
          return [t("webDeAraniyorSure"), t("gecenSureDakika", { m: 2, s: 5 }), t("aramaYaridaKesildi"), t("aramaCokUzunSurdu")];
        }),
      );
      expect(texts).toEqual([
        [
          "Web'de aranıyor… Arama genellikle bir-iki dakika sürer; yoğun saatlerde daha uzun sürebilir.",
          "Geçen süre: 2 dk 5 sn",
          "Web araması yarıda kesildi — yeniden arayın",
          "Web araması beklenenden uzun sürdü ve sonuç alınamadı — yeniden arayın",
        ],
        [
          "Searching the web… A search usually takes one to two minutes and can take longer at busy times.",
          "Elapsed: 2 min 5 s",
          "The web search was interrupted — search again",
          "The web search took longer than expected and returned no result — search again",
        ],
        [
          "Идёт поиск в интернете… Обычно он занимает одну-две минуты, а в часы высокой нагрузки может идти дольше.",
          "Прошло: 2 мин 5 с",
          "Поиск в интернете был прерван — запустите его снова",
          "Поиск в интернете занял больше времени, чем ожидалось, и не дал результата — запустите его снова",
        ],
      ]);
    });
  });

  describe("R6-02 — süren arama sayfa yenilemeyi aşar (kimlik sekme deposunda)", () => {
    /** F5: sayfanın belleği (önbellek + arama döngüsü) gider, sekme deposu kalır. */
    const reloadPage = (view: { unmount: () => void }) => {
      view.unmount();
      // Eski sayfanın döngüsü ölür (oturumu silinen yoklama bırakılır)…
      queryClient.clear();
      // …yeni sayfa BOŞ önbellekle açılır.
      queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    };
    const takeover = () => {
      let resolve: (v: unknown) => void = () => {};
      let reject: (e: unknown) => void = () => {};
      h.resume.mockReset().mockReturnValueOnce(
        new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        }),
      );
      return {
        resolve: (v: unknown) => act(async () => resolve(v)),
        reject: (e: unknown) => act(async () => reject(e)),
      };
    };
    const pending = (over: Record<string, unknown> = {}) => ({
      searchId: "s-9",
      since: Date.now() - 40_000,
      mode: "replace" as const,
      scopes: null,
      items: ["Rulman 6204", "Keçe"],
      region: "",
      ...over,
    });

    it("kimlik gelince kayıt yazılır; YENİ sayfa (boş önbellek) aynı aramayı kimliğiyle sürdürür: 'aranıyor', 'Web'de Ara' pasif, ikinci arama yok; sonuç gelince kayıt BİTTİ diye işaretlenir (AS-1)", async () => {
      h.detail = { data: { categoryIds: ["39121600"], items: [{ name: "Rulman 6204" }, { name: "Keçe" }] }, isLoading: false };
      deferredSearch();
      const first = render(listingModal());
      openWebTab();
      fireEvent.change(screen.getByRole("textbox", { name: "Bölge (ops. — örn. İstanbul, Ege)" }), {
        target: { value: " Ege " },
      });
      clickSearch();
      // Sunucu kimliği vermeden saklanacak bir şey yok.
      expect(readPendingExternalSearch("l:l1")).toBeNull();
      act(() => optionsOf(0).onStarted?.("s-1"));
      const since = sessionOf("l1")?.searchSince as number;
      expect(readPendingExternalSearch("l:l1")).toEqual({
        searchId: "s-1",
        since,
        mode: "replace",
        scopes: null,
        items: ["Rulman 6204", "Keçe"],
        region: "Ege",
      });

      reloadPage(first);
      const search = takeover();
      // Sayfa açılır, pencere KAPALI: arama yine de izlenir (yeni arama BAŞLAMAZ).
      const second = render(listingModal({ isOpen: false }));
      await waitFor(() => expect(h.resume).toHaveBeenCalledTimes(1));
      const [searchId, options] = h.resume.mock.calls[0] as [string, ExternalSearchOptions];
      expect(searchId).toBe("s-1");
      // Sayaç ve bekleme tavanı aramanın BAŞLADIĞI andan sürer.
      expect(options.since).toBe(since);
      expect(h.external).toHaveBeenCalledTimes(1);

      // Pencere açılır: web sekmesi, bekleme durumu, düğme pasif, aranan bölge alanda.
      second.rerender(listingModal());
      expect(screen.getByRole("tab", { name: /Web'de Ara/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("status")).toHaveTextContent("Web'de aranıyor");
      expect(screen.getByRole("timer")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Web'de Ara" })).toBeDisabled();
      expect(screen.getByRole("textbox", { name: "Bölge (ops. — örn. İstanbul, Ege)" })).toHaveValue("Ege");
      // İkinci yenileme de aynı aramayı bulur (okumak silmez).
      expect(readPendingExternalSearch("l:l1")?.searchId).toBe("s-1");

      await search.resolve(found([cand("Yenilemeden Sonra A.Ş.", "info@sonra.com", { matchedItems: [2] })]));
      const row = screen.getByText("Yenilemeden Sonra A.Ş.").closest("li") as HTMLElement;
      // Karşılanan kalem, aramaya GİDEN kalem listesinden (kayıtta saklı) çözülür.
      expect(within(row).getByText("Karşıladığı kalemler (1/2): Keçe")).toBeInTheDocument();
      expect(screen.queryByRole("timer")).toBeNull();
      expect(screen.getByRole("button", { name: "Web'de Ara" })).toBeEnabled();
      // Arama SONUÇLA bitti: kayıt silinmez (AS-1) — aynı arama, `finished` işaretiyle;
      // sonraki sayfa açılışı onu yoklamaz, sonucunu tek istekle geri okur.
      expect(readPendingExternalSearch("l:l1")).toEqual({
        searchId: "s-1",
        since,
        mode: "replace",
        scopes: null,
        items: ["Rulman 6204", "Keçe"],
        region: "Ege",
        finished: true,
      });
      expect(h.resume).toHaveBeenCalledTimes(1);
      expect(h.external).toHaveBeenCalledTimes(1);
      expect(h.finished).not.toHaveBeenCalled();
    });

    it("depoda kimlik + BOŞ önbellek: pencere kapalıyken biten aramanın sonucu yeniden açılışta oradadır; sayfadaki iki pencere örneği tek kez izler", async () => {
      savePendingExternalSearch("l:l1", pending());
      const search = takeover();
      const view = (open: boolean) => (
        <>
          <SupplierDiscoveryModal isOpen={false} onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />
          <SupplierDiscoveryModal isOpen={open} onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />
        </>
      );
      const { rerender } = render(view(false));
      await waitFor(() => expect(h.resume).toHaveBeenCalledTimes(1));
      expect(h.resume.mock.calls[0][0]).toBe("s-9");
      await search.resolve(found([cand("Kapalıyken Gelen A.Ş.", "info@kapaliyken.com")]));
      expect(h.toast.success).toHaveBeenCalledTimes(1);
      expect(h.toast.success).toHaveBeenCalledWith("Web araması tamamlandı — sonuçları görmek için pencereyi yeniden açın");
      rerender(view(true));
      expect(screen.getByText("Kapalıyken Gelen A.Ş.")).toBeInTheDocument();
      expect(h.resume).toHaveBeenCalledTimes(1);
      expect(h.external).not.toHaveBeenCalled();
      // Kayıt durur, bitti diye işaretlidir (AS-1).
      expect(readPendingExternalSearch("l:l1")).toMatchObject({ searchId: "s-9", finished: true });
    });

    it.each([
      ["sunucuda düştü", new ExternalSearchError("FAILED", { statusCode: 503, serverMessage: "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin." }), "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin."],
      ["kimlik bilinmiyor (404)", new ExternalSearchError("INTERRUPTED", { statusCode: 404 }), "Web araması yarıda kesildi — yeniden arayın"],
      ["süre doldu", new ExternalSearchError("TIMED_OUT"), "Web araması beklenenden uzun sürdü ve sonuç alınamadı — yeniden arayın"],
    ])("devralınan arama sonuçsuz biterse (%s) kayıt silinir: mesaj gövdede, 'Yeniden ara' YENİ arama başlatır", async (_name, error, message) => {
      savePendingExternalSearch("l:l1", pending());
      h.resume.mockReset().mockRejectedValueOnce(error);
      render(listingModal());
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
      expect(await screen.findByText("Baret A.Ş.")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(1);
      expect(h.resume).toHaveBeenCalledTimes(1);
    });

    it("bu sayfada başlayan aramanın hatası da kaydı siler (kimlik verildikten sonra düşen arama)", async () => {
      h.external.mockImplementationOnce(async (_input: unknown, options: ExternalSearchOptions) => {
        options.onStarted?.("s-2");
        expect(readPendingExternalSearch("l:l1")?.searchId).toBe("s-2");
        throw new ExternalSearchError("FAILED", { statusCode: 503 });
      });
      render(listingModal());
      openWebTab();
      clickSearch();
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY)).toBeNull();
    });

    it("yalnız eksiği arayan arama da yenilemeyi aşar: kip ve geçişler kayıtta, devralınan yoklama aynı aramadır", async () => {
      h.external
        .mockReset()
        .mockResolvedValueOnce(partial([cand("Yerli Rulman A.Ş.", "satis@yerlirulman.com")], { ABROAD: "TIMEOUT" }))
        .mockReturnValueOnce(new Promise(() => {}));
      const first = render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
      act(() => optionsOf(1).onStarted?.("s-3"));
      expect(readPendingExternalSearch("l:l1")).toMatchObject({ searchId: "s-3", mode: "merge", scopes: ["ABROAD"] });

      reloadPage(first);
      const search = takeover();
      render(listingModal());
      await waitFor(() => expect(h.resume).toHaveBeenCalledTimes(1));
      expect(h.resume.mock.calls[0][0]).toBe("s-3");
      expect(sessionOf("l1")).toMatchObject({ searchMode: "merge", searchScopes: ["ABROAD"] });
      await search.resolve(partial([cand("Yabancı Rulman GmbH", "sales@yabanci.de", { country: "DE" })]));
      expect(screen.getByText("Yabancı Rulman GmbH")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(2);
    });

    it("süresi geçmiş kayıt (sunucu sonucu unutmuştur) ve başka talebin kaydı devralınmaz: pencere boşta, 'Web'de Ara' açık", async () => {
      savePendingExternalSearch("l:l1", pending({ since: Date.now() - PENDING_EXTERNAL_SEARCH_KEEP_MS }));
      savePendingExternalSearch("l:l2", pending({ searchId: "s-other" }));
      render(listingModal());
      openWebTab();
      expect(screen.getByRole("button", { name: "Web'de Ara" })).toBeEnabled();
      expect(screen.queryByRole("timer")).toBeNull();
      expect(h.resume).not.toHaveBeenCalled();
      // Süresi geçen kayıt depodan da düşer; öteki talebinki durur.
      expect(JSON.parse(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY) ?? "{}").searches).toEqual({
        "l:l2": expect.objectContaining({ searchId: "s-other" }),
      });
    });

    it("bu sayfada SÜREN arama depodaki kayıttan ikinci kez devralınmaz; silinen oturumun (çıkış) kimliği depoya yazılmaz", async () => {
      deferredSearch();
      const first = render(listingModal());
      openWebTab();
      clickSearch();
      act(() => optionsOf(0).onStarted?.("s-1"));
      // Sayfa içi gezinme: önbellek ve döngü yaşıyor, pencere örneği yeni.
      first.unmount();
      const again = render(listingModal());
      expect(screen.getByRole("status")).toHaveTextContent("Web'de aranıyor");
      expect(h.resume).not.toHaveBeenCalled();
      again.unmount();

      // Çıkış: önbellek silinir (depo `clearTenantSessionData` ile ayrıca silinir).
      sessionStorage.clear();
      act(() => {
        queryClient.clear();
      });
      act(() => optionsOf(0).onStarted?.("s-1"));
      expect(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY)).toBeNull();
    });
  });

  describe("N4 — sunucunun ham varsayılan metni basılmaz", () => {
    it("işlenmemiş 500 ('Internal server error'): hata kutusunda pencerenin çevrilmiş yedeği; sunucunun KENDİ metni olan 5xx olduğu gibi", async () => {
      h.external.mockRejectedValueOnce(raw500);
      render(listingModal());
      openWebTab();
      clickSearch();
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Web araması başarısız — tekrar deneyin");
      expect(screen.queryByText(/Internal server error/i)).toBeNull();
      expect(h.toast.error).not.toHaveBeenCalled();

      // Başlamış aramanın sunucuda düşmesi de aynı ham metni taşıyabilir.
      h.external.mockRejectedValueOnce(
        new ExternalSearchError("FAILED", { statusCode: 500, serverMessage: "Internal server error" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
      await waitFor(() => expect(h.external).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole("alert")).toHaveTextContent("Web araması başarısız — tekrar deneyin");
      expect(screen.queryByText(/Internal server error/i)).toBeNull();

      // Mesajsız fırlatılan 5xx'in durum adı da ham varsayılandır.
      for (const [status, message] of [
        [502, "Bad Gateway"],
        [503, "Service Unavailable"],
        [504, "Gateway Timeout"],
      ] as const) {
        const calls = h.external.mock.calls.length;
        h.external.mockRejectedValueOnce({ isAxiosError: true, response: { status, data: { statusCode: status, message } } });
        fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
        await waitFor(() => expect(h.external).toHaveBeenCalledTimes(calls + 1));
        expect(await screen.findByRole("alert")).toHaveTextContent("Web araması başarısız — tekrar deneyin");
        expect(screen.queryByText(message)).toBeNull();
      }

      // Sunucunun kullanıcı için yazdığı 5xx metni süzülmez.
      h.external.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 502, data: { statusCode: 502, message: "AI sağlayıcısı hata döndürdü — lütfen tekrar deneyin." } },
      });
      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
      expect(await screen.findByText("AI sağlayıcısı hata döndürdü — lütfen tekrar deneyin.")).toBeInTheDocument();
    });

    it("pencere kapalıyken düşen aramanın toast'ı da ham metni taşımaz", async () => {
      const search = deferredSearch();
      const { rerender } = render(listingModal());
      openWebTab();
      clickSearch();
      rerender(listingModal({ isOpen: false }));
      await search.reject(raw500);
      expect(h.toast.error).toHaveBeenCalledTimes(1);
      expect(h.toast.error).toHaveBeenCalledWith("Web araması başarısız — tekrar deneyin");
    });

    it("platform önerileri ve davet hatalarında da: ham metin yerine pencerenin kendi metni", async () => {
      h.discovery.mockRejectedValueOnce(raw500);
      const { rerender } = render(listingModal());
      expect(await screen.findByRole("alert")).toHaveTextContent("Öneriler yüklenemedi — tekrar deneyin");
      expect(screen.queryByText(/Internal server error/i)).toBeNull();

      // Üye daveti ve e-posta daveti gönderimi.
      h.discovery.mockResolvedValue([
        { companyId: "co1", name: "Bağlantı AŞ", city: null, rothernId: "R1", matchedCategories: [], strongMatch: true, matchedItems: [], connectionStatus: "NONE", alreadyInvited: false },
      ]);
      rerender(listingModal({ isOpen: false }));
      rerender(listingModal());
      h.inviteMembers.mockRejectedValueOnce(raw500);
      fireEvent.click(await screen.findByRole("button", { name: "Talebe davet et" }));
      await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Davet gönderilemedi"));

      await searchWeb();
      h.sendExternal.mockRejectedValueOnce({ isAxiosError: true, response: { status: 502, data: { message: "Bad Gateway" } } });
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (1)" }));
      await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Davetler gönderilemedi"));
      expect(h.toast.error).not.toHaveBeenCalledWith("Internal server error");
      expect(h.toast.error).not.toHaveBeenCalledWith("Bad Gateway");
    });
  });

  describe("N2 — Platformda: toplu davet yalnız güçlü eşleşenlere", () => {
    const member = (companyId: string, name: string, over: Row = {}): Row => ({
      companyId,
      name,
      city: null,
      rothernId: `R-${companyId}`,
      matchedCategories: [],
      strongMatch: false,
      matchedItems: [],
      connectionStatus: "NONE",
      alreadyInvited: false,
      ...over,
    });
    const names = (group: HTMLElement) =>
      within(group)
        .getAllByRole("listitem")
        .map((li) => li.querySelector("p > span")?.textContent);

    it("güçlü eşleşenler önce ve ayrı grupta, toplu davet YALNIZ onlara; yalnız aynı sektörde olanlar ayrı başlık + açıklamayla, tek tek", async () => {
      // Sunucu sırası puana göredir: güçlü olmayan üye güçlünün önünde gelebilir.
      h.discovery.mockResolvedValue([
        member("s1", "Sektör Bir AŞ", { matchedCategories: ["Makine"] }),
        member("g1", "Güçlü Bir AŞ", { strongMatch: true, matchedItems: [1] }),
        member("s2", "Sektör İki Ltd"),
        member("g2", "Güçlü İki AŞ", { strongMatch: true }),
        member("g3", "Güçlü Davetli AŞ", { strongMatch: true, alreadyInvited: true }),
      ]);
      h.inviteMembers.mockImplementation(async ({ companyIds }: { companyIds: string[] }) =>
        companyIds.map((companyId) => ({ companyId, status: "INVITED" })),
      );
      render(listingModal());
      const strong = await screen.findByRole("region", { name: "Güçlü eşleşenler" });
      const sector = screen.getByRole("region", { name: "Aynı sektörde" });
      expect(names(strong)).toEqual(["Güçlü Bir AŞ", "Güçlü İki AŞ", "Güçlü Davetli AŞ"]);
      expect(names(sector)).toEqual(["Sektör Bir AŞ", "Sektör İki Ltd"]);
      expect(strong.compareDocumentPosition(sector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(strong).getByRole("heading")).toHaveTextContent("Güçlü eşleşenler · 3");
      expect(within(sector).getByRole("heading")).toHaveTextContent("Aynı sektörde · 2");
      expect(
        within(sector).getByText(
          "Bu üyeler benzer alanda faaliyet gösteriyor; talebinizdeki kalemleri sattıkları doğrulanmadı. Uygun gördüklerinizi tek tek davet edin.",
        ),
      ).toBeInTheDocument();
      // Rozet yalnız güçlü grubun satırlarında.
      expect(within(strong).getAllByText("Güçlü eşleşme")).toHaveLength(3);
      expect(within(sector).queryByText("Güçlü eşleşme")).toBeNull();

      // Toplu eylem: yalnız davet edilebilir GÜÇLÜ eşleşenler (2); sektör grubunda yok.
      const bulk = within(strong).getByRole("button", { name: "Güçlü eşleşenleri davet et (2)" });
      expect(screen.queryByRole("button", { name: /Hepsini/ })).toBeNull();
      expect(within(sector).getAllByRole("button").map((b) => b.textContent)).toEqual(["Talebe davet et", "Talebe davet et"]);
      fireEvent.click(bulk);
      await waitFor(() => expect(h.inviteMembers).toHaveBeenCalledWith({ listingId: "l1", companyIds: ["g1", "g2"] }));
      expect(await within(strong).findAllByText("Talebe davetli")).toHaveLength(3);
      // Sektör grubundaki üyeler davet EDİLMEDİ; tek tek davet edilebilir.
      expect(within(sector).queryByText("Talebe davetli")).toBeNull();
      h.inviteMembers.mockClear();
      fireEvent.click(within(sector).getAllByRole("button", { name: "Talebe davet et" })[1]!);
      await waitFor(() => expect(h.inviteMembers).toHaveBeenCalledWith({ listingId: "l1", companyIds: ["s2"] }));
    });

    it("yalnız aynı sektörde üyeler varsa (canlı taleplerdeki durum) toplu davet düğmesi HİÇ çizilmez", async () => {
      h.discovery.mockResolvedValue([
        member("s1", "Sektör Bir AŞ"),
        member("s2", "Sektör İki Ltd"),
        member("s3", "Sektör Üç AŞ"),
      ]);
      render(listingModal());
      const sector = await screen.findByRole("region", { name: "Aynı sektörde" });
      expect(screen.queryByRole("region", { name: "Güçlü eşleşenler" })).toBeNull();
      expect(within(sector).getAllByRole("button", { name: "Talebe davet et" })).toHaveLength(3);
      // Pencerede toplu davet eylemi yok (sayı taşıyan davet düğmesi).
      expect(screen.queryByRole("button", { name: /davet et \(\d+\)/i })).toBeNull();
      expect(h.inviteMembers).not.toHaveBeenCalled();
    });

    it("tek güçlü eşleşen: toplu düğme yok (satırın kendi düğmesi yeter); yalnız güçlü varsa sektör grubu çizilmez", async () => {
      h.discovery.mockResolvedValue([member("g1", "Güçlü Bir AŞ", { strongMatch: true })]);
      render(listingModal());
      const strong = await screen.findByRole("region", { name: "Güçlü eşleşenler" });
      expect(within(strong).getAllByRole("button").map((b) => b.textContent)).toEqual(["Talebe davet et"]);
      expect(screen.queryByRole("region", { name: "Aynı sektörde" })).toBeNull();
    });

    it("grup metinleri üç dilde", async () => {
      const texts = await Promise.all(
        (["tr", "en", "ru"] as const).map(async (locale) => {
          const t = await translator(locale);
          return [t("grupGucluEslesenler"), t("gucluEslesenleriDavetEt", { n: 6 }), t("grupAyniSektorde")];
        }),
      );
      expect(texts).toEqual([
        ["Güçlü eşleşenler", "Güçlü eşleşenleri davet et (6)", "Aynı sektörde"],
        // EN terimi "industry" (terim listesi; katalogda "sector" kullanılmaz — R6-05).
        ["Strong matches", "Invite strong matches (6)", "In the same industry"],
        ["С высоким соответствием", "Пригласить всех с высоким соответствием (6)", "Из той же отрасли"],
      ]);
      expect((await translator("en"))("grupAyniSektorde")).not.toMatch(/sector/i);
      expect((await translator("en"))("ayniSektordeAciklama")).toMatch(/one by one/);
      expect((await translator("ru"))("ayniSektordeAciklama")).toMatch(/Вашего запроса/);
    });
  });

  describe("N5 — 390 px", () => {
    it("adres alanı simgesini İÇİNDE taşır: simge sarmalanan satırın ayrı öğesi değildir (tek başına satır tutmaz), dil seçici alanın yanında / altında", async () => {
      render(listingModal());
      await searchWeb();
      const field = screen.getByLabelText("Baret A.Ş. e-posta adresi");
      const box = field.parentElement as HTMLElement;
      // Simge alanla AYNI kutuda, alanın üstünde konumlu; alan kutuyu doldurur ve simgeye yer açar.
      const icon = box.querySelector("svg") as SVGElement;
      expect(icon).not.toBeNull();
      expect(own(icon)).toContain("absolute");
      expect(own(icon)).toContain("pointer-events-none");
      expect(own(box)).toContain("relative");
      expect(own(box)).toContain("min-w-0");
      expect(own(box)).not.toContain("flex-wrap");
      expect(own(field)).toContain("w-full");
      expect(own(field)).toContain("pl-8");
      // Sarmalanan satırın öğeleri: adres kutusu + dil seçici (simge ayrı öğe DEĞİL).
      const line = box.parentElement as HTMLElement;
      expect(own(line)).toContain("flex-wrap");
      expect(Array.from(line.children).map((el) => el.tagName.toLowerCase())).toEqual(["div", "select"]);
      expect(line.children[1]).toBe(screen.getByLabelText("Baret A.Ş. için davet dili"));
      // Kutu satırı paylaşabilecek kadar daralır (dil seçici sığarsa yanında kalır).
      expect(own(box).some((c) => c.startsWith("flex-[1_1_"))).toBe(true);
    });

    it("bölge yer tutucusu kısa (kesilmez); erişilebilir ad uzun açıklamayı taşır — üç dilde", async () => {
      render(listingModal());
      openWebTab();
      const region = screen.getByRole("textbox", { name: "Bölge (ops. — örn. İstanbul, Ege)" });
      expect(region).toHaveAttribute("placeholder", "Bölge (örn. İstanbul)");
      for (const locale of ["tr", "en", "ru"] as const) {
        const t = await translator(locale);
        // 390 px'te arama düğmesinin yanında kalan alana sığan uzunluk.
        expect(t("bolgeYerTutucu").length).toBeLessThanOrEqual(22);
        expect(t("bolgeYerTutucu").length).toBeLessThan(t("bolgeOpsOrnIstanbulEge").length);
      }
    });

    const sendAll = async (results: Row[]) => {
      h.external.mockResolvedValue(found(results.map((r, i) => cand(`Firma ${i + 1}`, r.email as string))));
      h.sendExternal.mockResolvedValue(results);
      const view = render(listingModal());
      await searchWeb("Firma 1");
      fireEvent.click(screen.getByRole("button", { name: "Tümünü seç" }));
      return view;
    };
    const RESULTS: Row[] = [
      { email: "a@f1.com", status: "QUEUED", sendAfter: "2026-10-12T06:38:00.000Z" },
      { email: "b@f2.com", status: "QUEUED" },
      { email: "c@f3.com", status: "SENT" },
      { email: "d@f4.com", status: "FAILED", reason: "Gönderilemedi" },
      { email: "e@f5.com", status: "DAILY_LIMIT", reason: "Günlük dış davet limitine ulaşıldı" },
      { email: "f@f6.com", status: "SUPPRESSED", reason: "Adres e-posta almıyor" },
    ];
    const SUMMARY = "2 davet sıraya alındı · 1 davet gönderildi · 3 adrese gönderilemedi (nedeni satırında)";

    it("gönderimden sonra toast YIĞINI yok (başlık ve kapat düğmesi örtülmez): sonuç gönder şeridinde tek özet satırı, nedenler satırlarda", async () => {
      await sendAll(RESULTS);
      const send = screen.getByRole("button", { name: "Davet E-postası Gönder (6)" });
      fireEvent.click(send);
      const summary = await screen.findByText(SUMMARY);
      expect(summary).toHaveAttribute("role", "status");
      // Özet, düğmeyle aynı şeritte (pencerenin altında — başlığın üstünde değil).
      expect(send.parentElement).toContainElement(summary);
      for (const kind of ["success", "info", "warning", "error"] as const) expect(h.toast[kind]).not.toHaveBeenCalled();
      // Her satır kendi sonucunu yazar.
      const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
      expect(within(row("Firma 1")).getByText("Sıraya alındı · planlanan gönderim: 12 Eki 2026 09:38")).toBeInTheDocument();
      expect(within(row("Firma 3")).getByText("Gönderildi")).toBeInTheDocument();
      expect(within(row("Firma 4")).getByText("Gönderilemedi")).toBeInTheDocument();
      expect(within(row("Firma 5")).getByText("Günlük limit doldu")).toBeInTheDocument();
      expect(within(row("Firma 6")).getByText("Adres e-posta almıyor")).toBeInTheDocument();
      // Uzun durum metni dar ekranda dil seçicinin YANINDA kalan genişlikte sarar
      // (kendi satırına inip adres bloğunu uzatmaz); geniş ekranda eskisi gibi.
      for (const status of [
        within(row("Firma 1")).getByText("Sıraya alındı · planlanan gönderim: 12 Eki 2026 09:38"),
        within(row("Firma 5")).getByText("Günlük limit doldu"),
      ]) {
        expect(own(status)).toEqual(expect.arrayContaining(["min-w-0", "flex-[1_1_8rem]", "sm:flex-initial"]));
        // Dil seçiciyle aynı sarmalanan satırın öğesi.
        const line = status.parentElement as HTMLElement;
        expect(own(line)).toContain("flex-wrap");
        expect(Array.from(line.children).some((el) => el.tagName === "SELECT")).toBe(true);
      }
      // Özet son gönderime aittir: yeni arama sonucu listeyi yenileyince silinir.
      h.external.mockResolvedValue(found([cand("Yeni Aday A.Ş.", "info@yeniaday.com")]));
      clickSearch();
      await screen.findByText("Yeni Aday A.Ş.");
      expect(screen.queryByText(SUMMARY)).toBeNull();
    });

    it("hiçbiri gönderilemediyse özet yalnız onu söyler; sıfır kalemler yazılmaz", async () => {
      await sendAll([RESULTS[4]!]);
      fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (1)" }));
      expect(await screen.findByText("1 adrese gönderilemedi (nedeni satırında)")).toBeInTheDocument();
      expect(h.toast.warning).not.toHaveBeenCalled();
    });

    it("yanıt gelmeden pencere kapandıysa sonuç TEK toast olarak verilir; yeniden açılışta özet şeritte", async () => {
      let resolve: (v: unknown) => void = () => {};
      const { rerender } = await sendAll(RESULTS);
      h.sendExternal.mockReturnValueOnce(new Promise((res) => (resolve = res)));
      fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (6)" }));
      rerender(listingModal({ isOpen: false }));
      await act(async () => {
        resolve(RESULTS);
      });
      expect(h.toast.success).toHaveBeenCalledTimes(1);
      expect(h.toast.success).toHaveBeenCalledWith(SUMMARY);
      for (const kind of ["info", "warning", "error"] as const) expect(h.toast[kind]).not.toHaveBeenCalled();
      rerender(listingModal());
      expect(screen.getByText(SUMMARY)).toBeInTheDocument();
    });

    it("özet metinleri üç dilde (çoğul biçimleriyle)", async () => {
      const line = async (locale: "tr" | "en" | "ru", n: number) => {
        const t = await translator(locale);
        return [t("ozetSirayaAlindi", { n }), t("ozetGonderildi", { n }), t("ozetGonderilemedi", { n })];
      };
      expect(await line("tr", 2)).toEqual(["2 davet sıraya alındı", "2 davet gönderildi", "2 adrese gönderilemedi (nedeni satırında)"]);
      expect(await line("en", 1)).toEqual([
        "1 invitation queued",
        "1 invitation sent",
        "1 address could not be invited (see its row for the reason)",
      ]);
      expect(await line("en", 3)).toEqual([
        "3 invitations queued",
        "3 invitations sent",
        "3 addresses could not be invited (see their rows for the reason)",
      ]);
      expect(await line("ru", 1)).toEqual([
        "1 приглашение поставлено в очередь",
        "1 приглашение отправлено",
        "На 1 адрес приглашение не отправлено (причина указана в строке)",
      ]);
      expect(await line("ru", 3)).toEqual([
        "3 приглашения поставлены в очередь",
        "3 приглашения отправлены",
        "На 3 адреса приглашения не отправлены (причина указана в строке)",
      ]);
      expect(await line("ru", 5)).toEqual([
        "5 приглашений поставлено в очередь",
        "5 приглашений отправлено",
        "На 5 адресов приглашения не отправлены (причина указана в строке)",
      ]);
    });
  });
});

/**
 * SON CANLI KONTROL (2026-10-10) — AS-1 … AS-4:
 *  - AS-1 biten (ücretli) aramanın sonucu F5'te kayboluyordu: kayıt sonuç gelince
 *    siliniyordu, oysa sunucu sonucu 15 dakika saklıyor.
 *  - AS-2 davet gönderimi 5xx alınca iki hata toast'ı.
 *  - AS-3 başka sayfada çıkan "arama tamamlandı / düştü" toast'ı hangi talebin
 *    araması olduğunu söylemiyordu.
 *  - AS-4 süren aramaya sonradan katılan sekmenin sayacı sıfırdan başlıyordu;
 *    dönen simge sarmalanan durum metninin sol kenarında kalıyordu.
 */
describe("SupplierDiscoveryModal — son canlı kontrol (2026-10-10)", () => {
  const SESSION_ROOT = "supplier-discovery-session";
  const sessionOf = (listingId: string) =>
    queryClient.getQueryData([SESSION_ROOT, `l:${listingId}`]) as Record<string, unknown> | undefined;
  const optionsOf = (call: number) => h.external.mock.calls[call][1] as ExternalSearchOptions;
  const raw500 = { isAxiosError: true, response: { status: 500, data: { statusCode: 500, message: "Internal server error" } } };
  const own = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
  const searchButton = () => screen.getByRole("button", { name: "Web'de Ara" });
  /** F5: sayfanın belleği (önbellek + arama döngüsü) gider, sekme deposu kalır. */
  const reloadPage = (view: { unmount: () => void }) => {
    view.unmount();
    queryClient.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  };
  /** Önceki sayfadan kalan kayıt: arama SONUÇLA bitti, sonucu sunucuda duruyor. */
  const ended = (over: Record<string, unknown> = {}) => ({
    searchId: "s-9",
    since: Date.now() - 120_000,
    mode: "replace" as const,
    scopes: null,
    items: ["Rulman 6204", "Keçe"],
    region: "Ege",
    finished: true,
    ...over,
  });
  /** Bitmiş aramanın sonucunu geri okuyan çağrı — elle çözülür. */
  const deferredRead = () => {
    let resolve: (v: unknown) => void = () => {};
    h.finished.mockReset().mockReturnValueOnce(new Promise((res) => (resolve = res)));
    return { resolve: (v: unknown) => act(async () => resolve(v)) };
  };

  describe("AS-1 — biten aramanın sonucu sayfa yenilemeyi aşar", () => {
    it("sonuç gelince kayıt SİLİNMEZ; F5 sonrası sunucuya TEK istek atılır ve liste geri gelir — yeni arama da yoklama da yok", async () => {
      h.detail = { data: { categoryIds: ["39121600"], items: [{ name: "Rulman 6204" }, { name: "Keçe" }] }, isLoading: false };
      const companies = [cand("Baret A.Ş.", "info@baret.com", { matchedItems: [2] }), cand("Kask Ltd.", "satis@kask.com")];
      const search = deferredSearch();
      const first = render(listingModal());
      openWebTab();
      clickSearch();
      act(() => optionsOf(0).onStarted?.("s-1"));
      await search.resolve(found(companies));
      expect(screen.getByText("Baret A.Ş.")).toBeInTheDocument();
      // Eskiden burada `null`dı: yenilenen sayfanın soracak kimliği kalmıyordu.
      expect(readPendingExternalSearch("l:l1")).toMatchObject({ searchId: "s-1", finished: true, items: ["Rulman 6204", "Keçe"] });

      reloadPage(first);
      const read = deferredRead();
      // Sayfa açılır, pencere KAPALI: sonuç yine de geri okunur.
      const second = render(listingModal({ isOpen: false }));
      await waitFor(() => expect(h.finished).toHaveBeenCalledTimes(1));
      expect(h.finished).toHaveBeenCalledWith("s-1");
      expect(h.resume).not.toHaveBeenCalled();
      expect(h.external).toHaveBeenCalledTimes(1);

      // Yanıt gelmeden pencere açılırsa: web sekmesi, "aranıyor" DEMEZ, yeni arama başlatılamaz.
      second.rerender(listingModal());
      expect(screen.getByRole("tab", { name: /Web'de Ara/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.queryByRole("timer")).toBeNull();
      expect(screen.queryByText(/Web'de aranıyor/)).toBeNull();
      expect(searchButton()).toBeDisabled();
      fireEvent.click(searchButton());
      expect(h.external).toHaveBeenCalledTimes(1);

      await read.resolve(found(companies));
      const row = screen.getByText("Baret A.Ş.").closest("li") as HTMLElement;
      // Karşılanan kalem, aramaya GİDEN kalem listesinden (kayıtta saklı) çözülür.
      expect(within(row).getByText("Karşıladığı kalemler (1/2): Keçe")).toBeInTheDocument();
      expect(screen.getByText("Kask Ltd.")).toBeInTheDocument();
      expect(screen.getByDisplayValue("info@baret.com")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Bölge (ops. — örn. İstanbul, Ege)" })).toHaveValue("");
      expect(searchButton()).toBeEnabled();
      expect(screen.queryByRole("alert")).toBeNull();
      for (const kind of ["success", "error", "info", "warning"] as const) expect(h.toast[kind]).not.toHaveBeenCalled();
      // İkinci yenileme de aynı sonucu bulur.
      expect(readPendingExternalSearch("l:l1")).toMatchObject({ searchId: "s-1", finished: true });
      expect(h.finished).toHaveBeenCalledTimes(1);
      expect(h.external).toHaveBeenCalledTimes(1);
      expect(h.resume).not.toHaveBeenCalled();
    });

    it("sayfadaki iki pencere örneği (görünür düğme + ⋮ menüsü) TEK istek atar; aranan bölge alana geri gelir", async () => {
      savePendingExternalSearch("l:l1", ended());
      h.finished.mockReset().mockResolvedValue(found([cand("Geri Gelen A.Ş.", "info@gerigelen.com")]));
      const view = (open: boolean) => (
        <>
          <SupplierDiscoveryModal isOpen={false} onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />
          <SupplierDiscoveryModal isOpen={open} onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />
        </>
      );
      const { rerender } = render(view(false));
      await waitFor(() => expect(sessionOf("l1")?.web).toBeTruthy());
      expect(h.finished).toHaveBeenCalledTimes(1);
      expect(h.finished).toHaveBeenCalledWith("s-9");
      rerender(view(true));
      expect(screen.getByText("Geri Gelen A.Ş.")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Bölge (ops. — örn. İstanbul, Ege)" })).toHaveValue("Ege");
      expect(h.toast.success).not.toHaveBeenCalled();
      expect(h.finished).toHaveBeenCalledTimes(1);
    });

    it("sunucu kimliği artık bilmiyorsa kayıt silinir ve web sekmesi BOŞ durumdadır: hata kutusu, 'bulunamadı' ve toast yok; 'Web'de Ara' açık", async () => {
      savePendingExternalSearch("l:l1", ended());
      // Varsayılan: `readFinishedExternalSearch` → null (404 / süresi doldu).
      render(listingModal());
      await waitFor(() => expect(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY)).toBeNull());
      await waitFor(() => expect(searchButton()).toBeEnabled());
      expect(h.finished).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText(/yarıda kesildi/)).toBeNull();
      expect(screen.queryByText("Web aramasında uygun firma bulunamadı")).toBeNull();
      expect(screen.queryByRole("timer")).toBeNull();
      expect(h.toast.error).not.toHaveBeenCalled();
      expect(h.resume).not.toHaveBeenCalled();
      // Boş durumdan yeni arama başlatılabilir.
      clickSearch();
      expect(await screen.findByText("Baret A.Ş.")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(1);
    });

    it("geçici hata (yanıt yok): kayıt DURUR, hata kutusu yok; sonraki bağlanış yeniden sorar ve liste gelir", async () => {
      savePendingExternalSearch("l:l1", ended());
      h.finished
        .mockReset()
        .mockRejectedValueOnce({ isAxiosError: true, response: undefined })
        .mockResolvedValueOnce(found([cand("İkinci Denemede A.Ş.", "info@ikinci.com")]));
      const first = render(listingModal());
      await waitFor(() => expect(searchButton()).toBeEnabled());
      expect(h.finished).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(h.toast.error).not.toHaveBeenCalled();
      expect(readPendingExternalSearch("l:l1")).toMatchObject({ searchId: "s-9", finished: true });
      // Sayfa içi gezinme (önbellek aynı, oturumda sonuç yok): pencere yeniden bağlanır.
      first.unmount();
      render(listingModal());
      expect(await screen.findByText("İkinci Denemede A.Ş.")).toBeInTheDocument();
      expect(h.finished).toHaveBeenCalledTimes(2);
    });

    it("sayfa içi gezinme (oturumda sonuç duruyor): bitmiş kayıt 'aranıyor' KURMAZ, sunucuya sorulmaz", async () => {
      h.external.mockImplementationOnce(async (_input: unknown, options: ExternalSearchOptions) => {
        options.onStarted?.("s-1");
        return found([cand("Baret A.Ş.", "info@baret.com")]);
      });
      const first = render(listingModal());
      await searchWeb();
      expect(readPendingExternalSearch("l:l1")).toMatchObject({ searchId: "s-1", finished: true });
      first.unmount();
      render(listingModal());
      expect(screen.getByText("Baret A.Ş.")).toBeInTheDocument();
      expect(screen.queryByRole("timer")).toBeNull();
      expect(searchButton()).toBeEnabled();
      expect(sessionOf("l1")).toMatchObject({ searchSince: null, restoring: false });
      expect(h.finished).not.toHaveBeenCalled();
      expect(h.resume).not.toHaveBeenCalled();
    });

    it("kayıt TEK aramayı tutar: kimlik alamadan düşen yeni arama bitmiş kaydı silmez; yeni arama kimlik alınca yerine geçer; üstüne EKLEYEN arama bitince kayıt silinir", async () => {
      h.external
        .mockReset()
        // 1) Kısmi sonuç (yurt dışı yanıt vermedi).
        .mockImplementationOnce(async (_input: unknown, options: ExternalSearchOptions) => {
          options.onStarted?.("s-1");
          return partial([cand("Yerli Rulman A.Ş.", "satis@yerlirulman.com")], { ABROAD: "TIMEOUT" });
        })
        // 2) Ana düğmenin yeni araması kimlik ALAMADAN düşer (bütçe reddi başlatma isteğinin kendi hatasıdır).
        .mockRejectedValueOnce(budgetRefusal("Firmanızın günlük AI kullanım sınırı doldu."))
        // 3) "Yeniden ara": eldekinin üstüne ekleyen arama kimlik alır ve biter.
        .mockImplementationOnce(async (_input: unknown, options: ExternalSearchOptions) => {
          options.onStarted?.("s-2");
          const running = readPendingExternalSearch("l:l1");
          expect(running).toMatchObject({ searchId: "s-2", mode: "merge" });
          expect(running?.finished).toBeUndefined();
          return partial([cand("Yabancı Rulman GmbH", "sales@yabanci.de", { country: "DE" })]);
        });
      render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      expect(readPendingExternalSearch("l:l1")).toMatchObject({ searchId: "s-1", finished: true });

      clickSearch();
      expect(await screen.findByRole("alert")).toHaveTextContent("Firmanızın günlük AI kullanım sınırı doldu.");
      // Önceki aramanın sonucu ekranda duruyor → kaydı da durur (F5 onu geri getirir).
      expect(screen.getByText("Yerli Rulman A.Ş.")).toBeInTheDocument();
      expect(readPendingExternalSearch("l:l1")).toMatchObject({ searchId: "s-1", finished: true });

      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
      expect(await screen.findByText("Yabancı Rulman GmbH")).toBeInTheDocument();
      expect(screen.getByText("Yerli Rulman A.Ş.")).toBeInTheDocument();
      expect(h.external).toHaveBeenCalledTimes(3);
      // Liste artık iki aramanın birleşimi: tek kimlikten kurulamaz → kayıt yok.
      expect(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY)).toBeNull();
    });
  });

  describe("AS-2 — davet gönderimi düşerse TEK hata mesajı", () => {
    it("pencere iki davet kancasını genel hata toast'ı KAPALI çağırır (mesaj pencerenin kendi toast'ıdır)", () => {
      render(listingModal());
      expect(h.hookOptions.sendExternal).toEqual({ skipErrorToast: true });
      expect(h.hookOptions.inviteMembers).toEqual({ skipErrorToast: true });
    });

    it("e-posta daveti ve üye daveti 500: her biri için TEK toast, pencerenin metniyle", async () => {
      h.discovery.mockResolvedValue([
        { companyId: "co1", name: "Bağlantı AŞ", city: null, rothernId: "R1", matchedCategories: [], strongMatch: true, matchedItems: [], connectionStatus: "NONE", alreadyInvited: false },
      ]);
      render(listingModal());
      h.inviteMembers.mockRejectedValueOnce(raw500);
      fireEvent.click(await screen.findByRole("button", { name: "Talebe davet et" }));
      await waitFor(() => expect(h.toast.error).toHaveBeenCalledTimes(1));
      expect(h.toast.error).toHaveBeenLastCalledWith("Davet gönderilemedi");

      await searchWeb();
      h.sendExternal.mockRejectedValueOnce(raw500);
      fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
      fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (1)" }));
      await waitFor(() => expect(h.toast.error).toHaveBeenCalledTimes(2));
      expect(h.toast.error).toHaveBeenLastCalledWith("Davetler gönderilemedi");
      // Seçim durur: kullanıcı yeniden deneyebilir.
      expect(screen.getByLabelText("Baret A.Ş. seç")).toBeChecked();
    });

    it("bağlantı daveti (talepsiz açılış; kancası genel toast'ı kapatmaz): 5xx / yanıtsız hatada pencere İKİNCİ toast'ı basmaz; 4xx'te sunucunun metni tek toast", async () => {
      h.discovery.mockResolvedValue([
        { companyId: "co1", name: "Bağlantı AŞ", city: null, rothernId: "R1", matchedCategories: [], strongMatch: true, matchedItems: [], connectionStatus: "NONE" },
      ]);
      render(<SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} />);
      const button = await screen.findByRole("button", { name: "Bağlantı daveti gönder" });
      let calls = 0;
      for (const error of [raw500, { isAxiosError: true, response: undefined }]) {
        h.inviteConnection.mockRejectedValueOnce(error);
        fireEvent.click(button);
        calls += 1;
        await waitFor(() => expect(h.inviteConnection).toHaveBeenCalledTimes(calls));
        await waitFor(() => expect(button).toBeEnabled());
      }
      expect(h.inviteConnection).toHaveBeenCalledWith("R1");
      // Genel istemci bu hatayı zaten söyledi ("Sunucu hatası…" / "Sunucuya ulaşılamadı").
      expect(h.toast.error).not.toHaveBeenCalled();

      h.inviteConnection.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 422, data: { message: "Bu firmaya bağlantı daveti gönderilemiyor" } },
      });
      // 422'yi genel istemci de basar; aynı metin tekilleşir (`toast-dedupe`).
      fireEvent.click(button);
      await waitFor(() => expect(h.toast.error).toHaveBeenCalledTimes(1));
      expect(h.toast.error).toHaveBeenCalledWith("Bu firmaya bağlantı daveti gönderilemiyor");
    });
  });

  describe("AS-3 — pencere kapalıyken gelen toast hangi talebin araması olduğunu söyler", () => {
    const DONE_TEXT = "Web araması tamamlandı — sonuçları görmek için pencereyi yeniden açın";
    const listing = (over: Record<string, unknown> = {}) => ({
      data: { number: "ROT-000831", title: "Rulman alımı", categoryIds: ["39121600"], items: [{ name: "Rulman 6204" }], ...over },
      isLoading: false,
    });
    /** Arama başlar, pencere kapanır (alıcı başka sayfaya geçer; arama sürer). */
    const searchThenClose = () => {
      const search = deferredSearch();
      const view = render(listingModal());
      openWebTab();
      clickSearch();
      view.rerender(listingModal({ isOpen: false }));
      return search;
    };

    it("tamamlandı: TEK toast, açıklama satırında talep numarası", async () => {
      h.detail = listing();
      const search = searchThenClose();
      await search.resolve(found([cand("Geç Gelen A.Ş.", "info@gecgelen.com")]));
      expect(h.toast.success).toHaveBeenCalledTimes(1);
      expect(h.toast.success).toHaveBeenCalledWith(DONE_TEXT, { description: "Talep: ROT-000831" });
      expect(h.toast.error).not.toHaveBeenCalled();
    });

    it("düştü: TEK toast — hata mesajı + talep numarası", async () => {
      h.detail = listing();
      const search = searchThenClose();
      await search.reject({
        isAxiosError: true,
        response: { status: 503, data: { message: "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin." } },
      });
      expect(h.toast.error).toHaveBeenCalledTimes(1);
      expect(h.toast.error).toHaveBeenCalledWith("AI isteği zaman aşımına uğradı — lütfen tekrar deneyin.", {
        description: "Talep: ROT-000831",
      });
      expect(h.toast.success).not.toHaveBeenCalled();
    });

    it("bütçe reddi (yalnız eksiği arayan arama) pencere kapalıyken: TEK toast — sunucunun metni + talep", async () => {
      const POOL_FULL = "Firmanızın aylık AI bütçesi doldu — AI özellikleri gelecek ay yeniden açılır.";
      h.detail = listing();
      h.external.mockReset().mockResolvedValueOnce(partial([cand("Yerli Rulman A.Ş.", "satis@yerlirulman.com")], { ABROAD: "TIMEOUT" }));
      const view = render(listingModal());
      await searchWeb("Yerli Rulman A.Ş.");
      const retry = deferredSearch();
      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
      view.rerender(listingModal({ isOpen: false }));
      await retry.reject(budgetRefusal(POOL_FULL));
      expect(h.toast.error).toHaveBeenCalledTimes(1);
      expect(h.toast.error).toHaveBeenCalledWith(POOL_FULL, { description: "Talep: ROT-000831" });
    });

    it("numarası olmayan talepte başlık yazılır; uzun başlık kısaltılır", async () => {
      h.detail = listing({ number: null, title: "  Rulman alımı  " });
      const short = searchThenClose();
      await short.resolve(found([]));
      expect(h.toast.success).toHaveBeenLastCalledWith(DONE_TEXT, { description: "Talep: Rulman alımı" });

      queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const title = "Fabrika genişleme projesi için rulman, keçe ve yağlama ekipmanı tedariki — 2026 ikinci yarı";
      h.detail = listing({ number: "", title });
      const long = searchThenClose();
      await long.resolve(found([]));
      const [, options] = h.toast.success.mock.calls.at(-1) as [string, { description: string }];
      // En çok 60 karakter: 59 + "…".
      expect(options.description).toBe("Talep: Fabrika genişleme projesi için rulman, keçe ve yağlama ekip…");
      expect(options.description.length).toBe("Talep: ".length + 60);
    });

    it("devralınan arama (sayfa yenilendi; pencere kapalı, talep detayı pencerenin elinde değil): ad önbellekteki talep detayından", async () => {
      savePendingExternalSearch("l:l1", ended({ finished: undefined, since: Date.now() - 40_000 }));
      let resolve: (v: unknown) => void = () => {};
      h.resume.mockReset().mockReturnValueOnce(new Promise((res) => (resolve = res)));
      render(listingModal({ isOpen: false }));
      await waitFor(() => expect(h.resume).toHaveBeenCalledTimes(1));
      // Talep sayfası detayı SONRADAN yükler (arama devralındığında önbellek boştu).
      queryClient.setQueryData(["company-listings", "detail", "l1"], { id: "l1", number: "ROT-000846", title: "Kablo alımı" });
      await act(async () => {
        resolve(found([cand("Devralınan A.Ş.", "info@devralinan.com")]));
      });
      expect(h.toast.success).toHaveBeenCalledTimes(1);
      expect(h.toast.success).toHaveBeenCalledWith(DONE_TEXT, { description: "Talep: ROT-000846" });
    });

    it("pencere AÇIKKEN (öteki sekmede) talep adı eklenmez: kullanıcı zaten o talebin penceresinde; ad bilinmiyorsa toast adsızdır", async () => {
      h.detail = listing();
      const search = deferredSearch();
      render(listingModal());
      openWebTab();
      clickSearch();
      fireEvent.click(screen.getByRole("tab", { name: "Platformda" }));
      await search.resolve(found([cand("Geç Gelen A.Ş.", "info@gecgelen.com")]));
      expect(h.toast.success).toHaveBeenCalledTimes(1);
      expect(h.toast.success).toHaveBeenCalledWith("Web araması tamamlandı — sonuçlar “Web'de Ara (AI)” sekmesinde");

      // Talepsiz açılış (yayın öncesi form): söylenecek talep yok.
      queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      h.toast.success.mockReset();
      h.detail = { data: undefined, isLoading: false };
      const formSearch = deferredSearch();
      const form = (isOpen: boolean) => (
        <SupplierDiscoveryModal isOpen={isOpen} onClose={() => {}} categoryIds={["31161500"]} itemNames={["Cıvata"]} onCollect={() => {}} />
      );
      const view = render(form(true));
      fireEvent.click(screen.getAllByRole("tab", { name: /Web'de Ara/ }).at(-1) as HTMLElement);
      fireEvent.click(screen.getAllByRole("button", { name: "Web'de Ara" }).at(-1) as HTMLElement);
      view.rerender(form(false));
      await formSearch.resolve(found([]));
      expect(h.toast.success).toHaveBeenCalledTimes(1);
      expect(h.toast.success).toHaveBeenCalledWith(DONE_TEXT);
    });

    it("talep satırı üç dilde", async () => {
      const { createTranslator } = await import("use-intl/core");
      const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
      const lines = (["tr", "en", "ru"] as const).map((locale) => {
        const t = createTranslator({
          locale,
          messages: messagesFor(locale, WEB_NAMESPACES),
          namespace: "web.panel.requests.supplierDiscoveryModal" as never,
          onError: (e) => {
            throw e;
          },
        }) as unknown as (key: string, values?: Record<string, string>) => string;
        return t("aramaninTalebi", { request: "ROT-000831" });
      });
      expect(lines).toEqual(["Talep: ROT-000831", "Request: ROT-000831", "Запрос: ROT-000831"]);
    });
  });

  describe("AS-4 — sonradan katılan sekmenin sayacı; bekleme bloğunun düzeni", () => {
    const timer = () => screen.getByRole("timer");

    it("yoklama yanıtındaki başlangıç anı sayacı GERİYE çeker: katılan sekme sıfırdan saymaz; kayıt da aynı anı taşır", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      const search = deferredSearch();
      render(listingModal());
      openWebTab();
      clickSearch();
      act(() => optionsOf(0).onStarted?.("s-1"));
      const clicked = sessionOf("l1")?.searchSince as number;
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      // Bu sekme 2 saniyedir bekliyor…
      expect(timer()).toHaveTextContent("Geçen süre: 2 sn");
      // …ama arama sunucuda 12 saniye ÖNCE başlamıştı (öteki sekme başlattı; başlatma aynı kimliği döndü).
      act(() => optionsOf(0).onStartedAt?.(clicked - 12_000));
      expect(timer()).toHaveTextContent("Geçen süre: 14 sn");
      expect(sessionOf("l1")?.searchSince).toBe(clicked - 12_000);
      // Yenilenen sayfa da gerçek süreden sürer.
      expect(readPendingExternalSearch("l:l1")).toMatchObject({ searchId: "s-1", since: clicked - 12_000 });
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(timer()).toHaveTextContent("Geçen süre: 15 sn");
      await search.resolve(found([]));
      expect(screen.queryByRole("timer")).toBeNull();
    });

    it("DISC-N2 — başlatma yanıtı aramanın yaşını söylediyse (kimlikten hemen sonra, yoklamadan önce) sayaç hiç '0 sn'de beklemez; kayıt da gerçek başlangıcı taşır", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      const search = deferredSearch();
      render(listingModal());
      openWebTab();
      clickSearch();
      const clicked = sessionOf("l1")?.searchSince as number;
      // Kanca başlatma yanıtını okur: önce kimlik, ardından (aynı anda) başlangıç.
      act(() => {
        optionsOf(0).onStarted?.("s-1");
        optionsOf(0).onStartedAt?.(clicked - 12_000);
      });
      // Zaman hiç ilerlemedi: katılan sekme öteki sekmenin değerinden başlar.
      expect(timer()).toHaveTextContent("Geçen süre: 12 sn");
      expect(readPendingExternalSearch("l:l1")).toMatchObject({ searchId: "s-1", since: clicked - 12_000 });
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(timer()).toHaveTextContent("Geçen süre: 14 sn");
      await search.resolve(found([]));
    });

    it("başlangıç İLERİYE çekilmez (aramayı başlatan sekmede sayaç geri saymaz); saniyenin altındaki fark ve olamayacak kadar eski değer yok sayılır", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      const search = deferredSearch();
      render(listingModal());
      openWebTab();
      clickSearch();
      act(() => optionsOf(0).onStarted?.("s-1"));
      const clicked = sessionOf("l1")?.searchSince as number;
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      for (const startedAt of [clicked + 4_000, clicked, clicked - 400, clicked - 8 * 60_000]) {
        act(() => optionsOf(0).onStartedAt?.(startedAt));
        expect(sessionOf("l1")?.searchSince).toBe(clicked);
        expect(timer()).toHaveTextContent("Geçen süre: 5 sn");
      }
      expect(readPendingExternalSearch("l:l1")?.since).toBe(clicked);
      await search.resolve(found([cand("Baret A.Ş.", "info@baret.com")]));
      // Biten aramadan sonra gelen bildirim hiçbir şeyi değiştirmez (arama yeniden "sürüyor" olmaz).
      act(() => optionsOf(0).onStartedAt?.(clicked - 12_000));
      expect(sessionOf("l1")?.searchSince).toBeNull();
      expect(screen.queryByRole("timer")).toBeNull();
      expect(readPendingExternalSearch("l:l1")).toMatchObject({ since: clicked, finished: true });
    });

    it("devralınan aramada da bildirim dinlenir (yenilenen sayfa / öteki sekme)", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      const since = Date.now() - 6_000;
      savePendingExternalSearch("l:l1", ended({ finished: undefined, since }));
      render(listingModal());
      expect(h.resume).toHaveBeenCalledTimes(1);
      expect(timer()).toHaveTextContent("Geçen süre: 6 sn");
      const options = h.resume.mock.calls[0][1] as ExternalSearchOptions;
      act(() => options.onStartedAt?.(since - 30_000));
      expect(timer()).toHaveTextContent("Geçen süre: 36 sn");
      expect(readPendingExternalSearch("l:l1")?.since).toBe(since - 30_000);
    });

    it("dönen simge ortalanmış durum metninin ÜSTÜNDE durur: metinle aynı satırda değil (sarmalanan metnin sol kenarında kalıyordu)", () => {
      deferredSearch();
      render(listingModal());
      openWebTab();
      clickSearch();
      const status = screen.getByRole("status");
      // Simge durum paragrafının içinde değil; paragraf esnek satır değil.
      expect(status.querySelector("svg")).toBeNull();
      expect(own(status)).not.toContain("flex");
      // Hemen üstünde, kardeş öğe; dekoratif.
      const spinner = status.previousElementSibling as Element;
      expect(spinner.tagName.toLowerCase()).toBe("svg");
      expect(own(spinner)).toContain("animate-spin");
      expect(spinner).toHaveAttribute("aria-hidden", "true");
      // Kap dikey ve ortalı: simge → durum → sayaç → kapatma notu.
      const block = status.parentElement as HTMLElement;
      expect(own(block)).toEqual(expect.arrayContaining(["flex", "flex-col", "items-center", "text-center"]));
      expect(block.firstElementChild).toBe(spinner);
      expect(timer().previousElementSibling).toBe(status);
    });
  });
});
