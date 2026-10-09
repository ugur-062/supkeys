// @vitest-environment jsdom
/**
 * TALEPLERİM — liste durumları (canlı doğrulama 2026-10-09, OUTR-2 / OUTR-5).
 *
 * GERÇEK `useTenders` kancası + gerçek QueryClient; yalnız `companyApi` sahte.
 * 500'den fazla talebi olan hesapta kesinti "Tüm Durumlar (0)" ve "0 satın alma
 * talebi" diye okunuyordu; açık sayfada 15 sn'lik yoklama düşünce de satırlar
 * "Veri alınamadı."ya dönüyor, sayaç ve sayfalama gerçek sayıyı göstermeye
 * devam ediyordu.
 */
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenderListItem } from "@/hooks/use-company-tenders";

const h = vi.hoisted(() => ({ get: vi.fn<(url: string) => Promise<{ data: unknown }>>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/company/satinalma/taleplerim",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1" }, company: { tier: "GOLD" } }),
  useHasCompanyPermission: () => true,
}));
vi.mock("@/components/ihale/IhaleItemsPanel", () => ({
  IhaleItemsPanel: () => <div data-testid="items-panel" />,
}));

import { IhalelerView } from "../ihaleler-view";

const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });

const row = (id: string, title: string, status: string) =>
  ({
    id,
    tenderNumber: `ROT-${id}`,
    title,
    type: "ALIM",
    format: null,
    status,
    isInternational: false,
    targetCountries: [],
    categoryIds: [],
    categories: [],
    extraCategoryCount: 0,
    createdById: "u1",
    createdBy: { firstName: "Ada", lastName: "Yılmaz" },
    invitationCount: 0,
    bidCount: 0,
    publishedAt: "2026-09-20T09:00:00.000Z",
    bidsCloseAt: "2026-12-01T09:00:00.000Z",
    createdAt: "2026-09-19T09:00:00.000Z",
  }) as unknown as TenderListItem;

const apiUp = (rows: TenderListItem[]) => h.get.mockResolvedValue({ data: rows });
const apiDown = () => h.get.mockRejectedValue(networkError);

let client: QueryClient;
const view = () =>
  render(
    <QueryClientProvider client={client}>
      <IhalelerView />
    </QueryClientProvider>,
  );

const statusButton = () => screen.getByRole("button", { name: "Durum filtresi" });
/** Okunamayan listenin sıfır / "yok" diye yansıdığı metinler. */
const expectNoFalseZero = () => {
  expect(document.body.textContent).not.toMatch(/\(0\)/);
  expect(screen.queryByText(/satın alma talebi$/)).toBeNull();
  expect(screen.queryByText("Henüz satın alma talebi yok.")).toBeNull();
  expect(screen.queryByText("Eşleşen satın alma talebi yok.")).toBeNull();
};

beforeEach(() => {
  h.get.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.replaceState(null, "", "/company/satinalma/taleplerim");
});
afterEach(() => {
  onlineManager.setOnline(true);
  client.clear();
  window.history.replaceState(null, "", "/");
});

describe("IhalelerView — kesinti (OUTR-2)", () => {
  it("liste okunamadıysa 'Tüm Durumlar (0)' ve '0 satın alma talebi' YOK; hata kartı + Tekrar dene", async () => {
    apiDown();
    view();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Veri alınamadı.");
    expect(statusButton()).toHaveTextContent(/^Tüm Durumlar$/);
    expectNoFalseZero();

    // Durum seçenekleri de sayaçsız (eskiden her biri "(0)" taşıyordu).
    await userEvent.setup().click(statusButton());
    const options = await screen.findAllByRole("option");
    expect(options.length).toBeGreaterThan(3);
    for (const option of options) expect(option.textContent).not.toMatch(/\(\d+\)/);
  });

  it("süzgeçle açılan adreste (KPI drill-down) kesinti 'Eşleşen satın alma talebi yok'a dönmez", async () => {
    window.history.replaceState(null, "", "/company/satinalma/taleplerim?status=OPEN");
    apiDown();
    view();
    await screen.findByRole("alert");
    expectNoFalseZero();
    expect(screen.queryByRole("button", { name: "Filtreleri temizle" })).toBeNull();
  });

  it("'Tekrar dene' listeyi yeniden ister; API dönünce gerçek sayılar gelir", async () => {
    apiDown();
    view();
    await screen.findByRole("alert");
    apiUp([row("1", "Çelik boru alımı", "AWARDED"), row("2", "Kablo alımı", "OPEN")]);
    await userEvent.setup().click(within(screen.getByRole("alert")).getByRole("button", { name: "Tekrar dene" }));
    await waitFor(() => expect(statusButton()).toHaveTextContent("Tüm Durumlar (2)"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByText(/Kablo alımı/).length).toBeGreaterThan(0);
  });
});

describe("IhalelerView — yanıt beklenirken", () => {
  it("çevrimdışı duraklayan sorgu (istek yok, hata yok, veri yok): sayaç yok, 'henüz talep yok' yok", async () => {
    onlineManager.setOnline(false);
    apiDown();
    const { container } = view();
    await act(async () => {});
    expect(h.get).not.toHaveBeenCalled();
    expect(statusButton()).toHaveTextContent(/^Tüm Durumlar$/);
    expectNoFalseZero();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("başarılı ve BOŞ yanıt: sayı gerçekten 0'dır ve 'henüz talep yok' çizilir", async () => {
    apiUp([]);
    view();
    expect(await screen.findByText("Henüz satın alma talebi yok.")).toBeInTheDocument();
    expect(statusButton()).toHaveTextContent("Tüm Durumlar (0)");
  });
});

describe("IhalelerView — arka plan yoklaması düşünce (OUTR-5)", () => {
  it("ekrandaki satırlar, 'Tüm Durumlar (N)' ve toplam kalır; 'Veri alınamadı' çıkmaz", async () => {
    apiUp([row("1", "Çelik boru alımı", "AWARDED"), row("2", "Kablo alımı", "OPEN")]);
    view();
    await waitFor(() => expect(statusButton()).toHaveTextContent("Tüm Durumlar (2)"));
    expect(screen.getAllByText(/Çelik boru alımı/).length).toBeGreaterThan(0);

    apiDown();
    await act(async () => {
      await client.refetchQueries({ queryKey: ["company-tenders"] });
    });
    await waitFor(() =>
      expect(client.getQueryCache().find({ queryKey: ["company-tenders", "ALIM"] })?.state.status).toBe("error"),
    );

    expect(screen.queryByText("Veri alınamadı.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByText(/Çelik boru alımı/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Kablo alımı/).length).toBeGreaterThan(0);
    expect(statusButton()).toHaveTextContent("Tüm Durumlar (2)");
    expect(screen.getByText(/satın alma talebi$/)).toHaveTextContent("2 satın alma talebi");
  });
});
