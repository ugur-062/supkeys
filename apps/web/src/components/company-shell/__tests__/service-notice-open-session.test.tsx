// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: vi.fn(), warning: vi.fn() } }));

import { companyApi } from "@/lib/company-auth/api";
import { SERVICE_PROBE_TIMEOUT_MS, SERVICE_SLOW_AFTER_MS, resetServiceHealthForTests } from "@/lib/company-auth/service-health";
import { SERVICE_RECHECK_DELAYS_MS, ServiceNotice } from "../service-notice";

/**
 * UÇTAN UCA — AÇIK OTURUMDA KESİNTİ (canlı doğrulama OUT-1, HIGH).
 *
 * Gerçek `companyApi` (interceptor'lar) + gerçek sağlık sinyali + gerçek not +
 * gerçek TanStack Query; yalnız ağ katmanı sahte. Senaryo sahibin yaşadığıdır:
 * panel açık, API gidiyor (kapalı ya da uyuyor), kullanıcı sayfayı yenilemiyor.
 * Eskiden: `/me` 0 kez soruldu, not hiç çıkmadı, API dönünce hata kartı kaldı.
 */
type Mode = "up" | "refused" | "asleep" | "forbidden";
let mode: Mode;
let calls: string[];
let asleep: Array<() => void>;
const callsTo = (url: string) => calls.filter((u) => u === url).length;

const ok = (config: InternalAxiosRequestConfig): AxiosResponse => ({
  data: config.url === "/company-auth/me" ? { user: { id: "u1" } } : { total: 3 },
  status: 200,
  statusText: "OK",
  headers: {},
  config,
});

const adapter: AxiosAdapter = (config) => {
  calls.push(config.url ?? "");
  if (mode === "up") return Promise.resolve(ok(config));
  if (mode === "refused") return Promise.reject(new AxiosError("Network Error", AxiosError.ERR_NETWORK, config));
  if (mode === "forbidden") {
    const response = { data: { message: "Yetkiniz yok" }, status: 403, statusText: "", headers: {}, config };
    return Promise.reject(new AxiosError("Request failed", AxiosError.ERR_BAD_REQUEST, config, null, response));
  }
  // Uyuyan API: bağlantı asılı kalır; uyanınca bekleyen isteği yanıtlar.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new AxiosError(`timeout of ${config.timeout}ms exceeded`, AxiosError.ECONNABORTED, config)),
      config.timeout ?? 45_000,
    );
    asleep.push(() => {
      clearTimeout(timer);
      resolve(ok(config));
    });
  });
};

function Panel() {
  const me = useQuery({
    queryKey: ["company-auth", "me"],
    queryFn: async () => (await companyApi.get("/company-auth/me")).data,
  });
  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: async () => (await companyApi.get<{ total: number }>("/company/orders")).data,
  });
  return (
    <div>
      <ServiceNotice me={me} pending={false} />
      <button type="button" onClick={() => void orders.refetch()}>
        siparişlere git
      </button>
      <p data-testid="orders">{orders.isError ? "Siparişler yüklenemedi" : orders.data ? `${orders.data.total} sipariş` : "yükleniyor"}</p>
    </div>
  );
}

const originalAdapter = companyApi.defaults.adapter;
beforeAll(() => {
  companyApi.defaults.adapter = adapter;
});
afterAll(() => {
  companyApi.defaults.adapter = originalAdapter;
});

beforeEach(() => {
  resetServiceHealthForTests();
  mode = "up";
  calls = [];
  asleep = [];
  h.toastError.mockClear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const openPanel = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false } } });
  render(
    <QueryClientProvider client={client}>
      <Panel />
    </QueryClientProvider>,
  );
  await advance(50);
  expect(screen.getByTestId("orders")).toHaveTextContent("3 sipariş");
  expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
  expect(callsTo("/company-auth/me")).toBe(1);
};

describe("açık oturumda kesinti — uçtan uca", () => {
  it("API kapandı (bağlantı reddediliyor): ilk düşen istekte not çıkar, API dönünce kendiliğinden toparlanır", async () => {
    await openPanel();

    mode = "refused";
    fireEvent.click(screen.getByRole("button", { name: "siparişlere git" }));
    await advance(50);
    // Tek `/me` yoklaması (yüklemedeki 1 + yoklama 1) ve not — yenileme yok.
    expect(callsTo("/company-auth/me")).toBe(2);
    expect(screen.getByRole("status")).toHaveTextContent("Sunucuya şu anda ulaşılamıyor");
    expect(screen.getByRole("status")).toHaveTextContent("Ekrandaki bilgiler güncel olmayabilir.");
    expect(screen.getByTestId("orders")).toHaveTextContent("Siparişler yüklenemedi");
    // Notun üstüne "internet bağlantınızı kontrol edin" toast'ı binmez (OUT-3).
    expect(h.toastError).not.toHaveBeenCalled();

    // Takvim: 10 sn sonra `/me` yeniden yoklanır — API hâlâ kapalı, not yerinde.
    await advance(SERVICE_RECHECK_DELAYS_MS[0] + 100);
    expect(callsTo("/company-auth/me")).toBe(3);
    expect(screen.getByTestId("service-notice")).toBeInTheDocument();

    // API döndü; sayfaya DOKUNULMADI. Sıradaki yoklama başarır → not kapanır,
    // hatadaki sipariş sorgusu kendiliğinden yeniden çekilir.
    mode = "up";
    const ordersBefore = callsTo("/company/orders");
    await advance(SERVICE_RECHECK_DELAYS_MS[1] + 100);
    expect(callsTo("/company-auth/me")).toBe(4);
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    expect(callsTo("/company/orders")).toBe(ordersBefore + 1);
    expect(screen.getByTestId("orders")).toHaveTextContent("3 sipariş");
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("API uyuyor (bağlantı asılı): hata gelmeden ~10 sn içinde not çıkar; API uyanınca kapanır", async () => {
    await openPanel();

    mode = "asleep";
    fireEvent.click(screen.getByRole("button", { name: "siparişlere git" }));
    await advance(SERVICE_SLOW_AFTER_MS - 500);
    expect(callsTo("/company-auth/me")).toBe(1);
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    // ~6 sn yanıtsız → tek yoklama; o da yanıtsız kalınca not.
    await advance(1_000);
    expect(callsTo("/company-auth/me")).toBe(2);
    await advance(SERVICE_PROBE_TIMEOUT_MS + 100);
    expect(screen.getByRole("status")).toHaveTextContent("Sunucuya şu anda ulaşılamıyor");

    // API uyandı: asılı istek yanıtlanır → not kapanır (yoklama takvimi beklenmez).
    mode = "up";
    await act(async () => {
      for (const wake of asleep) wake();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
    expect(screen.getByTestId("orders")).toHaveTextContent("3 sipariş");
  });

  it("4xx (yetki) notu tetiklemez, `/me` yoklanmaz", async () => {
    await openPanel();
    mode = "forbidden";
    fireEvent.click(screen.getByRole("button", { name: "siparişlere git" }));
    await advance(60_000);
    expect(callsTo("/company-auth/me")).toBe(1);
    expect(screen.queryByTestId("service-notice")).not.toBeInTheDocument();
  });
});
