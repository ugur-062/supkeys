// @vitest-environment jsdom
/**
 * TALEP SATIRI ALT ÇİZGİSİ (2026-09-17, 2026-09-19 v3): detay oku EN SOLDA
 * ("Detayları göster", erişilebilir adı "Kalemleri göster"), "Teklif
 * ver" EN SAĞDA, DÜĞME gibi dolgulu (portal rengi) ve daha büyük (text-sm). DOM sırası = görsel sıra (flex,
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
import { ButtonAccentProvider } from "@/components/ui/button-accent";

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
    // v3 (2026-09-19 mockup): ok + "Detayları göster" yazısı.
    expect(kalemler.textContent).toBe("Detayları göster");
    expect(kalemler.querySelector("svg")?.getAttribute("class")).toMatch(/\bsize-5\b/);
    const teklif = screen.getByRole("link", { name: "Teklif ver" });
    const metrik = screen.getByText(/Teklifim:/);
    // DOM sırası: Kalemler → Teklifim → Teklif ver
    expect(kalemler.compareDocumentPosition(metrik) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(metrik.compareDocumentPosition(teklif) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Eylem DÜĞME gibi: dolgulu, portal renginde (bağlam yokken mavi; satış
    // kabuğunda emerald), satır 11 px'inden büyük.
    expect(teklif.className).toMatch(/\btext-sm\b/);
    expect(teklif.className).toMatch(/rounded-(lg|xl)/);
    expect(teklif.className).toMatch(/bg-blue-600/);
  });

  it("satış kabuğunda düğme EMERALD", () => {
    render(
      <ButtonAccentProvider accent="emerald">
        <ListingCard variant="row" data={data} />
      </ButtonAccentProvider>,
    );
    expect(screen.getByRole("link", { name: "Teklif ver" }).className).toMatch(/bg-emerald-600/);
  });

  it("eylem yoksa kalem oku yine durur", () => {
    render(<ListingCard variant="row" data={{ ...data, action: null, metric: null }} />);
    expect(screen.getByRole("button", { name: "Kalemleri göster" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Teklif ver" })).toBeNull();
  });
});
