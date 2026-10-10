// @vitest-environment jsdom
/**
 * "AI ile tedarikçi bul" penceresinin istekleri (canlı doğrulama turu 2026-10-09):
 *  - Web araması ZAMAN UYUMSUZ (canlı yeniden doğrulama N1): `…/external/start`
 *    aramayı sunucuda başlatıp `{ searchId }` döner, sonuç 3 sn'de bir
 *    `…/external/searches/:id` ile yoklanır (RUNNING → DONE + sonuç | FAILED +
 *    hata). Kimlik bilinmiyorsa (404) arama "yarıda kesildi"; 8 dakikada sonuç
 *    yoksa yoklama bırakılır; tek bir yoklamanın düşmesi aramayı düşürmez.
 *    Başlatma ucu yoksa (eski API, 404) arama bir kez eş zamanlı uca düşer.
 *  - Sonuç gövdesi iki uçta AYNI: `{ companies, incompleteScopes }` — bir geçiş
 *    (yurt içi / yurt dışı) yanıt vermediyse hata dönmez, eksik geçiş listelenir.
 *    Eksik geçişin NEDENİ (`incompleteReasons`) ve bütçe reddinin metni
 *    (`incompleteMessages`) yanıttan okunur; istekte `scopes` yalnız o geçişleri
 *    aratır. Nedenleri taşımayan eski API `scopes` alanını da tanımaz
 *    (`supportsScopes: false`). İstekler genel hata toast'ını KAPATIR (pencere
 *    hatayı kendi gövdesinde tek mesajla gösterir — D7).
 *  - Davet gönderimi: başarıda talep sayfasındaki e-posta davetleri listesinin
 *    sorguları düşürülür (pencerede gönderilen davet sayfada hemen görünsün).
 *  - Süren aramanın kaydı (gözden geçirme R6-02): kimlik bağlam başına sekme
 *    deposunda — sayfa yenilemeyi aşar, arama bitince silinir, çıkışta silinir.
 *  - Son canlı kontrol (2026-10-10): yoklama yanıtındaki geçen süre (`elapsedMs`)
 *    başlangıç anı olarak çağırana bildirilir (AS-4; başlatma yanıtı da taşıyorsa ilk
 *    yoklama beklenmez — DISC-N2); BİTMİŞ aramanın sonucu tek istekle geri okunur ve kaydı
 *    `finished` işaretiyle durur (AS-1); davet mutasyonları çağıran isterse genel
 *    hata toast'ını kapatır (AS-2).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get, post: h.post } }));

import { clearTenantSessionData } from "@/lib/company-auth/tenant-storage";
import {
  EXTERNAL_SEARCH_MAX_MS,
  EXTERNAL_SEARCH_POLL_MS,
  ExternalSearchError,
  LISTING_EMAIL_INVITES_KEY,
  PENDING_EXTERNAL_SEARCH_KEEP_MS,
  PENDING_EXTERNAL_SEARCH_KEY,
  PENDING_EXTERNAL_SEARCH_VERSION,
  clearPendingExternalSearch,
  readPendingExternalSearch,
  readFinishedExternalSearch,
  resumeExternalSupplierSearch,
  savePendingExternalSearch,
  searchExternalSuppliers,
  useExternalTenderInvite,
  useInviteDiscoveredMembers,
  type PendingExternalSearch,
} from "../use-supplier-discovery";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
  return { qc, wrapper };
}

const START = "/company/ai/supplier-discovery/external/start";
const SYNC = "/company/ai/supplier-discovery/external";
const searchUrl = (id: string) => `/company/ai/supplier-discovery/external/searches/${id}`;
const running = { data: { status: "RUNNING", startedAt: "2026-10-09T14:01:00.000Z" } };
const done = (result: unknown) => ({ data: { status: "DONE", startedAt: "2026-10-09T14:01:00.000Z", result } });
const failed = (error: unknown) => ({ data: { status: "FAILED", startedAt: "2026-10-09T14:01:00.000Z", error } });
const httpError = (status: number, data: unknown = {}) => ({ isAxiosError: true, response: { status, data } });
const networkError = { isAxiosError: true, response: undefined };
/** Bilinmeyen rota: Nest'in ham 404 gövdesi (katalog anahtarı / kod yok). */
const routeMissing = httpError(404, {
  statusCode: 404,
  message: "Cannot POST /api/company/ai/supplier-discovery/external/start",
  error: "Not Found",
});

/** Sözün sonucunu yakalar (bekleyen söz reddedilince "işlenmemiş ret" uyarısı çıkmasın). */
function settle<T>(promise: Promise<T>) {
  const outcome: { value?: T; error?: unknown; state: "pending" | "resolved" | "rejected" } = { state: "pending" };
  void promise.then(
    (value) => {
      outcome.value = value;
      outcome.state = "resolved";
    },
    (error: unknown) => {
      outcome.error = error;
      outcome.state = "rejected";
    },
  );
  return outcome;
}
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  h.post.mockReset();
  h.get.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("searchExternalSuppliers — zaman uyumsuz web araması (N1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("arama sunucuda başlatılır ve 3 sn'de bir yoklanır: RUNNING sürer, DONE sonucu döner; kimlik çağırana bildirilir", async () => {
    const companies = [{ name: "Yerli A.Ş.", city: null, website: null, email: "a@yerli.com", reason: "r", scope: "LOCAL" }];
    h.post.mockResolvedValue({ data: { searchId: "s-1" } });
    h.get
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(
        done({ companies, incompleteScopes: ["ABROAD"], incompleteReasons: { ABROAD: "TIMEOUT" }, incompleteMessages: {} }),
      );
    const onStarted = vi.fn();
    const onSyncFallback = vi.fn();
    const outcome = settle(
      searchExternalSuppliers(
        { type: "ALIM", itemNames: ["Rulman"], listingId: "l1", region: "Ege", scopes: ["ABROAD"] },
        { onStarted, onSyncFallback },
      ),
    );
    await tick(0);
    // Başlatma isteği: eş zamanlı uçla AYNI gövde; genel hata toast'ı kapalı.
    expect(h.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = h.post.mock.calls[0];
    expect(url).toBe(START);
    expect(body).toEqual({ type: "ALIM", itemNames: ["Rulman"], listingId: "l1", region: "Ege", scopes: ["ABROAD"] });
    expect(config).toMatchObject({ skipErrorToast: true });
    // Uyuyan API ~30 sn'de kalkar: başlatma isteği genel zaman aşımından (45 sn) KISA
    // kesilmez — sunucu aramayı başlatmışken kesilen istek ikinci ücretli aramaya yol açardı.
    expect(config.timeout).toBeGreaterThanOrEqual(45_000);
    expect(onStarted).toHaveBeenCalledWith("s-1");
    // İlk yoklama 3 sn sonra.
    expect(EXTERNAL_SEARCH_POLL_MS).toBe(3_000);
    await tick(2_999);
    expect(h.get).not.toHaveBeenCalled();
    await tick(1);
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get.mock.calls[0][0]).toBe(searchUrl("s-1"));
    expect(h.get.mock.calls[0][1]).toMatchObject({ skipErrorToast: true });
    expect(outcome.state).toBe("pending");
    await tick(3_000);
    expect(h.get).toHaveBeenCalledTimes(2);
    expect(outcome.state).toBe("pending");
    await tick(3_000);
    expect(h.get).toHaveBeenCalledTimes(3);
    expect(outcome.state).toBe("resolved");
    expect(outcome.value).toEqual({
      companies,
      incompleteScopes: ["ABROAD"],
      incompleteReasons: { ABROAD: "TIMEOUT" },
      incompleteMessages: {},
      supportsScopes: true,
    });
    // Sonuç geldi: yoklama durur; eş zamanlı uç hiç çağrılmadı.
    await tick(30_000);
    expect(h.get).toHaveBeenCalledTimes(3);
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(onSyncFallback).not.toHaveBeenCalled();
  });

  it("FAILED: sunucunun hatası (durum kodu, makine kodu, istek dilindeki metin) çağırana taşınır", async () => {
    h.post.mockResolvedValue({ data: { searchId: "s-1" } });
    h.get.mockResolvedValueOnce(running).mockResolvedValueOnce(
      failed({ statusCode: 403, code: "AI_BUDGET_EXCEEDED", message: " Firmanızın aylık AI bütçesi doldu. " }),
    );
    const outcome = settle(searchExternalSuppliers({ type: "ALIM" }));
    await tick(6_000);
    expect(outcome.state).toBe("rejected");
    const error = outcome.error as ExternalSearchError;
    expect(error).toBeInstanceOf(ExternalSearchError);
    expect(error).toMatchObject({
      kind: "FAILED",
      statusCode: 403,
      code: "AI_BUDGET_EXCEEDED",
      serverMessage: "Firmanızın aylık AI bütçesi doldu.",
    });
    await tick(30_000);
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("FAILED gövdesi eksikse alanlar null; sonuçsuz DONE boş arama sayılmaz (FAILED)", async () => {
    h.post.mockResolvedValue({ data: { searchId: "s-1" } });
    h.get.mockResolvedValueOnce(failed(undefined));
    const bare = settle(searchExternalSuppliers({ type: "ALIM" }));
    await tick(3_000);
    expect(bare.error).toMatchObject({ kind: "FAILED", statusCode: null, code: null, serverMessage: null });

    h.get.mockResolvedValueOnce({ data: { status: "DONE", startedAt: "2026-10-09T14:01:00.000Z" } });
    const noResult = settle(searchExternalSuppliers({ type: "ALIM" }));
    await tick(3_000);
    expect(noResult.state).toBe("rejected");
    expect(noResult.error).toMatchObject({ kind: "FAILED" });
  });

  it("arama kimliği bilinmiyorsa (404: API yeniden başladı / süresi doldu) arama YARIDA KESİLDİ", async () => {
    h.post.mockResolvedValue({ data: { searchId: "s-1" } });
    h.get.mockResolvedValueOnce(running).mockRejectedValueOnce(httpError(404, { statusCode: 404, message: "Not Found" }));
    const outcome = settle(searchExternalSuppliers({ type: "ALIM" }));
    await tick(6_000);
    expect(outcome.state).toBe("rejected");
    expect(outcome.error).toBeInstanceOf(ExternalSearchError);
    expect(outcome.error).toMatchObject({ kind: "INTERRUPTED" });
    await tick(30_000);
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("tek bir yoklamanın düşmesi (ağ, 5xx, 429) aramayı DÜŞÜRMEZ: yoklama sürer, sonuç gelince döner", async () => {
    h.post.mockResolvedValue({ data: { searchId: "s-1" } });
    h.get
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(httpError(503, { message: "Service Unavailable" }))
      .mockRejectedValueOnce(httpError(429, { message: "Çok fazla istek" }))
      .mockResolvedValueOnce(done({ companies: [], incompleteScopes: [], incompleteReasons: {}, incompleteMessages: {} }));
    const outcome = settle(searchExternalSuppliers({ type: "ALIM" }));
    await tick(9_000);
    expect(outcome.state).toBe("pending");
    await tick(3_000);
    expect(outcome.state).toBe("resolved");
    expect(h.get).toHaveBeenCalledTimes(4);
  });

  it("yoklamanın diğer 4xx'i (yetki kalktı) olduğu gibi çağırana gider", async () => {
    const forbidden = httpError(403, { message: "Bu işlem için yetkiniz yok" });
    h.post.mockResolvedValue({ data: { searchId: "s-1" } });
    h.get.mockRejectedValueOnce(forbidden);
    const outcome = settle(searchExternalSuppliers({ type: "ALIM" }));
    await tick(3_000);
    expect(outcome.error).toBe(forbidden);
  });

  it("8 dakikada sonuç yoksa yoklama BIRAKILIR (süre doldu); daha fazla istek atılmaz", async () => {
    h.post.mockResolvedValue({ data: { searchId: "s-1" } });
    h.get.mockResolvedValue(running);
    const outcome = settle(searchExternalSuppliers({ type: "ALIM" }));
    expect(EXTERNAL_SEARCH_MAX_MS).toBe(8 * 60_000);
    await tick(EXTERNAL_SEARCH_MAX_MS - EXTERNAL_SEARCH_POLL_MS);
    expect(outcome.state).toBe("pending");
    await tick(EXTERNAL_SEARCH_POLL_MS);
    expect(outcome.state).toBe("rejected");
    expect(outcome.error).toBeInstanceOf(ExternalSearchError);
    expect(outcome.error).toMatchObject({ kind: "TIMED_OUT" });
    const polls = h.get.mock.calls.length;
    await tick(60_000);
    expect(h.get).toHaveBeenCalledTimes(polls);
  });

  it("çağıran bırakırsa (`shouldStop`: oturum silindi) yoklama sessizce durur", async () => {
    h.post.mockResolvedValue({ data: { searchId: "s-1" } });
    h.get.mockResolvedValue(running);
    let stop = false;
    const outcome = settle(searchExternalSuppliers({ type: "ALIM" }, { shouldStop: () => stop }));
    await tick(6_000);
    expect(h.get).toHaveBeenCalledTimes(2);
    stop = true;
    await tick(3_000);
    expect(outcome.error).toMatchObject({ kind: "ABANDONED" });
    await tick(30_000);
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("arama BAŞLAMADAN bilinen ret (doğrulama 400, yetki / bütçe 403) başlatma isteğinin kendi hatasıdır: yoklanmaz, eş zamanlı uca düşülmez", async () => {
    for (const error of [
      httpError(400, { message: "Doğrulama hatası", errors: { scopes: "Geçersiz seçim" } }),
      httpError(403, { message: "Firmanızın aylık AI bütçesi doldu.", code: "AI_BUDGET_EXCEEDED", i18nKey: "api.ai.budget.pool" }),
      // API'nin KENDİ yazdığı 404 "uç yok" sayılmaz.
      httpError(404, { message: "Talep bulunamadı", i18nKey: "api.companyListings.talepBulunamadi" }),
      httpError(500, { statusCode: 500, message: "Internal server error" }),
      networkError,
    ]) {
      h.post.mockReset().mockRejectedValueOnce(error);
      const onSyncFallback = vi.fn();
      const outcome = settle(searchExternalSuppliers({ type: "ALIM" }, { onSyncFallback }));
      await tick(10_000);
      expect(outcome.error).toBe(error);
      expect(h.post).toHaveBeenCalledTimes(1);
      expect(onSyncFallback).not.toHaveBeenCalled();
    }
    expect(h.get).not.toHaveBeenCalled();
  });

  it("kimliksiz 'başladı' yanıtı izlenemez: genel arama hatası", async () => {
    h.post.mockResolvedValue({ data: {} });
    const outcome = settle(searchExternalSuppliers({ type: "ALIM" }));
    await tick(10_000);
    expect(outcome.error).toBeInstanceOf(ExternalSearchError);
    expect(outcome.error).toMatchObject({ kind: "FAILED", serverMessage: null });
    expect(h.get).not.toHaveBeenCalled();
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it("başlatma ucu yoksa (eski API: ham 404) arama BİR KEZ eş zamanlı uca düşer ve çağırana bildirilir", async () => {
    const companies = [{ name: "Yerli A.Ş.", city: null, website: null, email: "a@yerli.com", reason: "r" }];
    h.post.mockRejectedValueOnce(routeMissing).mockResolvedValueOnce({ data: { companies, incompleteScopes: [] } });
    const onStarted = vi.fn();
    const onSyncFallback = vi.fn();
    const outcome = settle(
      searchExternalSuppliers({ type: "ALIM", itemNames: ["Rulman"], listingId: "l1" }, { onStarted, onSyncFallback }),
    );
    await tick(0);
    expect(outcome.state).toBe("resolved");
    expect(outcome.value).toMatchObject({ companies, supportsScopes: false });
    expect(h.post.mock.calls.map((c) => c[0])).toEqual([START, SYNC]);
    // Aynı gövde iki uca da gider.
    expect(h.post.mock.calls[1][1]).toEqual(h.post.mock.calls[0][1]);
    expect(onSyncFallback).toHaveBeenCalledTimes(1);
    expect(onStarted).not.toHaveBeenCalled();
    expect(h.get).not.toHaveBeenCalled();
  });

  it("eş zamanlı uca düşen aramanın hatası olduğu gibi gider (ikinci deneme yok)", async () => {
    const timeout = httpError(503, { message: "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin." });
    h.post.mockRejectedValueOnce(routeMissing).mockRejectedValueOnce(timeout);
    const outcome = settle(searchExternalSuppliers({ type: "ALIM" }));
    await tick(0);
    expect(outcome.error).toBe(timeout);
    expect(h.post).toHaveBeenCalledTimes(2);
  });

  it("`sync: true` (eski API bu oturumda öğrenildi): başlatma ucu DENENMEZ, doğrudan eş zamanlı uç", async () => {
    h.post.mockResolvedValue({ data: { companies: [], incompleteScopes: [] } });
    const outcome = settle(searchExternalSuppliers({ type: "ALIM", listingId: "l1" }, { sync: true }));
    await tick(0);
    expect(outcome.state).toBe("resolved");
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.post.mock.calls[0][0]).toBe(SYNC);
    expect(h.get).not.toHaveBeenCalled();
  });
});

/**
 * Son canlı kontrol AS-4: aynı aramaya SONRADAN katılan sekme (başlatma, süren
 * aramanın kimliğini döner) sayacını sıfırdan başlatıyordu. Yoklama yanıtı
 * aramanın ne kadardır sürdüğünü taşır (`elapsedMs`, sunucunun KENDİ saatiyle);
 * kanca onu bu tarayıcının saatinde bir başlangıç anına çevirip çağırana bildirir.
 *
 * Gözden geçirme: ilk düzeltme yanıttaki `startedAt`i (sunucu saatinde bir AN)
 * bildiriyordu ve pencere onu tarayıcının saatiyle karşılaştırıyordu — iki saat
 * aynı değilse sayaç yanlıştı.
 */
describe("yoklama yanıtındaki geçen süre (`elapsedMs`) başlangıç anı olarak çağırana bildirilir (AS-4)", () => {
  /** Sunucunun saati. */
  const SERVER_NOW = Date.parse("2026-10-09T14:01:15.000Z");
  const emptyResult = { companies: [], incompleteScopes: [] };
  /** Sunucunun yanıtı: aramayı kendi saatiyle `elapsedMs` önce kaydetmiş. */
  const runningFor = (elapsedMs: unknown, serverNow = SERVER_NOW) => ({
    data: {
      status: "RUNNING",
      startedAt: new Date(serverNow - (typeof elapsedMs === "number" ? elapsedMs : 0)).toISOString(),
      elapsedMs,
    },
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("arama sürerken, arama başına BİR kez; değer yanıtın geldiği an eksi sunucunun ölçtüğü süredir", async () => {
    vi.setSystemTime(SERVER_NOW - 3_000);
    h.post.mockResolvedValue({ data: { searchId: "s-1" } });
    h.get.mockResolvedValueOnce(runningFor(14_700)).mockResolvedValueOnce(runningFor(17_700)).mockResolvedValueOnce(done(emptyResult));
    const onStartedAt = vi.fn();
    const outcome = settle(searchExternalSuppliers({ type: "ALIM" }, { onStartedAt }));
    await tick(2_999);
    // İlk yoklamadan önce bilinecek bir şey yok.
    expect(onStartedAt).not.toHaveBeenCalled();
    await tick(1);
    expect(onStartedAt).toHaveBeenCalledTimes(1);
    expect(onStartedAt).toHaveBeenCalledWith(SERVER_NOW - 14_700);
    await tick(6_000);
    expect(outcome.state).toBe("resolved");
    expect(onStartedAt).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["30 sn İLERİDE", 30_000],
    ["5 dk GERİDE", -5 * 60_000],
  ])("tarayıcı saati sunucudan %s: bildirilen an TARAYICI saatindedir — sunucu saatindeki `startedAt` okunmaz", async (_label, skew) => {
    // Bu sekme aramayı 3 sn önce başlattı; sunucu da 3 sn'dir sürdüğünü söylüyor.
    const clicked = SERVER_NOW + skew - 3_000;
    vi.setSystemTime(clicked);
    h.post.mockResolvedValue({ data: { searchId: "s-1" } });
    h.get.mockResolvedValueOnce(runningFor(3_000)).mockResolvedValueOnce(done(emptyResult));
    const onStartedAt = vi.fn();
    const outcome = settle(searchExternalSuppliers({ type: "ALIM" }, { onStartedAt }));
    await tick(3_000);
    // Başlangıç bu sekmenin tıklama anıdır: sayaç 3 sn der (ne 33 sn ne de eksi beş dakika).
    expect(onStartedAt).toHaveBeenCalledWith(clicked);
    expect(onStartedAt).not.toHaveBeenCalledWith(SERVER_NOW - 3_000);
    await tick(3_000);
    expect(outcome.state).toBe("resolved");
  });

  it("devralınan aramada da bildirilir (yeni sekme / yenilenen sayfa): katılan sekme aramanın gerçek süresini öğrenir", async () => {
    // Tarayıcı saati sunucudan 5 dk geride; arama sunucuda 14,7 sn'dir sürüyor.
    const joined = SERVER_NOW - 5 * 60_000 - 3_000;
    vi.setSystemTime(joined);
    h.get.mockResolvedValueOnce(runningFor(14_700)).mockResolvedValueOnce(done(emptyResult));
    const onStartedAt = vi.fn();
    const outcome = settle(resumeExternalSupplierSearch("s-1", { onStartedAt }));
    await tick(6_000);
    expect(outcome.state).toBe("resolved");
    expect(onStartedAt).toHaveBeenCalledTimes(1);
    // Katıldığı andan 11,7 sn önce (tarayıcı saatiyle).
    expect(onStartedAt).toHaveBeenCalledWith(joined - 11_700);
  });

  it("alanı taşımayan (eski API: yalnız `startedAt`) / okunamayan yanıt bildirilmez; sonraki geçerli yanıt bildirilir; biten arama için bildirilmez", async () => {
    h.get
      .mockResolvedValueOnce({ data: { status: "RUNNING" } })
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(runningFor("3000"))
      .mockResolvedValueOnce(runningFor(-1))
      .mockResolvedValueOnce(runningFor(0))
      .mockResolvedValueOnce(done(emptyResult));
    const onStartedAt = vi.fn();
    const outcome = settle(resumeExternalSupplierSearch("s-1", { onStartedAt }));
    await tick(12_000);
    expect(onStartedAt).not.toHaveBeenCalled();
    await tick(3_000);
    expect(onStartedAt).toHaveBeenCalledTimes(1);
    await tick(3_000);
    expect(outcome.state).toBe("resolved");

    // İlk yanıtı DONE olan aramada sayaç yoktur: bildirim de yok.
    h.get.mockReset().mockResolvedValueOnce({ data: { ...done(emptyResult).data, elapsedMs: 90_000 } });
    const late = vi.fn();
    const finished = settle(resumeExternalSupplierSearch("s-2", { onStartedAt: late }));
    await tick(3_000);
    expect(finished.state).toBe("resolved");
    expect(late).not.toHaveBeenCalled();
  });

  /**
   * Kapanış kontrolü DISC-N2: katılan sekme ilk yoklamaya kadar (3 sn) "Geçen
   * süre: 0 sn" diyordu — başlatma yanıtı aramanın yaşını taşımıyordu. Artık
   * taşır (`{ searchId, elapsedMs }`: yeni aramada 0, katılana aramanın yaşı).
   */
  describe("BAŞLATMA yanıtındaki geçen süre ilk yoklamayı beklemeden bildirilir (DISC-N2)", () => {
    it("süren aramaya katılan sekme: bildirim başlatma yanıtıyla, kimlikten SONRA gelir; yoklama aynı aramayı ikinci kez bildirmez", async () => {
      // Tarayıcı saati sunucudan 5 dk geride; arama sunucuda 12,3 sn'dir sürüyor.
      const clicked = SERVER_NOW - 5 * 60_000;
      vi.setSystemTime(clicked);
      h.post.mockResolvedValue({ data: { searchId: "s-1", elapsedMs: 12_300 } });
      h.get.mockResolvedValueOnce(runningFor(15_300)).mockResolvedValueOnce(runningFor(18_300)).mockResolvedValueOnce(done(emptyResult));
      const calls: string[] = [];
      const onStarted = vi.fn(() => void calls.push("id"));
      const onStartedAt = vi.fn(() => void calls.push("startedAt"));
      const outcome = settle(searchExternalSuppliers({ type: "ALIM" }, { onStarted, onStartedAt }));
      await tick(0);
      // Yoklama henüz atılmadı; başlangıç bu tarayıcının saatinde, tıklamadan 12,3 sn önce.
      expect(h.get).not.toHaveBeenCalled();
      expect(onStartedAt).toHaveBeenCalledTimes(1);
      expect(onStartedAt).toHaveBeenCalledWith(clicked - 12_300);
      // Çağıran başlangıcı kimliğin kaydına yazar: kimlik önce bildirilir.
      expect(calls).toEqual(["id", "startedAt"]);
      await tick(9_000);
      expect(h.get).toHaveBeenCalledTimes(3);
      expect(outcome.state).toBe("resolved");
      expect(onStartedAt).toHaveBeenCalledTimes(1);
    });

    it("yeni arama (`elapsedMs: 0`): bildirilen an yanıtın geldiği andır — sayaç bu sekmenin bildiği andan sürer", async () => {
      const clicked = SERVER_NOW + 30_000;
      vi.setSystemTime(clicked);
      h.post.mockResolvedValue({ data: { searchId: "s-1", elapsedMs: 0 } });
      h.get.mockResolvedValueOnce(done(emptyResult));
      const onStartedAt = vi.fn();
      const outcome = settle(searchExternalSuppliers({ type: "ALIM" }, { onStartedAt }));
      await tick(0);
      expect(onStartedAt).toHaveBeenCalledTimes(1);
      expect(onStartedAt).toHaveBeenCalledWith(clicked);
      await tick(3_000);
      expect(outcome.state).toBe("resolved");
    });

    it.each([
      ["alan yok (eski API)", {}],
      ["metin", { elapsedMs: "12300" }],
      ["eksi", { elapsedMs: -1 }],
      ["null", { elapsedMs: null }],
    ])("başlatma yanıtında okunabilir süre yoksa (%s) bugünkü davranış: ilk bildirim yoklamadan gelir", async (_label, extra) => {
      vi.setSystemTime(SERVER_NOW - 3_000);
      h.post.mockResolvedValue({ data: { searchId: "s-1", ...extra } });
      h.get.mockResolvedValueOnce(runningFor(14_700)).mockResolvedValueOnce(done(emptyResult));
      const onStarted = vi.fn();
      const onStartedAt = vi.fn();
      const outcome = settle(searchExternalSuppliers({ type: "ALIM" }, { onStarted, onStartedAt }));
      await tick(2_999);
      expect(onStarted).toHaveBeenCalledWith("s-1");
      expect(onStartedAt).not.toHaveBeenCalled();
      await tick(1);
      expect(onStartedAt).toHaveBeenCalledTimes(1);
      expect(onStartedAt).toHaveBeenCalledWith(SERVER_NOW - 14_700);
      await tick(3_000);
      expect(outcome.state).toBe("resolved");
    });

    it("dinleyen yoksa başlatma yanıtındaki süre aramayı etkilemez", async () => {
      h.post.mockResolvedValue({ data: { searchId: "s-1", elapsedMs: 12_300 } });
      h.get.mockResolvedValueOnce(runningFor(15_300)).mockResolvedValueOnce(done(emptyResult));
      const outcome = settle(searchExternalSuppliers({ type: "ALIM" }));
      await tick(6_000);
      expect(outcome.state).toBe("resolved");
      expect(outcome.value).toMatchObject({ companies: [] });
    });
  });
});

/**
 * Son canlı kontrol AS-1: biten (ücretli) aramanın sonucu sunucuda 15 dakika
 * durur; sayfa yenilenince pencerenin elinde yalnız kimlik kalır. Sonuç TEK
 * istekle geri okunur — yoklama değil: beklemez, yinelemez, arama başlatmaz.
 */
describe("readFinishedExternalSearch — bitmiş aramanın sonucu tek istekle geri okunur (AS-1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("DONE + sonuç: sonuç yoklamayla AYNI biçimde döner; istek hemen atılır (3 sn beklemez), genel hata toast'ı kapalı", async () => {
    const companies = [{ name: "Yerli A.Ş.", city: null, website: null, email: "a@yerli.com", reason: "r", scope: "LOCAL" }];
    h.get.mockResolvedValueOnce(
      done({ companies, incompleteScopes: ["ABROAD"], incompleteReasons: { ABROAD: "TIMEOUT" }, incompleteMessages: {} }),
    );
    const outcome = settle(readFinishedExternalSearch("s 7/9"));
    await tick(0);
    expect(outcome.state).toBe("resolved");
    expect(outcome.value).toEqual({
      companies,
      incompleteScopes: ["ABROAD"],
      incompleteReasons: { ABROAD: "TIMEOUT" },
      incompleteMessages: {},
      supportsScopes: true,
    });
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get.mock.calls[0][0]).toBe(searchUrl("s%207%2F9"));
    expect(h.get.mock.calls[0][1]).toMatchObject({ skipErrorToast: true });
    // Tek istek: ne yineleme ne yeni arama.
    await tick(60_000);
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.post).not.toHaveBeenCalled();
  });

  it.each([
    ["kimlik bilinmiyor (404: süresi doldu / API yeniden başladı)", () => h.get.mockRejectedValueOnce(httpError(404, { statusCode: 404, message: "Not Found" }))],
    ["yetki kalktı (403)", () => h.get.mockRejectedValueOnce(httpError(403, { message: "Bu işlem için yetkiniz yok" }))],
    ["arama sürüyor", () => h.get.mockResolvedValueOnce(running)],
    ["arama düşmüş", () => h.get.mockResolvedValueOnce(failed({ statusCode: 503, message: "AI isteği zaman aşımına uğradı" }))],
    ["sonuç gövdesi yok", () => h.get.mockResolvedValueOnce({ data: { status: "DONE", startedAt: "2026-10-09T14:01:00.000Z" } })],
    ["gövde okunamıyor", () => h.get.mockResolvedValueOnce({ data: "<html>" })],
  ])("gösterilecek sonuç yoksa null döner, HATA FIRLATMAZ — %s", async (_name, arrange) => {
    arrange();
    const outcome = settle(readFinishedExternalSearch("s-1"));
    await tick(0);
    expect(outcome.state).toBe("resolved");
    expect(outcome.value).toBeNull();
    await tick(60_000);
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["yanıt yok (ağ)", networkError],
    ["5xx", httpError(503, { message: "Service Unavailable" })],
    ["429", httpError(429, { message: "Çok fazla istek" })],
  ])("geçici hata olduğu gibi gider (çağıran kimliği saklar, sonra yeniden sorar) — %s", async (_name, error) => {
    h.get.mockRejectedValueOnce(error);
    const outcome = settle(readFinishedExternalSearch("s-1"));
    await tick(0);
    expect(outcome.state).toBe("rejected");
    expect(outcome.error).toBe(error);
    expect(h.get).toHaveBeenCalledTimes(1);
  });
});

describe("resumeExternalSupplierSearch — başlamış aramayı izlemeyi sürdürür (N1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("yeni arama BAŞLATMAZ: verilen kimliği yoklar, sonucu aynı biçimde döner", async () => {
    h.get.mockResolvedValueOnce(running).mockResolvedValueOnce(done({ companies: [], incompleteScopes: ["LOCAL"] }));
    const outcome = settle(resumeExternalSupplierSearch("s 7/9"));
    await tick(6_000);
    expect(outcome.value).toEqual({
      companies: [],
      incompleteScopes: ["LOCAL"],
      incompleteReasons: {},
      incompleteMessages: {},
      supportsScopes: false,
    });
    expect(h.post).not.toHaveBeenCalled();
    // Kimlik yol parçası olarak kodlanır.
    expect(h.get.mock.calls[0][0]).toBe(searchUrl("s%207%2F9"));
  });

  it("bekleme tavanı aramanın BAŞLADIĞI andan sayılır (`since`), devralma anından değil", async () => {
    h.get.mockResolvedValue(running);
    const outcome = settle(resumeExternalSupplierSearch("s-1", { since: Date.now() - (EXTERNAL_SEARCH_MAX_MS - 5_000) }));
    await tick(3_000);
    expect(outcome.state).toBe("pending");
    await tick(3_000);
    expect(outcome.error).toMatchObject({ kind: "TIMED_OUT" });
    expect(h.get).toHaveBeenCalledTimes(2);
  });
});

describe("süren aramanın kaydı — sayfa yenilemeyi aşar (R6-02)", () => {
  const search = (over: Partial<PendingExternalSearch> = {}): PendingExternalSearch => ({
    searchId: "s-1",
    since: Date.now() - 40_000,
    mode: "replace",
    scopes: null,
    items: ["Rulman 6204", "Keçe"],
    region: "Ege",
    ...over,
  });
  const stored = () => JSON.parse(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY) ?? "null") as unknown;
  const write = (searches: Record<string, unknown>, v: unknown = PENDING_EXTERNAL_SEARCH_VERSION) =>
    sessionStorage.setItem(PENDING_EXTERNAL_SEARCH_KEY, JSON.stringify({ v, searches }));

  beforeEach(() => {
    sessionStorage.clear();
  });

  it("bağlam başına tek kayıt: yazılan okunur (okumak silmez), başka bağlam kendi kaydını görür", () => {
    const a = search();
    const b = search({ searchId: "s-2", mode: "merge", scopes: ["ABROAD"], region: "" });
    savePendingExternalSearch("l:l1", a);
    savePendingExternalSearch("l:l2", b);
    expect(readPendingExternalSearch("l:l1")).toEqual(a);
    expect(readPendingExternalSearch("l:l1")).toEqual(a);
    expect(readPendingExternalSearch("l:l2")).toEqual(b);
    expect(readPendingExternalSearch("l:l3")).toBeNull();
    // Aynı bağlamın yeni araması eskisinin yerine geçer.
    savePendingExternalSearch("l:l1", search({ searchId: "s-3" }));
    expect(readPendingExternalSearch("l:l1")?.searchId).toBe("s-3");
  });

  it("arama bitince yalnız o bağlamın kaydı silinir; son kayıt gidince anahtar da kalmaz", () => {
    savePendingExternalSearch("l:l1", search());
    savePendingExternalSearch("l:l2", search({ searchId: "s-2" }));
    clearPendingExternalSearch("l:l1");
    expect(readPendingExternalSearch("l:l1")).toBeNull();
    expect(readPendingExternalSearch("l:l2")?.searchId).toBe("s-2");
    clearPendingExternalSearch("l:l2");
    expect(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY)).toBeNull();
    // Kayıt yokken silmek / okumak depoya dokunmaz.
    clearPendingExternalSearch("l:l9");
    expect(sessionStorage.length).toBe(0);
  });

  it("sunucunun sonucu unutacağı süreyi (15 dk) geçen kayıt okunmaz ve depodan düşer; sınırın hemen altındaki okunur", () => {
    expect(PENDING_EXTERNAL_SEARCH_KEEP_MS).toBe(15 * 60_000);
    // Yoklama tavanını (8 dk) geçmiş ama sonucu hâlâ saklanan arama SORULUR.
    expect(PENDING_EXTERNAL_SEARCH_KEEP_MS).toBeGreaterThan(EXTERNAL_SEARCH_MAX_MS);
    savePendingExternalSearch("l:old", search({ since: Date.now() - PENDING_EXTERNAL_SEARCH_KEEP_MS }));
    savePendingExternalSearch("l:live", search({ searchId: "s-2", since: Date.now() - (PENDING_EXTERNAL_SEARCH_KEEP_MS - 5_000) }));
    expect(readPendingExternalSearch("l:old")).toBeNull();
    expect(readPendingExternalSearch("l:live")?.searchId).toBe("s-2");
    expect(stored()).toEqual({ v: PENDING_EXTERNAL_SEARCH_VERSION, searches: { "l:live": expect.objectContaining({ searchId: "s-2" }) } });
  });

  it("bozuk kayıt, tanınmayan sürüm ve eksik / yanlış tipli alan okunmaz; depodan düşer", () => {
    sessionStorage.setItem(PENDING_EXTERNAL_SEARCH_KEY, "{bozuk");
    expect(readPendingExternalSearch("l:l1")).toBeNull();
    expect(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY)).toBeNull();

    write({ "l:l1": search() }, 99);
    expect(readPendingExternalSearch("l:l1")).toBeNull();
    expect(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY)).toBeNull();

    const good = search({ searchId: "s-ok" });
    write({
      "l:no-id": { ...search(), searchId: "" },
      "l:no-since": { ...search(), since: "dün" },
      "l:mode": { ...search(), mode: "append" },
      "l:scopes": { ...search(), scopes: ["MARS"] },
      "l:items": { ...search(), items: [1, 2] },
      "l:region": { ...search(), region: null },
      "l:array": [],
      "l:good": good,
    });
    for (const context of ["l:no-id", "l:no-since", "l:mode", "l:scopes", "l:items", "l:region", "l:array"]) {
      expect(readPendingExternalSearch(context)).toBeNull();
    }
    expect(readPendingExternalSearch("l:good")).toEqual(good);
    expect(stored()).toEqual({ v: PENDING_EXTERNAL_SEARCH_VERSION, searches: { "l:good": good } });
  });

  // Son canlı kontrol AS-1: sonuçla biten aramanın kaydı SİLİNMEZ, işaretlenir.
  it("`finished` işareti kayıtla birlikte saklanır ve okunur; yalnız `true` geçerlidir; işaretsiz (eski biçim) kayıt süren aramadır", () => {
    const ended = search({ finished: true });
    savePendingExternalSearch("l:l1", ended);
    expect(readPendingExternalSearch("l:l1")).toEqual(ended);
    expect(readPendingExternalSearch("l:l1")?.finished).toBe(true);
    expect(stored()).toEqual({ v: PENDING_EXTERNAL_SEARCH_VERSION, searches: { "l:l1": ended } });
    // Sürüm ARTMADI: işaretsiz kayıt (eski sayfanın yazdığı) okunur ve süren aramadır.
    expect(PENDING_EXTERNAL_SEARCH_VERSION).toBe(1);
    // (Kayıtlar değişkende tutulur: `search()` her çağrıda `since`i saatten okur.)
    const unmarked = search({ searchId: "s-2" });
    write({ "l:l2": unmarked, "l:l3": { ...search({ searchId: "s-3" }), finished: "evet" } });
    expect(readPendingExternalSearch("l:l2")).toEqual(unmarked);
    expect("finished" in (readPendingExternalSearch("l:l2") ?? {})).toBe(false);
    expect(readPendingExternalSearch("l:l3")?.searchId).toBe("s-3");
    expect("finished" in (readPendingExternalSearch("l:l3") ?? {})).toBe(false);
    // Bitmiş kayıt da aynı süre kuralına uyar (başlangıçtan 15 dk) ve aynı bağlamın yeni aramasıyla değişir.
    savePendingExternalSearch("l:old", search({ finished: true, since: Date.now() - PENDING_EXTERNAL_SEARCH_KEEP_MS }));
    expect(readPendingExternalSearch("l:old")).toBeNull();
    const restarted = search({ searchId: "s-9" });
    savePendingExternalSearch("l:l1", restarted);
    expect(readPendingExternalSearch("l:l1")).toEqual(restarted);
    expect("finished" in (readPendingExternalSearch("l:l1") ?? {})).toBe(false);
  });

  it("kimliksiz arama ve bağlamsız çağrı yazılmaz", () => {
    savePendingExternalSearch("l:l1", search({ searchId: "" }));
    savePendingExternalSearch("", search());
    expect(sessionStorage.length).toBe(0);
    expect(readPendingExternalSearch("")).toBeNull();
  });

  it("depo kapalıysa (gizli sekme) sessizce yok sayılır", () => {
    const fail = () => {
      throw new Error("storage disabled");
    };
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(fail);
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(fail);
    try {
      expect(() => savePendingExternalSearch("l:l1", search())).not.toThrow();
      expect(readPendingExternalSearch("l:l1")).toBeNull();
      expect(() => clearPendingExternalSearch("l:l1")).not.toThrow();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  // Kayıt kalem adlarını ve bölgeyi taşır (firma verisi): anahtar, çıkışta silinen
  // `quick-request…` ailesindendir. Anahtarın adı değişir de önek
  // `TENANT_SESSION_PREFIXES`e eklenmezse bu test düşer.
  it("çıkışta ve aynı sekmede başka kullanıcı girince silinir (`clearTenantSessionData`)", () => {
    savePendingExternalSearch("l:l1", search());
    expect(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY)).not.toBeNull();
    clearTenantSessionData();
    expect(sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY)).toBeNull();
    expect(readPendingExternalSearch("l:l1")).toBeNull();
  });
});

describe("searchExternalSuppliers — arama yanıtının gövdesi (eş zamanlı uç = biten aramanın sonucu)", () => {
  const search = (input: Parameters<typeof searchExternalSuppliers>[0]) => searchExternalSuppliers(input, { sync: true });

  it("adaylar ve yanıt vermeyen geçişler yanıttan okunur; istek genel hata toast'ını kapatır", async () => {
    const companies = [{ name: "Yerli A.Ş.", city: null, website: null, email: "a@yerli.com", reason: "r", scope: "LOCAL" }];
    h.post.mockResolvedValue({ data: { companies, incompleteScopes: ["ABROAD"], searchedScopes: ["LOCAL", "ABROAD"] } });
    const res = await search({ type: "ALIM", itemNames: ["Rulman"], listingId: "l1" });
    // Nedenleri taşımayan yanıt = eski API: `scopes` gönderilemez.
    expect(res).toEqual({
      companies,
      incompleteScopes: ["ABROAD"],
      incompleteReasons: {},
      incompleteMessages: {},
      supportsScopes: false,
    });
    expect(h.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = h.post.mock.calls[0];
    expect(url).toBe(SYNC);
    expect(body).toEqual({ type: "ALIM", itemNames: ["Rulman"], listingId: "l1" });
    // Tam arama: gövdede `scopes` anahtarı hiç yok (eski API alanı 400 ile reddeder).
    expect(body).not.toHaveProperty("scopes");
    expect(config).toMatchObject({ skipErrorToast: true });
    // Ücretli aramayı yanıt yoldayken istemci kesmesin: 1,5 dk'dan uzun bekler.
    expect(config.timeout).toBeGreaterThanOrEqual(120_000);
  });

  it("eski API (alan yok) → eksik geçiş yok; tanınmayan değer süzülür", async () => {
    h.post.mockResolvedValueOnce({ data: { companies: [] } });
    const olderApi = { incompleteReasons: {}, incompleteMessages: {}, supportsScopes: false };
    expect(await search({ type: "ALIM" })).toEqual({ companies: [], incompleteScopes: [], ...olderApi });
    h.post.mockResolvedValueOnce({ data: { companies: [], incompleteScopes: ["ABROAD", null, "MARS", "LOCAL", "ABROAD"] } });
    expect(await search({ type: "ALIM" })).toEqual({ companies: [], incompleteScopes: ["LOCAL", "ABROAD"], ...olderApi });
    // Alan var ama nesne değil (dizi / null) → yine "nedenleri bildirmiyor".
    for (const incompleteReasons of [null, ["TIMEOUT"], "TIMEOUT"]) {
      h.post.mockResolvedValueOnce({ data: { companies: [], incompleteScopes: ["ABROAD"], incompleteReasons } });
      expect(await search({ type: "ALIM" })).toEqual({ companies: [], incompleteScopes: ["ABROAD"], ...olderApi });
    }
  });

  it("eksik geçişin nedeni ve bütçe reddinin metni okunur; nedenleri taşıyan uç `scopes` tanır", async () => {
    const budget = "Firmanızın aylık AI bütçesi doldu — AI özellikleri gelecek ay yeniden açılır.";
    h.post.mockResolvedValueOnce({
      data: {
        companies: [],
        searchedScopes: ["LOCAL", "ABROAD"],
        incompleteScopes: ["ABROAD"],
        incompleteReasons: { ABROAD: "BUDGET" },
        incompleteMessages: { ABROAD: `  ${budget} ` },
      },
    });
    expect(await search({ type: "ALIM" })).toEqual({
      companies: [],
      incompleteScopes: ["ABROAD"],
      incompleteReasons: { ABROAD: "BUDGET" },
      incompleteMessages: { ABROAD: budget },
      supportsScopes: true,
    });
    for (const reason of ["TIMEOUT", "PROVIDER"]) {
      h.post.mockResolvedValueOnce({
        data: { companies: [], incompleteScopes: ["LOCAL"], incompleteReasons: { LOCAL: reason }, incompleteMessages: {} },
      });
      expect(await search({ type: "ALIM" })).toMatchObject({
        incompleteScopes: ["LOCAL"],
        incompleteReasons: { LOCAL: reason },
        incompleteMessages: {},
      });
    }
    // Tam yanıt (eksik yok): uç yine yeni — boş nesneler de "alan var" demektir.
    h.post.mockResolvedValueOnce({ data: { companies: [], incompleteScopes: [], incompleteReasons: {}, incompleteMessages: {} } });
    expect(await search({ type: "ALIM" })).toEqual({
      companies: [],
      incompleteScopes: [],
      incompleteReasons: {},
      incompleteMessages: {},
      supportsScopes: true,
    });
  });

  it("tanınmayan neden, boş metin ve eksik OLMAYAN geçişin nedeni / metni düşer", async () => {
    h.post.mockResolvedValueOnce({
      data: {
        companies: [],
        incompleteScopes: ["LOCAL"],
        incompleteReasons: { LOCAL: "QUOTA", ABROAD: "TIMEOUT" },
        incompleteMessages: { LOCAL: "   ", ABROAD: "yanıt vermiş geçişin metni", MARS: 7 },
      },
    });
    expect(await search({ type: "ALIM" })).toEqual({
      companies: [],
      incompleteScopes: ["LOCAL"],
      incompleteReasons: {},
      incompleteMessages: {},
      supportsScopes: true,
    });
  });

  it("`scopes`: yalnız istenen geçişler gövdeye girer (geçerli, tekil); boş / geçersiz liste alanı hiç göndermez", async () => {
    h.post.mockResolvedValue({ data: { companies: [], incompleteScopes: [], incompleteReasons: {}, incompleteMessages: {} } });
    const bodyOf = async (scopes: unknown) => {
      h.post.mockClear();
      await search({ type: "ALIM", listingId: "l1", region: "Ege", scopes: scopes as never });
      return h.post.mock.calls[0][1];
    };
    expect(await bodyOf(["ABROAD"])).toEqual({ type: "ALIM", listingId: "l1", region: "Ege", scopes: ["ABROAD"] });
    expect(await bodyOf(["ABROAD", "LOCAL"])).toEqual({ type: "ALIM", listingId: "l1", region: "Ege", scopes: ["LOCAL", "ABROAD"] });
    expect(await bodyOf(["ABROAD", "ABROAD", "MARS"])).toEqual({ type: "ALIM", listingId: "l1", region: "Ege", scopes: ["ABROAD"] });
    for (const none of [[], ["MARS"], undefined]) {
      const body = await bodyOf(none);
      expect(body).toEqual({ type: "ALIM", listingId: "l1", region: "Ege" });
      expect(body).not.toHaveProperty("scopes");
    }
  });

  it("bütün geçişler düşerse hata olduğu gibi çağırana gider", async () => {
    const error = httpError(503, { message: "timeout" });
    h.post.mockRejectedValue(error);
    await expect(search({ type: "ALIM" })).rejects.toBe(error);
  });
});

describe("useExternalTenderInvite — davet gönderimi", () => {
  const input = { listingId: "l1", invites: [{ email: "a@firma.com", locale: "tr" as const, country: "TR" }], source: "AI_FORM" as const };

  it("başarıda talebin e-posta davetleri sorguları düşer (önekle; başka sorgulara dokunulmaz)", async () => {
    h.post.mockResolvedValue({ data: { results: [{ email: "a@firma.com", status: "QUEUED", sendAfter: "2026-10-09T06:40:00.000Z" }] } });
    const { qc, wrapper } = setup();
    const listKey = [...LISTING_EMAIL_INVITES_KEY, "l1"];
    qc.setQueryData(listKey, []);
    qc.setQueryData(["company-listings", "detail", "l1"], { id: "l1" });
    const { result } = renderHook(() => useExternalTenderInvite(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync(input);
    });
    expect(res).toEqual([{ email: "a@firma.com", status: "QUEUED", sendAfter: "2026-10-09T06:40:00.000Z" }]);
    expect(LISTING_EMAIL_INVITES_KEY).toEqual(["company", "listing-email-invites"]);
    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["company-listings", "detail", "l1"])?.isInvalidated).toBe(false);
    expect(h.post.mock.calls[0][1]).toEqual({
      listingId: "l1",
      invites: [{ email: "a@firma.com", locale: "tr", country: "TR" }],
      source: "AI_FORM",
    });
  });

  it("istek düşerse liste düşürülmez", async () => {
    h.post.mockRejectedValue(new Error("network"));
    const { qc, wrapper } = setup();
    const listKey = [...LISTING_EMAIL_INVITES_KEY, "l1"];
    qc.setQueryData(listKey, []);
    const { result } = renderHook(() => useExternalTenderInvite(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(input).catch(() => {});
    });
    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(false);
  });
});

/**
 * Son canlı kontrol AS-2: pencerede davet gönderimi 5xx alınca İKİ hata toast'ı
 * çıkıyordu (genel "Sunucu hatası…" + pencerenin "Davetler gönderilemedi").
 * Pencere iki mutasyonu `skipErrorToast` ile çağırır; seçeneği vermeyen çağıran
 * (hızlı talep yayını, bekleyen davetler) için istek AYNEN eskisi gibidir.
 */
describe("davet mutasyonları — çağıran isterse genel hata toast'ı kapanır (AS-2)", () => {
  const external = { listingId: "l1", invites: [{ email: "a@firma.com", locale: "tr" as const, country: "TR" }], source: "AI_FORM" as const };
  const members = { listingId: "l1", companyIds: ["co1"] };
  const MEMBERS_URL = "/company/ai/supplier-discovery/listings/l1/invite-members";

  it("e-posta daveti: `skipErrorToast` istekle gider; seçenek yoksa gitmez", async () => {
    h.post.mockRejectedValue(httpError(500, { statusCode: 500, message: "Internal server error" }));
    const { wrapper } = setup();
    const quiet = renderHook(() => useExternalTenderInvite({ skipErrorToast: true }), { wrapper });
    await act(async () => {
      await quiet.result.current.mutateAsync(external).catch(() => {});
    });
    expect(h.post.mock.calls[0][0]).toBe("/company/connections/external-tender-invite");
    expect(h.post.mock.calls[0][2]).toEqual({ timeout: 60_000, skipErrorToast: true });

    const plain = renderHook(() => useExternalTenderInvite(), { wrapper });
    await act(async () => {
      await plain.result.current.mutateAsync(external).catch(() => {});
    });
    expect(h.post.mock.calls[1][2]).toEqual({ timeout: 60_000 });
  });

  it("üye daveti: `skipErrorToast` istekle gider; seçenek yoksa istek ayarı HİÇ geçmez", async () => {
    h.post.mockRejectedValue(httpError(500, { statusCode: 500, message: "Internal server error" }));
    const { wrapper } = setup();
    const quiet = renderHook(() => useInviteDiscoveredMembers({ skipErrorToast: true }), { wrapper });
    await act(async () => {
      await quiet.result.current.mutateAsync(members).catch(() => {});
    });
    expect(h.post.mock.calls[0]).toEqual([MEMBERS_URL, { companyIds: ["co1"] }, { skipErrorToast: true }]);

    const plain = renderHook(() => useInviteDiscoveredMembers(), { wrapper });
    await act(async () => {
      await plain.result.current.mutateAsync(members).catch(() => {});
    });
    expect(h.post.mock.calls[1]).toEqual([MEMBERS_URL, { companyIds: ["co1"] }]);
  });

  it("başarı yolu seçenekle de aynıdır: sonuç döner, sorgular düşer", async () => {
    h.post.mockResolvedValue({ data: { results: [{ companyId: "co1", status: "INVITED" }] } });
    const { qc, wrapper } = setup();
    qc.setQueryData(["listing-discovery", "l1"], { runs: [] });
    const { result } = renderHook(() => useInviteDiscoveredMembers({ skipErrorToast: true }), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync(members);
    });
    expect(res).toEqual([{ companyId: "co1", status: "INVITED" }]);
    expect(qc.getQueryState(["listing-discovery", "l1"])?.isInvalidated).toBe(true);
  });
});
