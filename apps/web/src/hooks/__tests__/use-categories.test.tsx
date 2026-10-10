// @vitest-environment jsdom
/**
 * Kayıt denetimi 2026-10 (category-5, code-category-5, signup-tr-3): kategori
 * kancaları yalnız `data` + `isLoading` veriyordu; düşen istek çağıranda boş
 * liste / "sonuç yok" olarak çiziliyordu. Ayrıca varsayılan yeniden deneme
 * politikası 429'u üç kez daha deniyor, kısıtlanan uca yük bindiriyordu.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: h.get } }));

import {
  useCategoriesByIds,
  useCategorySearchTree,
  useChildren,
  useRoots,
} from "../use-categories";

/** Uygulamanın varsayılanına yakın istemci: 4xx (429 hariç) denenmez, gerisi 3 kez. */
function wrapperWithAppRetry() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (n: number, e: unknown) => {
          const s = (e as { response?: { status?: number } })?.response?.status;
          if (s && s >= 400 && s < 500 && s !== 429) return false;
          return n < 3;
        },
        retryDelay: 1,
      },
    },
  });
  // Adlandırılmış bileşen: anonim sarmalayıcı `react/display-name` ile derlemeyi kırar.
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });
/** `useChildren` ağacın üst katmanını da (`/categories/all`) ister; sayım uca göre yapılır. */
const callsTo = (url: string) => h.get.mock.calls.filter((c) => c[0] === url).length;

beforeEach(() => {
  h.get.mockReset();
});

describe("useChildren (L2/L3 — /categories/children)", () => {
  it("başarı: liste + isError=false", async () => {
    h.get.mockResolvedValue({ data: [{ id: "31161700", code: "31161700", nameTr: "Somunlar", level: 3, childCount: 4 }] });
    const { result } = renderHook(() => useChildren("31160000", 2, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.[0]._count).toEqual({ children: 4 });
    // Hatayı çağıran satır içinde gösterir → genel toast kapalı.
    expect(h.get).toHaveBeenCalledWith("/categories/children", {
      params: { parentId: "31160000", catalog: "full" },
      skipErrorToast: true,
    });
  });

  it("429: otomatik yeniden denenmez; isError + refetch çağırana verilir", async () => {
    h.get.mockRejectedValue(httpError(429));
    const { result } = renderHook(() => useChildren("31160000", 2, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(callsTo("/categories/children")).toBe(1);

    // "Yeniden dene": aynı kanca üzerinden; başarılıysa hata durumu kalkar.
    h.get.mockResolvedValue({ data: [] });
    await result.current.refetch();
    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(callsTo("/categories/children")).toBe(2);
  });

  it("yeniden deneme yoldayken durum 'yükleniyor'dur (hata satırı yerine dönen simge)", async () => {
    h.get.mockRejectedValue(httpError(429));
    const { result } = renderHook(() => useChildren("31160000", 2, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);

    let resolve!: (v: { data: unknown[] }) => void;
    h.get.mockReturnValue(new Promise((r) => (resolve = r)));
    void result.current.refetch();
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.isError).toBe(false);
    resolve({ data: [] });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual([]);
  });

  it("5xx: tek otomatik deneme, sonra hata (3 değil)", async () => {
    h.get.mockRejectedValue(httpError(500));
    const { result } = renderHook(() => useChildren("31160000", 3, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callsTo("/categories/children")).toBe(2);
  });

  it("L1 (bellekten aileler): /categories/all düşerse isError + refetch", async () => {
    h.get.mockRejectedValue(httpError(400));
    const { result } = renderHook(() => useChildren("31000000", 1, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(h.get).toHaveBeenCalledWith("/categories/all", { skipErrorToast: true });
    h.get.mockResolvedValue({
      data: [
        { id: "31160000", code: "31160000", nameTr: "Hırdavat", level: 2, parentId: "31000000", childCount: 20 },
        { id: "39120000", code: "39120000", nameTr: "Başka", level: 2, parentId: "39000000", childCount: 1 },
      ],
    });
    await result.current.refetch();
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.isError).toBe(false);
  });
});

// Kayıt denetimi 2026-10 (webcat-6): satır içi hata politikası yalnız
// `/children` dalına bağlanmıştı. Sektör açılınca gelen aileler (`/all`) ve
// sektör listesi (`/segments`) varsayılan politikada kalmıştı: 429'da dört
// istek (~7 sn dönen simge), 5xx'te dört genel toast + satır içi hata.
describe("useChildren (L1 — /categories/all): aile dalı da satır içi hata politikasında", () => {
  it("429: tek istek, toast kapalı (otomatik yeniden deneme yok)", async () => {
    h.get.mockRejectedValue(httpError(429));
    const { result } = renderHook(() => useChildren("31000000", 1, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callsTo("/categories/all")).toBe(1);
    expect(h.get.mock.calls.every((c) => c[1]?.skipErrorToast === true)).toBe(true);
  });

  it("5xx: tek otomatik deneme, sonra hata (4 istek değil)", async () => {
    h.get.mockRejectedValue(httpError(500));
    const { result } = renderHook(() => useChildren("31000000", 1, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callsTo("/categories/all")).toBe(2);
    expect(h.get.mock.calls.every((c) => c[1]?.skipErrorToast === true)).toBe(true);
  });
});

describe("useRoots (/categories/segments) — inlineError seçeneği", () => {
  it("varsayılan: genel toast açık, uygulamanın yeniden deneme politikası (başka yüzeyler buna güveniyor)", async () => {
    h.get.mockRejectedValue(httpError(429));
    const { result } = renderHook(() => useRoots(), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callsTo("/categories/segments")).toBe(4);
    expect(h.get).toHaveBeenCalledWith("/categories/segments", {});
  });

  it("inlineError: toast kapalı, 429 yeniden denenmez; isError + refetch çağırana verilir", async () => {
    h.get.mockRejectedValue(httpError(429));
    const { result } = renderHook(() => useRoots({ inlineError: true }), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(callsTo("/categories/segments")).toBe(1);
    expect(h.get).toHaveBeenCalledWith("/categories/segments", { skipErrorToast: true });

    h.get.mockResolvedValue({ data: [{ id: "31000000", code: "31000000", nameTr: "Üretim Bileşenleri", level: 1, childCount: 12 }] });
    await result.current.refetch();
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.[0]._count).toEqual({ children: 12 });
    expect(callsTo("/categories/segments")).toBe(2);
  });

  it("inlineError: 5xx tek otomatik deneme (4 istek değil)", async () => {
    h.get.mockRejectedValue(httpError(500));
    const { result } = renderHook(() => useRoots({ inlineError: true }), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callsTo("/categories/segments")).toBe(2);
  });
});

describe("useCategorySearchTree / useCategoriesByIds — inlineError seçeneği", () => {
  it("varsayılan: genel toast açık kalır (başka yüzeyler buna güveniyor)", async () => {
    h.get.mockResolvedValue({ data: { segments: [] } });
    const { result } = renderHook(() => useCategorySearchTree("kablo", "discovery"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.get).toHaveBeenCalledWith("/categories/search-tree", { params: { q: "kablo", catalog: "discovery" } });

    h.get.mockClear();
    h.get.mockResolvedValue({ data: [] });
    const ids = renderHook(() => useCategoriesByIds(["39121600"]), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(ids.result.current.isSuccess).toBe(true));
    expect(h.get).toHaveBeenCalledWith("/categories/by-ids", { params: { ids: "39121600" } });
  });

  it("inlineError: toast kapalı, 429 yeniden denenmez, isError görünür", async () => {
    h.get.mockRejectedValue(httpError(429));
    const search = renderHook(() => useCategorySearchTree("kablo", "full", { inlineError: true }), {
      wrapper: wrapperWithAppRetry(),
    });
    await waitFor(() => expect(search.result.current.isError).toBe(true));
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get).toHaveBeenCalledWith("/categories/search-tree", {
      params: { q: "kablo", catalog: "full" },
      skipErrorToast: true,
    });

    h.get.mockClear();
    const ids = renderHook(() => useCategoriesByIds(["39121600", "39000000"], { inlineError: true }), {
      wrapper: wrapperWithAppRetry(),
    });
    await waitFor(() => expect(ids.result.current.isError).toBe(true));
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get).toHaveBeenCalledWith("/categories/by-ids", {
      params: { ids: "39121600,39000000" },
      skipErrorToast: true,
    });
  });

  it("2 karakterin altında arama isteği atılmaz", () => {
    renderHook(() => useCategorySearchTree("b", "full", { inlineError: true }), { wrapper: wrapperWithAppRetry() });
    expect(h.get).not.toHaveBeenCalled();
  });
});

/**
 * GİZLİ KATEGORİ (2026-10-09, sahip kararı: "anasayfada olmayan kategori başka
 * yerde de gösterilmesin"; arayüz denetimi W-09). `by-ids` her kodu çözerdi;
 * kanca artık gizli bir önekin altındaki kodu SORMAZ ve cevapta gelse de
 * DÖNDÜRMEZ. Tüketicilerin hepsi (Ürünlerim tablosu, ürün formu parçacığı ve
 * AI isteği, ürün önizlemesi, talep "Genel Bilgi" sekmesi, talep formu AI
 * açıklaması, firma dizini süzgeç çipi) aynı kuralı buradan alır.
 *
 * 2026-10-10: 46 görünür sektördür; gizli olan silah / kolluk aileleri
 * (`46101500`) ve görünür 4618 ailesinin `461825` sınıfıdır (`46182501`).
 */
describe("useCategoriesByIds — gizli kategori kodu ad alamaz", () => {
  it("gizli kod isteğe girmez; görünür kodlar sırasıyla sorulur", async () => {
    h.get.mockResolvedValue({ data: [{ id: "39121600", code: "39121600", nameTr: "Devre kesiciler", level: 3, breadcrumb: "" }] });
    const { result } = renderHook(() => useCategoriesByIds(["46101500", "39121600", "10151500", "46182501"]), {
      wrapper: wrapperWithAppRetry(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get).toHaveBeenCalledWith("/categories/by-ids", { params: { ids: "39121600" } });
    expect(result.current.data?.map((c) => c.id)).toEqual(["39121600"]);
  });

  it("46 görünür: sektörün ve görünür dalının adı sorulur, satırı döner", async () => {
    h.get.mockResolvedValue({
      data: [
        { id: "46000000", code: "46000000", nameTr: "İş Güvenliği ve Yangın Ekipmanları", level: 1, breadcrumb: "" },
        { id: "46181500", code: "46181500", nameTr: "Koruyucu giysi", level: 3, breadcrumb: "" },
      ],
    });
    const { result } = renderHook(() => useCategoriesByIds(["46000000", "46181500", "46100000"]), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.get).toHaveBeenCalledWith("/categories/by-ids", { params: { ids: "46000000,46181500" } });
    expect(result.current.data?.map((c) => c.nameTr)).toEqual(["İş Güvenliği ve Yangın Ekipmanları", "Koruyucu giysi"]);
  });

  it("yalnız gizli kod: istek HİÇ atılmaz, veri yok, 'yükleniyor' da değil (asılı çip olmaz)", async () => {
    const { result } = renderHook(() => useCategoriesByIds(["46101500", "77101500"]), { wrapper: wrapperWithAppRetry() });
    // Bir tur bekle: etkin olmayan sorgu istek atmaz.
    await new Promise((r) => setTimeout(r, 20));
    expect(h.get).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("eski API gizli kodun satırını döndürse de kanca onu düşürür", async () => {
    h.get.mockResolvedValue({
      data: [
        { id: "39121600", code: "39121600", nameTr: "Devre kesiciler", level: 3, breadcrumb: "" },
        { id: "46101500", code: "46101500", nameTr: "Ateşli silahlar", level: 3, breadcrumb: "" },
      ],
    });
    const { result } = renderHook(() => useCategoriesByIds(["39121600"]), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((c) => c.nameTr)).toEqual(["Devre kesiciler"]);
  });

  it("gizli kod sorgu anahtarını değiştirmez: görünür küme aynıysa aynı önbellek girdisi (ek istek yok)", async () => {
    h.get.mockResolvedValue({ data: [{ id: "39121600", code: "39121600", nameTr: "Devre kesiciler", level: 3, breadcrumb: "" }] });
    const wrapper = wrapperWithAppRetry();
    const first = renderHook(() => useCategoriesByIds(["39121600"]), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const second = renderHook(() => useCategoriesByIds(["46101500", "39121600"]), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(callsTo("/categories/by-ids")).toBe(1);
  });
});

/**
 * GİZLİ DAL, GÖRÜNÜR SEKTÖR (2026-10-10, sahip kararı). 46 "İş Güvenliği ve
 * Yangın Ekipmanları" seçilebilir; silah ve kolluk dalları (aile `4610…4615`,
 * `4620`, `4622` ve görünür 4618 ailesinin `461825` sınıfı) seçicide HİÇ
 * listelenmez — satırı olmayan dal işaretlenemez. API aynı süzgeci uygular;
 * kancalar ikinci kattır (eski yanıt, önbellek).
 */
describe("kategori ağacı — görünür sektörün gizli dalları listelenmez", () => {
  const node = (id: string, nameTr: string, level: number, parentId: string | null, childCount = 1) => ({
    id,
    code: id,
    nameTr,
    level,
    parentId,
    childCount,
  });

  it("46 açılınca aileler: görünür beşi listelenir, gizli sekizi satır olmaz", async () => {
    const families = ["4610", "4611", "4612", "4613", "4614", "4615", "4616", "4617", "4618", "4619", "4620", "4621", "4622"].map((p) =>
      node(`${p}0000`, `Aile ${p}`, 2, "46000000"),
    );
    h.get.mockResolvedValue({ data: [node("46000000", "İş Güvenliği ve Yangın Ekipmanları", 1, null, 5), ...families, node("31160000", "Hırdavat", 2, "31000000")] });
    const { result } = renderHook(() => useChildren("46000000", 1, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((c) => c.id)).toEqual(["46160000", "46170000", "46180000", "46190000", "46210000"]);
  });

  it("4618 açılınca sınıflar: 461825 (kişisel güvenlik cihazları veya silahları) listelenmez", async () => {
    h.get.mockImplementation(async (url: string) =>
      url === "/categories/children"
        ? {
            data: [
              node("46181500", "Koruyucu giysi", 3, "46180000"),
              node("46182500", "Kişisel güvenlik cihazları veya silahları", 3, "46180000"),
              node("46181700", "Yüz ve baş koruması", 3, "46180000"),
            ],
          }
        : { data: [] },
    );
    const { result } = renderHook(() => useChildren("46180000", 2, "discovery"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((c) => c.nameTr)).toEqual(["Koruyucu giysi", "Yüz ve baş koruması"]);
  });

  it("gizli satır yoksa liste aynen döner (görünür sektörde süzgeç bir şey düşürmez)", async () => {
    h.get.mockImplementation(async (url: string) =>
      url === "/categories/children" ? { data: [node("31161500", "Vidalar", 3, "31160000"), node("31161700", "Somunlar", 3, "31160000")] } : { data: [] },
    );
    const { result } = renderHook(() => useChildren("31160000", 2, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
  });
});

describe("useCategorySearchTree — arama ağacından gizli dallar budanır", () => {
  const commodity = (id: string, nameTr: string) => ({ id, code: id, nameTr, level: 4, isMatch: true });
  const cls = (id: string, nameTr: string, commodities: ReturnType<typeof commodity>[] = []) => ({
    id,
    code: id,
    nameTr,
    level: 3,
    isMatch: true,
    commodities,
  });

  it("gizli sektör, 46'nın gizli ailesi ve 4618'in gizli sınıfı sonuçta yok; görünür dallar yerinde", async () => {
    h.get.mockResolvedValue({
      data: {
        truncated: false,
        segments: [
          {
            id: "46000000",
            code: "46000000",
            nameTr: "İş Güvenliği ve Yangın Ekipmanları",
            level: 1,
            segmentLetter: null,
            families: [
              { id: "46100000", code: "46100000", nameTr: "Hafif silahlar ve mühimmat", level: 2, classes: [cls("46101500", "Ateşli silahlar")] },
              {
                id: "46180000",
                code: "46180000",
                nameTr: "Kişisel koruyucu donanım",
                level: 2,
                classes: [
                  cls("46181500", "Koruyucu giysi", [commodity("46181504", "Koruyucu eldiven")]),
                  cls("46182500", "Kişisel güvenlik cihazları veya silahları", [commodity("46182501", "Biber gazı")]),
                ],
              },
            ],
          },
          { id: "77000000", code: "77000000", nameTr: "Çevre Hizmetleri", level: 1, segmentLetter: null, families: [] },
        ],
      },
    });
    const { result } = renderHook(() => useCategorySearchTree("koruyucu", "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const tree = result.current.data!;
    expect(tree.truncated).toBe(false);
    expect(tree.segments.map((s) => s.id)).toEqual(["46000000"]);
    expect(tree.segments[0]!.families.map((f) => f.id)).toEqual(["46180000"]);
    expect(tree.segments[0]!.families[0]!.classes.map((c) => c.id)).toEqual(["46181500"]);
    expect(tree.segments[0]!.families[0]!.classes[0]!.commodities.map((c) => c.id)).toEqual(["46181504"]);
    expect(JSON.stringify(tree)).not.toMatch(/silah|Biber|Çevre/);
  });

  // Eski API yanıtı: "silah" yalnız gizli dallarda eşleşir. Gizli satırlar
  // budanınca geriye altı boş görünür aile (4618) ve sektör (46) kalırdı;
  // sektörün de işaretlenebildiği firma penceresi onları "silah" aramasının
  // sonucu diye çizerdi.
  it("yalnız gizli torunu eşleştiği için sonuçta olan görünür aile ve sektör de düşer", async () => {
    const family = (id: string, nameTr: string, classes: ReturnType<typeof cls>[], isMatch?: boolean) => ({
      id,
      code: id,
      nameTr,
      level: 2,
      classes,
      ...(isMatch === undefined ? {} : { isMatch }),
    });
    h.get.mockResolvedValue({
      data: {
        segments: [
          {
            id: "46000000",
            code: "46000000",
            nameTr: "İş Güvenliği ve Yangın Ekipmanları",
            level: 1,
            segmentLetter: null,
            families: [
              family("46100000", "Hafif silahlar ve mühimmat", [cls("46101500", "Ateşli silahlar")]),
              family("46180000", "Kişisel koruyucu donanım", [cls("46182500", "Kişisel güvenlik cihazları veya silahları")]),
            ],
          },
          { id: "31000000", code: "31000000", nameTr: "Üretim Bileşenleri", level: 1, segmentLetter: null, families: [] },
        ],
      },
    });
    const { result } = renderHook(() => useCategorySearchTree("silah", "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // 46 düşer (budama boşalttı); altı baştan boş gelen sektöre dokunulmaz.
    expect(result.current.data!.segments.map((s) => s.id)).toEqual(["31000000"]);
    expect(JSON.stringify(result.current.data)).not.toMatch(/İş Güvenliği|koruyucu|silah/);
  });

  it("KENDİ adı eşleşen aile ve sektör kalır; yalnız gizli sınıfı düşer", async () => {
    h.get.mockResolvedValue({
      data: {
        segments: [
          {
            id: "46000000",
            code: "46000000",
            nameTr: "İş Güvenliği ve Yangın Ekipmanları",
            level: 1,
            segmentLetter: null,
            isMatch: true,
            families: [
              { id: "46150000", code: "46150000", nameTr: "Kolluk ekipmanları", level: 2, classes: [cls("46151600", "Kalabalık kontrol ekipmanı")] },
              {
                id: "46180000",
                code: "46180000",
                nameTr: "Kişisel koruyucu donanım",
                level: 2,
                isMatch: true,
                classes: [cls("46182500", "Kişisel güvenlik cihazları veya silahları")],
              },
            ],
          },
        ],
      },
    });
    const { result } = renderHook(() => useCategorySearchTree("güvenlik", "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [sector] = result.current.data!.segments;
    expect(sector!.id).toBe("46000000");
    expect(sector!.families.map((f) => f.id)).toEqual(["46180000"]);
    expect(sector!.families[0]!.classes).toEqual([]);
  });

  it("gizli satır yoksa yanıt AYNI nesnedir (gereksiz kopya yok)", async () => {
    const data = { segments: [{ id: "31000000", code: "31000000", nameTr: "Üretim Bileşenleri", level: 1, segmentLetter: null, families: [] }] };
    h.get.mockResolvedValue({ data });
    const { result } = renderHook(() => useCategorySearchTree("vida", "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(data);
  });
});
