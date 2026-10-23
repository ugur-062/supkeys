/**
 * KESİNTİDE ÖNCE KISA SÜRE YENİDEN DENE, SONRA DÜRÜSTÇE VAZGEÇ (2026-10-08,
 * staging kesintisi). Uyuyan/yeniden başlayan API yüzünden önbellekte olmayan
 * talep sayfası tek denemede 500 + "Bir şeyler ters gitti" veriyordu.
 *  - ana veri geçici hatada (ağ, zaman aşımı, 5xx) yeniden sorulur; toparlanırsa
 *    sayfa NORMAL çizilir;
 *  - toparlanmazsa atılan hata sabit `digest` taşır → hata sınırı "şu anda
 *    yüklenemiyor, yeniden denenecek" ekranını seçer;
 *  - 429 ve 4xx yeniden denenmez; ikincil bloklar tek deneme yapar;
 *  - başarısızlık ÖNBELLEĞE YAZILMAZ (kesinti ≠ boş veri kuralı aynen);
 *  - vazgeçişten sonraki tek deneme kipi yalnız SÜREYLE biter (araya giren
 *    başarılı okuma kapatmaz — gözden geçirme C2-1);
 *  - paylaşılan okuma ZİYARETÇİ başınadır: bir ziyaretçinin 429'u başka
 *    ziyaretçiye verilmez (gözden geçirme C2-3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PublicApiUnavailableError,
  fetchCompanyProfile,
  fetchFacets,
  fetchListing,
  fetchListings,
  fetchProduct,
  fetchSimilarListings,
} from "../marketplace-api";
import { SSR_CLIENT_IP_HEADER } from "../ssr-visitor";
import { PUBLIC_API_UNAVAILABLE_DIGEST, isPublicApiUnavailable } from "../unavailable";
import { CRITICAL_UPSTREAM_POLICY, UPSTREAM_COOLDOWN_MS, upstreamClock, upstreamInCooldown, upstreamTuning } from "../upstream-retry";

/**
 * Çizimi yapan ziyaretçi (dinamik çizimde `attributeSsrToVisitor` yazar; React
 * `cache` istek kapsamı test ortamında yok). `undefined` = ilişkilendirilmemiş
 * okuma — bu dosyadaki diğer testlerin varsayılanı.
 */
const visitor = vi.hoisted(() => ({ ip: undefined as string | undefined }));
vi.mock("../ssr-visitor", async (orig) => ({
  ...(await orig<typeof import("../ssr-visitor")>()),
  ssrVisitorIp: () => visitor.ip,
}));

const fetchMock = vi.fn();
const response = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  visitor.ip = undefined;
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test/api");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ana veri — geçici hatada yeniden dener", () => {
  it("503 → 503 → 200: talep sayfası HATASIZ çizilir (üç deneme)", async () => {
    fetchMock
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValue(response(200, { number: "ROT-000001", title: "Vana" }));
    await expect(fetchListing("rot-000001")).resolves.toMatchObject({ title: "Vana" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Aralıklar politikadan (bekleme kurulumda sıfırlanır, çağrı argümanı gerçek).
    expect(vi.mocked(upstreamClock.sleep).mock.calls.map((c) => c[0])).toEqual(CRITICAL_UPSTREAM_POLICY.pausesMs.slice(0, 2));
  });

  it("ağ hatası → 200: ürün, firma ve liste de toparlanır", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValue(response(200, { product: { name: "Kablo" }, company: {} }));
    await expect(fetchProduct("firma", "urun")).resolves.toMatchObject({ product: { name: "Kablo" } });
    fetchMock.mockReset().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValue(response(200, { name: "ABC" }));
    await expect(fetchCompanyProfile("abc")).resolves.toMatchObject({ name: "ABC" });
    fetchMock.mockReset().mockResolvedValueOnce(response(502)).mockResolvedValue(response(200, { items: [{ number: "ROT-1" }], total: 1, page: 1, pageSize: 24 }));
    await expect(fetchListings({})).resolves.toMatchObject({ total: 1 });
  });

  it("her istek bir iptal sinyali taşır (asılı bağlantı zaman aşımıyla kesilir)", async () => {
    fetchMock.mockResolvedValue(response(200, { items: [], total: 0, page: 1, pageSize: 24 }));
    await fetchListings({});
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.cache).toBe("no-store");
  });

  it("hep 503: (bekleme sayısı + 1) denemeden sonra kesinti hatası atar", async () => {
    fetchMock.mockResolvedValue(response(503));
    await expect(fetchListing("rot-000001")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(CRITICAL_UPSTREAM_POLICY.pausesMs.length + 1);
  });

  it("vazgeçtikten hemen sonraki ana okuma TEK deneme yapar (kesinti sürerken fonksiyon tutulmaz)", async () => {
    // Saat elle ilerletilir (tek deneme kipi yalnız SÜREYLE biter).
    let skewMs = 0;
    vi.spyOn(upstreamClock, "now").mockImplementation(() => performance.now() + skewMs);
    fetchMock.mockResolvedValue(response(503));
    await expect(fetchListing("rot-000001")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    fetchMock.mockClear();
    await expect(fetchProduct("firma", "urun")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Başka bir ana okuma başarılı (kısmi kesinti: yalnız bazı uçlar arızalı) —
    // kip KAPANMAZ: arızalı uç yine tek deneme alır (gözden geçirme C2-1; kip
    // başarıyla kapansaydı arızalı uca her çizimde dört istek giderdi).
    fetchMock.mockReset().mockResolvedValue(response(200, { number: "ROT-000001" }));
    await expect(fetchListing("rot-000001")).resolves.toMatchObject({ number: "ROT-000001" });
    expect(upstreamInCooldown()).toBe(true);
    fetchMock.mockReset().mockResolvedValue(response(500));
    await expect(fetchListing("rot-000002")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Süre dolunca (son vazgeçişten 15 sn sonra) yeniden deneme hakkı geri gelir.
    skewMs += UPSTREAM_COOLDOWN_MS + 1;
    expect(upstreamInCooldown()).toBe(false);
    fetchMock.mockClear();
    await expect(fetchListing("rot-000003")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(CRITICAL_UPSTREAM_POLICY.pausesMs.length + 1);
  });
});

/**
 * TEK İSTEK İÇİNDE YİNELEME: sayfa ve `generateMetadata` aynı kaydı aynı anda
 * ister; sayfa hata verince Next hata belgesi için `generateMetadata`yı bir kez
 * DAHA çağırır. Asılı API'de bu ikinci tur fonksiyonu bir zaman aşımı daha
 * tutuyordu (yerel yığında ölçüldü: 5 sn + 4,3 sn).
 */
describe("aynı okuma — tek uçuş, ikinci tur beklemez", () => {
  it("sayfa + generateMetadata aynı anda: API'ye TEK istek, ikisi de aynı veriyi alır", async () => {
    fetchMock.mockResolvedValue(response(200, { number: "ROT-000001", title: "Vana" }));
    const [page, meta] = await Promise.all([fetchListing("rot-000001"), fetchListing("rot-000001")]);
    expect(page).toMatchObject({ title: "Vana" });
    expect(meta).toMatchObject({ title: "Vana" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Paylaşılan uçuş, paylaşılan NESNE değildir: biri veriyi yerinde değiştirirse öteki etkilenmez.
    expect(meta).toEqual(page);
    expect(meta).not.toBe(page);
  });

  it("hata belgesi turu: az önce vazgeçilen kayıt API'ye yeniden sorulmadan AYNI kesinti hatasını verir", async () => {
    upstreamTuning.sameFailureWindowMs = 1_000; // canlıdaki değer (kurulum testlerde kapatır)
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchListing("rot-000001")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    const asked = fetchMock.mock.calls.length;
    const second = await fetchListing("rot-000001").catch((e: unknown) => e);
    expect(second).toBeInstanceOf(PublicApiUnavailableError);
    expect(isPublicApiUnavailable(second)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(asked);
    // Başka kayıt ve başka dil kendi okumasını yapar (pencere anahtar başına).
    await expect(fetchProduct("firma", "urun")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(asked);
  });
});

/**
 * PAYLAŞILAN OKUMA ZİYARETÇİ BAŞINADIR (gözden geçirme C2-3). API,
 * ilişkilendirilmiş SSR isteğini ziyaretçi IP'si başına kovaya sayar
 * (`ssr-bucket:default:ip:<ip>`): 429 o ziyaretçiye özeldir. Paylaşım anahtarı
 * yalnız (politika, dil, adres) iken kovasını dolduran ziyaretçinin 429'u, aynı
 * adresi isteyen BAŞKA ziyaretçiye de veriliyordu — süren uçuşa katılarak ya da
 * bir saniyelik "aynı hata" penceresinden; API ona 200 dönecekken.
 */
describe("aynı okuma — ziyaretçi başına (429 başka ziyaretçiye geçmez)", () => {
  const LIMITED = "203.0.113.1"; // kovası dolu ziyaretçi (A)
  const OTHER = "198.51.100.7"; // sınırlanmamış ziyaretçi (B)
  const ipOf = (init: unknown) => (init as { headers: Record<string, string> }).headers[SSR_CLIENT_IP_HEADER];
  const askedIps = () => fetchMock.mock.calls.map((c) => ipOf(c[1]));

  beforeEach(() => {
    vi.stubEnv("SEO_REVALIDATE_SECRET", "s".repeat(32)); // sır yoksa IP başlığı gönderilmez
    upstreamTuning.sameFailureWindowMs = 1_000; // canlıdaki değer (kurulum testlerde kapatır)
    // API ziyaretçi başına sınırlar: A'nın kovası dolu, diğerlerininki değil.
    fetchMock.mockImplementation(async (_url: string, init: unknown) =>
      ipOf(init) === LIMITED ? response(429) : response(200, { name: "ABC", slug: "abc" }),
    );
  });

  it("art arda: A'nın 429'u B'ye YENİDEN VERİLMEZ — B kendi isteğini atar ve veriyi alır", async () => {
    visitor.ip = LIMITED; // A: sahibin önizlemesi (`?onizleme=1`) — her yenilemede API'ye gider
    await expect(fetchCompanyProfile("abc", { fresh: true })).rejects.toBeInstanceOf(PublicApiUnavailableError);
    visitor.ip = OTHER; // B: aynı profili hemen ardından (pencerenin içinde) açar
    await expect(fetchCompanyProfile("abc")).resolves.toMatchObject({ name: "ABC" });
    expect(askedIps()).toEqual([LIMITED, OTHER]);
  });

  it("aynı anda: B, A'nın süren uçuşuna KATILMAZ", async () => {
    let releaseA!: () => void;
    const held = new Promise<void>((resolve) => (releaseA = resolve));
    fetchMock.mockImplementation(async (_url: string, init: unknown) => {
      if (ipOf(init) !== LIMITED) return response(200, { name: "ABC", slug: "abc" });
      await held; // A'nın isteği sürüyor
      return response(429);
    });
    try {
      visitor.ip = LIMITED;
      const a = fetchCompanyProfile("abc", { fresh: true }).catch((e: unknown) => e);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); // A uçuşta
      visitor.ip = OTHER;
      const b = fetchCompanyProfile("abc").catch((e: unknown) => e);
      // B kendi isteğini atar (A'nın uçuşuna katılsaydı API'ye ikinci istek gitmezdi) …
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      // … ve A hâlâ beklerken kendi yanıtını alır.
      expect(await b).toMatchObject({ name: "ABC" });
      releaseA();
      expect(await a).toBeInstanceOf(PublicApiUnavailableError);
      expect(askedIps()).toEqual([LIMITED, OTHER]);
    } finally {
      releaseA();
    }
  });

  it("aynı ziyaretçinin sayfası + generateMetadata'sı yine TEK isteği paylaşır; hata belgesi turu API'ye yeniden sormaz", async () => {
    visitor.ip = OTHER;
    const [page, meta] = await Promise.all([fetchCompanyProfile("abc"), fetchCompanyProfile("abc")]);
    expect(page).toMatchObject({ name: "ABC" });
    expect(meta).toEqual(page);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Kovası dolu ziyaretçinin KENDİ ikinci turu (Next hata belgesi için
    // generateMetadata'yı yeniden çağırır) pencere içinde aynı hatayı alır.
    fetchMock.mockClear();
    visitor.ip = LIMITED;
    await expect(fetchCompanyProfile("abc")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    await expect(fetchCompanyProfile("abc")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    expect(askedIps()).toEqual([LIMITED]);
  });
});

describe("yeniden DENENMEYENLER", () => {
  it("429 (hız sınırı) tek deneme — kesinti hatası", async () => {
    fetchMock.mockResolvedValue(response(429));
    await expect(fetchListing("rot-000001")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("404 tek deneme — gerçek 'yok' (null / boş yedek)", async () => {
    fetchMock.mockResolvedValue(response(404));
    expect(await fetchListing("rot-000001")).toBeNull();
    expect((await fetchListings({})).items).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ana listede 400 tek deneme — kesinti hatası (dağıtım penceresi kuralı)", async () => {
    fetchMock.mockResolvedValue(response(400));
    await expect(fetchListings({})).rejects.toBeInstanceOf(PublicApiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ikincil blok (facet, benzer talepler) tek deneme yapar ve yedekle kalır", async () => {
    fetchMock.mockResolvedValue(response(503));
    expect((await fetchFacets({})).categories).toEqual([]);
    expect((await fetchSimilarListings({ type: "ALIM" })).items).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockReset().mockRejectedValue(new TypeError("fetch failed"));
    expect((await fetchFacets({})).categories).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("derlemede yeniden deneme yok — tek deneme, yedekle çıkar", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    fetchMock.mockResolvedValue(response(503));
    expect(await fetchListing("rot-000001")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("hata sınırına giden işaret", () => {
  it("kesinti hatası sabit digest taşır; yol/adres/durum kodu içermez", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = await fetchListing("rot-000001").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PublicApiUnavailableError);
    expect((err as PublicApiUnavailableError).digest).toBe(PUBLIC_API_UNAVAILABLE_DIGEST);
    expect(isPublicApiUnavailable(err)).toBe(true);
    expect(PUBLIC_API_UNAVAILABLE_DIGEST).not.toMatch(/rot-000001|api\.test|\d{3}/);
  });

  it("isPublicApiUnavailable: yalnız bu işareti tanır", () => {
    const withDigest = (digest: unknown) => Object.assign(new Error("x"), { digest });
    expect(isPublicApiUnavailable(withDigest(PUBLIC_API_UNAVAILABLE_DIGEST))).toBe(true);
    // Next özete hata kodu eklerse de tanınır.
    expect(isPublicApiUnavailable(withDigest(`${PUBLIC_API_UNAVAILABLE_DIGEST}@E394`))).toBe(true);
    expect(isPublicApiUnavailable(withDigest("3749470233"))).toBe(false);
    expect(isPublicApiUnavailable(withDigest("NEXT_HTTP_ERROR_FALLBACK;404"))).toBe(false);
    expect(isPublicApiUnavailable(withDigest(42))).toBe(false);
    expect(isPublicApiUnavailable(new Error(PUBLIC_API_UNAVAILABLE_DIGEST))).toBe(false);
    expect(isPublicApiUnavailable(null)).toBe(false);
    expect(isPublicApiUnavailable("ROTHERN_PUBLIC_API_UNAVAILABLE")).toBe(false);
  });
});
