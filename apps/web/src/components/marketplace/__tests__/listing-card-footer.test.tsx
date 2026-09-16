// @vitest-environment jsdom
/**
 * TALEP SATIRI ALT ÇİZGİSİ (2026-09-17, kullanıcı kararı): kalem oku EN SOLDA
 * (yazısız — yalnız aşağı ok, erişilebilir adı "Kalemleri göster"), "Teklif
 * ver" EN SAĞDA ve daha büyük (text-sm). DOM sırası = görsel sıra (flex,
 * justify-between); Teklifim metriği ortada.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/company/satis",
  useSearchParams: () => new URLSearchParams(),
}));
import { ListingCard, type ListingCardData } from "../listing-card";

const data: ListingCardData = {
  id: "l1",
  href: "/company/ilan/l1",
  number: "ROT-000001",
  title: "Çelik boru alımı",
  kind: "talep",
  categoryIds: [],
  status: { label: "Açık", className: "" },
  facts: [{ label: "Kapanış", value: "3 gün" }],
  metric: { label: "Teklifim", value: "12.000 ₺" },
  action: { label: "Teklif ver", href: "/company/ilan/l1/teklif-ver" },
  expandable: { id: "kalemler-l1", render: () => <div>kalem tablosu</div> },
};

describe("ListingCard row — alt satır düzeni", () => {
  it("kalem oku solda, Teklifim ortada, Teklif ver en sağda ve büyük", () => {
    render(<ListingCard variant="row" data={data} />);
    const kalemler = screen.getByRole("button", { name: "Kalemleri göster" });
    // Yazı yok, yalnız ok: düğmenin görünür metni boş.
    expect(kalemler.textContent).toBe("");
    expect(kalemler.querySelector("svg")?.getAttribute("class")).toMatch(/\bsize-5\b/);
    const teklif = screen.getByRole("link", { name: "Teklif ver" });
    const metrik = screen.getByText(/Teklifim:/);
    // DOM sırası: Kalemler → Teklifim → Teklif ver
    expect(kalemler.compareDocumentPosition(metrik) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(metrik.compareDocumentPosition(teklif) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Eylem satırın 11 px'inden büyük yazılır.
    expect(teklif.className).toMatch(/\btext-sm\b/);
    expect(teklif.className).toMatch(/font-semibold/);
  });

  it("eylem yoksa kalem oku yine durur", () => {
    render(<ListingCard variant="row" data={{ ...data, action: null, metric: null }} />);
    expect(screen.getByRole("button", { name: "Kalemleri göster" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Teklif ver" })).toBeNull();
  });
});
