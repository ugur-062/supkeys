// @vitest-environment jsdom
/**
 * RAPOR TALEP SEÇİCİSİ — kesinti (son canlı kontrol 2026-10-10, OUTF-5).
 *
 * Seçenekler okunamayınca kutu yalnız "— Seçin —" ile sessizce boş kalıyordu:
 * yükleme ya da hata ipucu yoktu, firmanın hiç talebi yokmuş gibi okunuyordu.
 *
 * GERÇEK `useReportListingOptions` kancası + gerçek QueryClient; yalnız
 * `companyApi` sahte.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn<(url: string) => Promise<{ data: unknown }>>() }));

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));

import { ReportListingPicker } from "../report-listing-picker";

const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });
const OPTIONS = {
  items: [{ id: "l7", tenderNumber: "ROT-000007", title: "Kablo alımı", status: "OPEN" }],
  total: 1,
  limit: 500,
};

let client: QueryClient;
const view = () =>
  render(
    <QueryClientProvider client={client}>
      <ReportListingPicker label="Satın Alma Talebi" placeholder="— Seçin —" value="" onChange={vi.fn()} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.get.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());

describe("ReportListingPicker — seçenekler okunamadı (OUTF-5)", () => {
  it("kutu sessizce boş kalmaz: 'yüklenemedi' + 'Tekrar dene'; API dönünce seçenekler gelir", async () => {
    h.get.mockRejectedValue(networkError);
    view();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Satın alma talepleri yüklenemedi.");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["— Seçin —"]);

    h.get.mockResolvedValue({ data: OPTIONS });
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await screen.findByRole("option", { name: "ROT-000007 — Kablo alımı" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("BAŞARILI ve boş yanıt hata DEĞİLDİR (hiç talebi olmayan firma)", async () => {
    h.get.mockResolvedValue({ data: { items: [], total: 0, limit: 500 } });
    view();
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    expect(h.get).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
