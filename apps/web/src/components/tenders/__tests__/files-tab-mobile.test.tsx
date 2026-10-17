// @vitest-environment jsdom
/**
 * Mobil denetim 2026-10 (g06-request-create#new1, düzenleme ekranı): yeni
 * talepteki `StagedDocuments` ile aynı kusur talep düzenlemede de vardı — RU
 * 360'ta bölüm seçicisi ("Административная спецификация", 283 px) kart içindeki
 * kartı aşıyordu. Telefonda seçici satırın tamamını alır ve kırpılır; talep
 * formunun içinde (`embedded`) bölüm çerçevesizdir; sm'den eski dizilim.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn<(url: string) => Promise<{ data: unknown }>>() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { FilesTab } from "../files-tab";

const renderTab = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>,
  );

const cls = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/);

const doc = {
  id: "d1",
  kind: "IDARI_SARTNAME",
  fileName: "sartname.pdf",
  mimeType: "application/pdf",
  createdAt: "2026-10-10T09:00:00+03:00",
  mine: true,
  url: "https://cdn.example.test/sartname.pdf",
};

describe("FilesTab — telefon yerleşimi", () => {
  it("bölüm seçicisi telefonda tam genişlik + küçülebilir; sm'den eski boy", async () => {
    h.get.mockResolvedValue({ data: [] });
    const { container } = renderTab(<FilesTab listingId="l1" isOwner canEdit />);
    const button = container.querySelector("#listing-doc-kind") as HTMLElement;
    const wrapper = button.parentElement as HTMLElement;
    expect(cls(wrapper)).toEqual(expect.arrayContaining(["w-full", "min-w-0", "sm:w-auto", "sm:min-w-44"]));
    expect(cls(wrapper)).not.toContain("min-w-44");
    expect(cls(wrapper.parentElement)).toEqual(expect.arrayContaining(["w-full", "sm:w-auto"]));
    // Talep detayının Dosyalar sekmesinde kendi kartıdır: çerçeve her genişlikte.
    const section = container.querySelector("section") as HTMLElement;
    expect(cls(section)).toEqual(expect.arrayContaining(["card", "p-5"]));
    expect(cls(section)).not.toContain("max-sm:p-0");
  });

  it("talep formunun içinde (embedded) telefonda çerçevesiz", () => {
    h.get.mockResolvedValue({ data: [] });
    const { container } = renderTab(<FilesTab listingId="l1" isOwner canEdit embedded />);
    const section = container.querySelector("section") as HTMLElement;
    expect(cls(section)).toEqual(
      expect.arrayContaining(["card", "p-5", "md:p-6", "max-sm:p-0", "max-sm:shadow-none", "max-sm:ring-0"]),
    );
  });

  it("'Sil' düğmesi görünmeyen dolguyla büyür (yazı yerinde), küçük metin zinc-400 değil", async () => {
    h.get.mockResolvedValue({ data: [doc] });
    renderTab(<FilesTab listingId="l1" isOwner canEdit />);
    const del = await screen.findByRole("button", { name: /sartname\.pdf/ });
    expect(cls(del)).toEqual(expect.arrayContaining(["-mx-2", "-my-2.5", "px-2", "py-2.5", "text-zinc-500"]));
    expect(cls(del)).not.toContain("text-zinc-400");
  });
});
