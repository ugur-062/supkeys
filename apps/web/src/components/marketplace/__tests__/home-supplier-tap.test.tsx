// @vitest-environment jsdom
/**
 * Anasayfa tedarikçi yüzü — "Tüm talepler (N)" bağlantısı (mobil denetim
 * 2026-10 g01): bölüm başlığının yanındaki tek başına duran bağlantı 20 px
 * yüksekti (24 px tabanın altında). Dokunma alanı 44 px; dolgu eksi kenar
 * boşluğuyla dengelenir, görünüm ve satır yüksekliği yerinde kalır.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
}));

import { HomeSupplier } from "../home-supplier";

const demand = (i: number) => ({
  number: `ROT-00010${i}`,
  slug: `rot-00010${i}`,
  title: `Talep ${i}`,
  status: "OPEN",
  closesAt: new Date(Date.now() + i * 86_400_000).toISOString(),
  categories: [{ id: "39000000", name: "Elektrik", level: 1 }],
  itemSummary: { count: 2, totalQuantity: "500", unit: "adet" },
  targetCountries: [],
  company: { city: null, country: "TR", activities: ["MANUFACTURER"], verified: true },
});

describe("HomeSupplier — 'Tüm talepler' dokunma alanı", () => {
  it("44 px dokunma alanı (py-3 + eksi kenar boşluğu), görünüm yerinde", () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    render(<HomeSupplier demands={[demand(1), demand(2), demand(3)] as any} total={13} />);
    const link = screen.getByRole("link", { name: /Tüm talepler \(13\)/ });
    // 20 px satır + 2 × 12 px dolgu = 44 px; -my-3 satırın yerini korur.
    expect(link.className.split(/\s+/)).toEqual(expect.arrayContaining(["-my-3", "py-3", "inline-flex", "items-center"]));
  });
});
