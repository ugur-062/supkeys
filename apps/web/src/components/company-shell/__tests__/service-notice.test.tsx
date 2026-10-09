// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isServiceUnreachable,
  registerServiceProbe,
  reportServiceReachable,
  resetServiceHealthForTests,
  suspectServiceOutage,
} from "@/lib/company-auth/service-health";
import {
  SERVICE_RECHECK_DELAYS_MS,
  SERVICE_SLOW_AFTER_MS,
  ServiceNotice,
  isUnreachableError,
  type MeQueryState,
} from "../service-notice";

/**
 * PANEL: API yanıt vermezken iskelet MESAJSIZ kalmaz (2026-10-08, staging
 * kesintisi). Reddedilen bağlantıda ~8 sn, asılı bağlantıda (uyuyan API)
 * dakikalarca yalnız gri kutular görünüyordu.
 */
const networkError = { message: "Network Error" };
const httpError = (status: number) => ({ response: { status } });

const base: MeQueryState = {
  isError: false,
  isSuccess: false,
  isFetching: true,
  error: null,
  failureCount: 0,
  failureReason: null,
  refetch: vi.fn(),
};

/** Sağlık yoklaması (`companyApi`nin `/me` çağrısının yerine). */
const probe = vi.fn<() => Promise<unknown>>();

let client: QueryClient;
let refetchQueries: ReturnType<typeof vi.spyOn>;
const view = (me: Partial<MeQueryState>, pending: boolean) => (
  <QueryClientProvider client={client}>
    <ServiceNotice me={{ ...base, ...me }} pending={pending} />
  </QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient();
  refetchQueries = vi.spyOn(client, "refetchQueries").mockResolvedValue(undefined);
  vi.mocked(base.refetch).mockClear();
  resetServiceHealthForTests();
  probe.mockReset().mockResolvedValue({ status: 200 });
  registerServiceProbe(probe);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("isUnreachableError", () => {
  it("yanıt yok (ağ / zaman aşımı) ve 5xx ulaşılamazdır; 4xx değildir", () => {
    expect(isUnreachableError(networkError)).toBe(true);
    expect(isUnreachableError(httpError(502))).toBe(true);
    expect(isUnreachableError(httpError(503))).toBe(true);
    expect(isUnreachableError(httpError(401))).toBe(false);
    expect(isUnreachableError(httpError(403))).toBe(false);
    expect(isUnreachableError(httpError(429))).toBe(false);
    expect(isUnreachableError(null)).toBe(false);
  });
});

describe("ServiceNotice — ilk yükleme (içerik /me'yi bekliyor)", () => {
  it("hızlı yanıtta hiç görünmez", async () => {
    const screenView = render(view({}, true));
    await advance(SERVICE_SLOW_AFTER_MS - 500);
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    screenView.rerender(view({ isSuccess: true, isFetching: false }, false));
    await advance(60_000);
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
  });

  it("asılı bağlantı: hata sayacı artmasa da birkaç saniye sonra not + Tekrar dene çıkar", async () => {
    render(view({}, true));
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    await advance(SERVICE_SLOW_AFTER_MS + 100);
    expect(screen.getByRole("status")).toHaveTextContent("Sunucuya şu anda ulaşılamıyor");
    expect(screen.getByRole("status")).toHaveTextContent("Yeniden deneniyor…");
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
    // İçerik henüz çizilmedi → "bilgiler güncel olmayabilir" denmez.
    expect(screen.getByRole("status")).not.toHaveTextContent("güncel olmayabilir");
  });

  it("reddedilen bağlantı: ilk başarısız denemede hemen çıkar (8 sn sessiz iskelet yok)", () => {
    render(view({ failureCount: 1, failureReason: networkError }, true));
    expect(screen.getByRole("status")).toHaveTextContent("Sunucuya şu anda ulaşılamıyor");
  });

  it("yetki/oturum hatasında (4xx) çıkmaz", () => {
    render(view({ failureCount: 1, failureReason: httpError(403) }, true));
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
  });
});

describe("ServiceNotice — /me kesin hatada (içerik anlık görüntüyle çizildi)", () => {
  const down = { isError: true, isFetching: false, error: networkError, failureCount: 4, failureReason: networkError };

  it("not üstte kalır ve bilgilerin güncel olmayabileceğini söyler", () => {
    render(view(down, false));
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Sunucuya şu anda ulaşılamıyor");
    expect(notice).toHaveTextContent("Bağlantı kısa süre içinde kendiliğinden yeniden denenecek.");
    expect(notice).toHaveTextContent("Ekrandaki bilgiler güncel olmayabilir.");
  });

  it("büyüyen aralıklarla /me'yi yeniden yoklar, birkaç denemeden sonra DURUR", async () => {
    const screenView = render(view(down, false));
    for (let i = 0; i < SERVICE_RECHECK_DELAYS_MS.length; i++) {
      await advance(SERVICE_RECHECK_DELAYS_MS[i] - 100);
      expect(base.refetch).toHaveBeenCalledTimes(i);
      await advance(200);
      expect(base.refetch).toHaveBeenCalledTimes(i + 1);
      // Yoklama sürüyor → bitti (yine hata).
      screenView.rerender(view({ ...down, isFetching: true }, false));
      expect(screen.getByRole("status")).toHaveTextContent("Yeniden deneniyor…");
      screenView.rerender(view(down, false));
    }
    expect(SERVICE_RECHECK_DELAYS_MS.every((ms, i, all) => i === 0 || ms > all[i - 1])).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Otomatik denemeler durdu.");
    await advance(30 * 60_000);
    expect(base.refetch).toHaveBeenCalledTimes(SERVICE_RECHECK_DELAYS_MS.length);
  });

  it("yoklama sürerken not KAYBOLMAZ (hiç başarılı olmamış sorgu yoklanırken 'pending'e döner)", () => {
    const screenView = render(view(down, false));
    // TanStack Query: verisi olmayan sorgu yeniden çekilirken status=pending, error=null.
    screenView.rerender(view({ isError: false, isSuccess: false, isFetching: true, error: null, failureCount: 0, failureReason: null }, false));
    expect(screen.getByRole("status")).toHaveTextContent("Sunucuya şu anda ulaşılamıyor");
    expect(screen.getByRole("status")).toHaveTextContent("Yeniden deneniyor…");
    // Yoklama yine düştü → not yerinde; başarı gelince kapanır ve sayfa toparlanır.
    screenView.rerender(view(down, false));
    expect(screen.getByTestId("service-notice")).toBeInTheDocument();
    expect(refetchQueries).not.toHaveBeenCalled();
    screenView.rerender(view({ isSuccess: true, isFetching: false }, false));
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    expect(refetchQueries).toHaveBeenCalledTimes(1);
  });

  it("kesintiden sonra yoklama yetki hatasıyla (403) dönerse not kapanır", () => {
    const screenView = render(view(down, false));
    screenView.rerender(view({ isError: true, isFetching: false, error: httpError(403) }, false));
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
  });

  it("gizli sekmede yoklamaz; görünür olunca yoklar", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(view(down, false));
    await advance(SERVICE_RECHECK_DELAYS_MS[0] + 60_000);
    expect(base.refetch).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(base.refetch).toHaveBeenCalledTimes(1);
  });

  it("Tekrar dene: başarılı olmayan bütün etkin sorguları (bekleyen + hatalı) yeniden çeker", async () => {
    render(view(down, false));
    vi.useRealTimers();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetchQueries).toHaveBeenCalledTimes(1);
    const filters = refetchQueries.mock.calls[0][0] as { type: string; predicate: (q: { state: { status: string } }) => boolean };
    expect(filters.type).toBe("active");
    expect(filters.predicate({ state: { status: "error" } })).toBe(true);
    expect(filters.predicate({ state: { status: "pending" } })).toBe(true);
    expect(filters.predicate({ state: { status: "success" } })).toBe(false);
  });

  it("API döndü: not kapanır ve hataya düşmüş etkin sorgular kendiliğinden yeniden çekilir", async () => {
    const screenView = render(view(down, false));
    expect(screen.getByTestId("service-notice")).toBeInTheDocument();
    screenView.rerender(view({ isSuccess: true, isFetching: false }, false));
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    expect(refetchQueries).toHaveBeenCalledTimes(1);
    const filters = refetchQueries.mock.calls[0][0] as { type: string; predicate: (q: { state: { status: string } }) => boolean };
    expect(filters.type).toBe("active");
    expect(filters.predicate({ state: { status: "error" } })).toBe(true);
    expect(filters.predicate({ state: { status: "success" } })).toBe(false);
    // Sorunsuz açılışta (not hiç görünmedi) toplu yeniden çekme YOK.
    refetchQueries.mockClear();
    render(view({ isSuccess: true, isFetching: false }, false));
    expect(refetchQueries).not.toHaveBeenCalled();
  });

  it("yetki hatasıyla (403) düşen /me kesinti sayılmaz — not yok, yoklama yok", async () => {
    render(view({ isError: true, isFetching: false, error: httpError(403) }, false));
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    await advance(5 * 60_000);
    expect(base.refetch).not.toHaveBeenCalled();
  });
});

/**
 * AÇIK OTURUM (canlı doğrulama OUT-1, HIGH): panel açıkken API giderse not HİÇ
 * çıkmıyordu — görünürlük yalnız kabuğun `/me` sorgusundan türüyordu ve o sorgu
 * sayfa yüklemesinde bir kez koşuyor (`/me` kesintiden sonra 0 kez soruldu).
 * Kullanıcı "Bir şeyler ters gitti" kartı ya da bitmeyen iskelet görüyor, API
 * dönünce hiçbir şey kendiliğinden toparlanmıyordu. Not artık panelin
 * isteklerinin yaşadığını dinler (`service-health.ts`).
 */
describe("ServiceNotice — açık oturum (panelin istekleri kesinti yaşıyor)", () => {
  /** Panel açık: `/me` yüklemede başarıyla geldi, içerik çizili. */
  const open = { isSuccess: true, isFetching: false };
  /** Panelin bir isteği kesinti belirtisi gösterdi (interceptor'ın bildirdiği şey). */
  const requestFailed = () =>
    act(async () => {
      await suspectServiceOutage();
    });

  it("bir istek düştü ve `/me` yoklaması da düştü → not çıkar (yenileme gerekmeden)", async () => {
    probe.mockRejectedValue(networkError);
    render(view(open, false));
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    await requestFailed();
    expect(probe).toHaveBeenCalledTimes(1);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Sunucuya şu anda ulaşılamıyor");
    expect(notice).toHaveTextContent("Bağlantı kısa süre içinde kendiliğinden yeniden denenecek.");
    expect(notice).toHaveTextContent("Ekrandaki bilgiler güncel olmayabilir.");
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });

  it("yoklama yanıt aldıysa (tek uç arızalı, 4xx) not ÇIKMAZ", async () => {
    render(view(open, false));
    await requestFailed();
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    probe.mockRejectedValue(httpError(403));
    await requestFailed();
    expect(probe).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
  });

  it("not çıkınca aynı yeniden yoklama takvimi işler (10 · 20 · 40 · 60 sn), sonra DURUR", async () => {
    probe.mockRejectedValue(networkError);
    const screenView = render(view(open, false));
    await requestFailed();
    const failed = { isError: true, isSuccess: false, isFetching: false, error: networkError };
    for (let i = 0; i < SERVICE_RECHECK_DELAYS_MS.length; i++) {
      await advance(SERVICE_RECHECK_DELAYS_MS[i] - 100);
      expect(base.refetch).toHaveBeenCalledTimes(i);
      await advance(200);
      expect(base.refetch).toHaveBeenCalledTimes(i + 1);
      // Yoklama sürüyor → yine düştü (verisi olan sorgu "error"da kalır).
      screenView.rerender(view({ ...failed, isFetching: true }, false));
      expect(screen.getByRole("status")).toHaveTextContent("Yeniden deneniyor…");
      screenView.rerender(view(failed, false));
    }
    expect(screen.getByRole("status")).toHaveTextContent("Otomatik denemeler durdu.");
    await advance(30 * 60_000);
    expect(base.refetch).toHaveBeenCalledTimes(SERVICE_RECHECK_DELAYS_MS.length);
    // Takvim yoklamaları `/me` sorgusuyla yapılır; sağlık yoklaması tek kaldı.
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("API döndü (bir istek yanıt aldı): not kapanır, hatadaki etkin sorgular kendiliğinden yeniden çekilir", async () => {
    probe.mockRejectedValue(networkError);
    render(view(open, false));
    await requestFailed();
    expect(screen.getByTestId("service-notice")).toBeInTheDocument();
    expect(refetchQueries).not.toHaveBeenCalled();
    act(() => reportServiceReachable());
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    expect(refetchQueries).toHaveBeenCalledTimes(1);
    const filters = refetchQueries.mock.calls[0][0] as { type: string; predicate: (q: { state: { status: string } }) => boolean };
    expect(filters.type).toBe("active");
    expect(filters.predicate({ state: { status: "error" } })).toBe(true);
    expect(filters.predicate({ state: { status: "success" } })).toBe(false);
    // Toparlandıktan sonra takvim yoklaması kalmaz.
    await advance(10 * 60_000);
    expect(base.refetch).not.toHaveBeenCalled();
  });

  it("sinyal temizlendi ama `/me` önceki yoklamadan hatada → takvimi beklemeden hemen yeniden sorulur; başarıyla not kapanır", async () => {
    probe.mockRejectedValue(networkError);
    const screenView = render(view(open, false));
    await requestFailed();
    await advance(SERVICE_RECHECK_DELAYS_MS[0] + 100);
    expect(base.refetch).toHaveBeenCalledTimes(1);
    const failed = { isError: true, isSuccess: false, isFetching: false, error: networkError };
    screenView.rerender(view(failed, false));
    // Kullanıcı gezindi, bir sorgu yanıt aldı: API ayakta.
    act(() => reportServiceReachable());
    expect(base.refetch).toHaveBeenCalledTimes(2);
    // `/me` henüz dönmedi → not yerinde, toplu yeniden çekme yok.
    expect(screen.getByTestId("service-notice")).toBeInTheDocument();
    expect(refetchQueries).not.toHaveBeenCalled();
    screenView.rerender(view(open, false));
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    expect(refetchQueries).toHaveBeenCalledTimes(1);
  });

  it("gizli sekmede takvim yoklamaz; görünür olunca yoklar", async () => {
    probe.mockRejectedValue(networkError);
    render(view(open, false));
    await requestFailed();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await advance(SERVICE_RECHECK_DELAYS_MS[0] + 60_000);
    expect(base.refetch).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(base.refetch).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it("Tekrar dene: hatalı sorgular + `/me` (açık oturumda 'başarılı' göründüğü için süzgeç onu atlar)", async () => {
    probe.mockRejectedValue(networkError);
    render(view(open, false));
    await requestFailed();
    vi.useRealTimers();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetchQueries).toHaveBeenCalledTimes(1);
    expect(base.refetch).toHaveBeenCalledTimes(1);
  });

  it("not kalkınca (kabuk söküldü) durum unutulur", async () => {
    probe.mockRejectedValue(networkError);
    const screenView = render(view(open, false));
    await requestFailed();
    expect(isServiceUnreachable()).toBe(true);
    screenView.unmount();
    expect(isServiceUnreachable()).toBe(false);
  });
});
