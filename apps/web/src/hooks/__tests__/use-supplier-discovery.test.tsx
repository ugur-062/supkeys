// @vitest-environment jsdom
/**
 * "AI ile tedarikçi bul" penceresinin iki isteği (canlı doğrulama turu 2026-10-09):
 *  - Web araması: yanıt `{ companies, incompleteScopes }` — bir geçiş (yurt içi /
 *    yurt dışı) yanıt vermediyse uç hata dönmez, eksik geçişi listeler. Alanı
 *    tanımayan eski API'de boş sayılır. İstek genel hata toast'ını KAPATIR
 *    (pencere hatayı kendi gövdesinde tek mesajla gösterir — D7).
 *  - Eksik geçişin NEDENİ (`incompleteReasons`) ve bütçe reddinin metni
 *    (`incompleteMessages`) yanıttan okunur; istekte `scopes` yalnız o geçişleri
 *    aratır. Nedenleri taşımayan eski API `scopes` alanını da tanımaz
 *    (`supportsScopes: false`).
 *  - Davet gönderimi: başarıda talep sayfasındaki e-posta davetleri listesinin
 *    sorguları düşürülür (pencerede gönderilen davet sayfada hemen görünsün).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: vi.fn(), post: h.post } }));

import {
  LISTING_EMAIL_INVITES_KEY,
  useExternalSupplierDiscovery,
  useExternalTenderInvite,
} from "../use-supplier-discovery";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
  return { qc, wrapper };
}

beforeEach(() => {
  h.post.mockReset();
});

describe("useExternalSupplierDiscovery — web araması", () => {
  it("adaylar ve yanıt vermeyen geçişler yanıttan okunur; istek genel hata toast'ını kapatır", async () => {
    const companies = [{ name: "Yerli A.Ş.", city: null, website: null, email: "a@yerli.com", reason: "r", scope: "LOCAL" }];
    h.post.mockResolvedValue({ data: { companies, incompleteScopes: ["ABROAD"], searchedScopes: ["LOCAL", "ABROAD"] } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useExternalSupplierDiscovery(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync({ type: "ALIM", itemNames: ["Rulman"], listingId: "l1" });
    });
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
    expect(url).toBe("/company/ai/supplier-discovery/external");
    expect(body).toEqual({ type: "ALIM", itemNames: ["Rulman"], listingId: "l1" });
    // Tam arama: gövdede `scopes` anahtarı hiç yok (eski API alanı 400 ile reddeder).
    expect(body).not.toHaveProperty("scopes");
    expect(config).toMatchObject({ skipErrorToast: true });
    // Ücretli aramayı yanıt yoldayken istemci kesmesin: 1,5 dk'dan uzun bekler.
    expect(config.timeout).toBeGreaterThanOrEqual(120_000);
  });

  it("eski API (alan yok) → eksik geçiş yok; tanınmayan değer süzülür", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useExternalSupplierDiscovery(), { wrapper });
    h.post.mockResolvedValueOnce({ data: { companies: [] } });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync({ type: "ALIM" });
    });
    const olderApi = { incompleteReasons: {}, incompleteMessages: {}, supportsScopes: false };
    expect(res).toEqual({ companies: [], incompleteScopes: [], ...olderApi });
    h.post.mockResolvedValueOnce({ data: { companies: [], incompleteScopes: ["ABROAD", null, "MARS", "LOCAL", "ABROAD"] } });
    await act(async () => {
      res = await result.current.mutateAsync({ type: "ALIM" });
    });
    expect(res).toEqual({ companies: [], incompleteScopes: ["LOCAL", "ABROAD"], ...olderApi });
    // Alan var ama nesne değil (dizi / null) → yine "nedenleri bildirmiyor".
    for (const incompleteReasons of [null, ["TIMEOUT"], "TIMEOUT"]) {
      h.post.mockResolvedValueOnce({ data: { companies: [], incompleteScopes: ["ABROAD"], incompleteReasons } });
      await act(async () => {
        res = await result.current.mutateAsync({ type: "ALIM" });
      });
      expect(res).toEqual({ companies: [], incompleteScopes: ["ABROAD"], ...olderApi });
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
    const { wrapper } = setup();
    const { result } = renderHook(() => useExternalSupplierDiscovery(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync({ type: "ALIM" });
    });
    expect(res).toEqual({
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
      await act(async () => {
        res = await result.current.mutateAsync({ type: "ALIM" });
      });
      expect(res).toMatchObject({ incompleteScopes: ["LOCAL"], incompleteReasons: { LOCAL: reason }, incompleteMessages: {} });
    }
    // Tam yanıt (eksik yok): uç yine yeni — boş nesneler de "alan var" demektir.
    h.post.mockResolvedValueOnce({ data: { companies: [], incompleteScopes: [], incompleteReasons: {}, incompleteMessages: {} } });
    await act(async () => {
      res = await result.current.mutateAsync({ type: "ALIM" });
    });
    expect(res).toEqual({ companies: [], incompleteScopes: [], incompleteReasons: {}, incompleteMessages: {}, supportsScopes: true });
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
    const { wrapper } = setup();
    const { result } = renderHook(() => useExternalSupplierDiscovery(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync({ type: "ALIM" });
    });
    expect(res).toEqual({
      companies: [],
      incompleteScopes: ["LOCAL"],
      incompleteReasons: {},
      incompleteMessages: {},
      supportsScopes: true,
    });
  });

  it("`scopes`: yalnız istenen geçişler gövdeye girer (geçerli, tekil); boş / geçersiz liste alanı hiç göndermez", async () => {
    h.post.mockResolvedValue({ data: { companies: [], incompleteScopes: [], incompleteReasons: {}, incompleteMessages: {} } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useExternalSupplierDiscovery(), { wrapper });
    const bodyOf = async (scopes: unknown) => {
      h.post.mockClear();
      await act(async () => {
        await result.current.mutateAsync({ type: "ALIM", listingId: "l1", region: "Ege", scopes: scopes as never });
      });
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
    const error = { isAxiosError: true, response: { status: 503, data: { message: "timeout" } } };
    h.post.mockRejectedValue(error);
    const { wrapper } = setup();
    const { result } = renderHook(() => useExternalSupplierDiscovery(), { wrapper });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync({ type: "ALIM" }).catch((e) => {
        caught = e;
      });
    });
    expect(caught).toBe(error);
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
