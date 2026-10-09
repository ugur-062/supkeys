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
  sendExternal: vi.fn(),
  discovery: vi.fn(),
  inviteMembers: vi.fn(),
  detail: { data: undefined as unknown, isLoading: false },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-connections", () => ({
  useInviteConnection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", () => ({
  useListingDetail: () => h.detail,
}));
vi.mock("@/hooks/use-supplier-discovery", () => ({
  useSupplierDiscovery: () => ({ mutateAsync: h.discovery, isPending: false }),
  useExternalSupplierDiscovery: () => ({ mutateAsync: h.external, isPending: false }),
  useExternalTenderInvite: () => ({ mutateAsync: h.sendExternal, isPending: false }),
  useInviteDiscoveredMembers: () => ({ mutateAsync: h.inviteMembers, isPending: false }),
}));

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
  h.discovery.mockReset().mockResolvedValue([]);
  h.external.mockReset().mockResolvedValue(
    found([
      { name: "Baret A.Ş.", city: "İzmir", country: "TR", website: null, email: "info@baret.com", reason: "Üretici" },
      { name: "Kask Ltd.", city: null, website: null, email: "satis@kask.com", reason: "Bayi" },
    ]),
  );
  h.sendExternal.mockReset();
  h.inviteMembers.mockReset();
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
    expect(h.toast.warning).toHaveBeenCalledWith("satis@kask.com: Adres e-posta almıyor");
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
      { companyId: "co2", name: "Somun Ltd", city: null, rothernId: "R2", matchedCategories: [], strongMatch: false, matchedItems: [], connectionStatus: "NONE", alreadyInvited: false },
      { companyId: "co3", name: "Pul AŞ", city: null, rothernId: "R3", matchedCategories: [], strongMatch: false, matchedItems: [], connectionStatus: "NONE", alreadyInvited: false },
    ]);
    h.inviteMembers.mockResolvedValue([
      { companyId: "co1", status: "INVITED" },
      { companyId: "co2", status: "NOT_ELIGIBLE" },
      { companyId: "co3", status: "DAILY_LIMIT" },
    ]);
    render(listingModal());
    await screen.findByText("Bağlantı AŞ");
    fireEvent.click(screen.getByRole("button", { name: "Hepsini talebe davet et (3)" }));
    await waitFor(() => expect(h.inviteMembers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalledWith("Günlük davet sınırı doldu"));
    expect(h.toast.warning).toHaveBeenCalledWith("Bu talebi göremiyor (ülke kısıtı ya da engel)");
    expect(await screen.findByText("Talebe davetli")).toBeInTheDocument();
    expect(screen.getByText("Bu talebi göremiyor (ülke kısıtı ya da engel)")).toBeInTheDocument();
    // Reddedilen için düğme yok; günlük sınıra takılan yarın yeniden denenebilir.
    expect(screen.getAllByRole("button", { name: "Talebe davet et" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Hepsini talebe davet et/ })).not.toBeInTheDocument();
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
      // İki sonuç ayrı söylenir.
      expect(h.toast.success).toHaveBeenCalledWith(
        "1 davet sıraya alındı; e-postalar alıcının ülkesinde mesai saatinde gönderilir.",
      );
      expect(h.toast.success).toHaveBeenCalledWith("1 davet e-postası gönderildi");
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
      expect(status).toHaveTextContent("Web'de aranıyor… Bu arama yaklaşık 1,5 dakikaya kadar sürebilir.");
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
      expect(screen.getByRole("timer")).toHaveTextContent("Geçen süre: 63 sn");
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
      strongMatch: false,
      matchedItems: [],
      connectionStatus: "NONE",
      alreadyInvited: false,
      ...over,
    });
    const NOT_ELIGIBLE = "Bu talebi göremiyor (ülke kısıtı ya da engel)";

    it("davet düzenleme formunda kaldırıldıysa yeniden açılışta satır 'Talebe davetli' kalmaz; saklanan ret (NOT_ELIGIBLE) de düşer, 'Hepsini davet et' ikisini de sayar", async () => {
      h.discovery.mockResolvedValue([member("co1", "Bağlantı AŞ"), member("co2", "Somun Ltd"), member("co3", "Pul AŞ")]);
      h.inviteMembers.mockResolvedValue([
        { companyId: "co1", status: "INVITED" },
        { companyId: "co2", status: "NOT_ELIGIBLE" },
        { companyId: "co3", status: "INVITED" },
      ]);
      const { rerender } = render(listingModal());
      await screen.findByText("Bağlantı AŞ");
      fireEvent.click(screen.getByRole("button", { name: "Hepsini talebe davet et (3)" }));
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
      expect(screen.getByRole("button", { name: "Hepsini talebe davet et (2)" })).toBeInTheDocument();
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
