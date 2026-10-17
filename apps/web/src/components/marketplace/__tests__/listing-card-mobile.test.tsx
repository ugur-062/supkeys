// @vitest-environment jsdom
/**
 * TALEP SATIRI TELEFONDA (mobil denetim 2026-10 g01/g02/g08).
 *
 * 360 px'te sağ sütundaki `whitespace-nowrap` durum pili (RU "Открыт для
 * предложений", 162 px) başlığı 69–85 px'e sıkıştırıyor, iki satırlık başlık
 * 1–2 sözcük gösteriyordu; numara pili "ROT-" / "000846" diye kırılıyordu.
 * Beşinci sütun (Kategori) iki sütunlu ızgarada sol yarıda tek kalıp
 * kırpılıyor, sağ yarı boş duruyordu. jsdom yerleşim hesaplamaz; kilitlenen
 * şey bunu sağlayan yapı ve sınıflardır (Chromium'da ölçüm yeniden doğrulama
 * turunda).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicListingCard } from "@/lib/public/marketplace-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { FAB_CLEARANCE_SM_IN_PX3_CLASS } from "@/components/company-shell/assistant/fab-clearance";
import { ListingCard, type ListingCardData } from "../listing-card";
import { ListingTeaserRow } from "../listing-teaser-row";

const cls = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/);

const base: ListingCardData = {
  id: "l1",
  href: "/company/ilan/l1",
  number: "ROT-000846",
  title: "Hidrolik silindir keçe takımı ve sızdırmazlık elemanları alımı",
  kind: "talep",
  categoryIds: [],
  status: { label: "Открыт для предложений", className: "" },
  timeNote: "Süresi doldu · 6 gün önce",
  facts: [
    { label: "Alıcı", value: "Türkiye", icon: "company" },
    { label: "Kalemler", value: "3 kalem", icon: "items" },
    { label: "Kapsam", value: "Tüm ülkeler", icon: "scope" },
    { label: "Kategori", value: "Hidrolik silindir ve bileşenleri tamir kitleri", icon: "category" },
    { label: "Firma", value: "—", icon: "info" },
  ],
};

describe("ListingCard row — telefonda başlık tam genişlik", () => {
  it("durum pili bağlantının dışında, tek kez çizilir; ızgara telefonda tek sütun, sm'de sağ sütun", () => {
    render(<ListingCard variant="row" data={base} />);
    const pills = screen.getAllByText("Открыт для предложений");
    expect(pills).toHaveLength(1);
    const pill = pills[0]!;
    const link = screen.getByRole("link", { name: /Hidrolik silindir/ });
    // Erişilebilir ad durumu taşımaz (pil bağlantının içine taşınmadı).
    expect(link).not.toContainElement(pill);
    expect(link.textContent).not.toContain("Открыт");

    // Bağlantı ve durum sütunu AYNI içerik ızgarasının çocukları; DOM sırası
    // bağlantı → durum (ekran okuyucu sırası değişmedi).
    const grid = link.parentElement!;
    const statusColumn = grid.lastElementChild as HTMLElement;
    expect(grid.firstElementChild).toBe(link);
    expect(statusColumn).toContainElement(pill);
    expect(cls(grid)).toEqual(expect.arrayContaining(["grid", "grid-cols-1", "min-w-0", "flex-1", "sm:grid-cols-[minmax(0,1fr)_auto]"]));
    // Bağlantı sm'de kendi genişliğinde kalır (odak halkası eskisi gibi).
    expect(cls(link)).toEqual(expect.arrayContaining(["min-w-0", "justify-self-start"]));

    // Telefonda pil ile zaman notu yan yana sarılır; sm'de eskisi gibi sağa yaslı sütun.
    const pillRow = pill.parentElement!;
    expect(pillRow).toHaveTextContent("Süresi doldu · 6 gün önce");
    expect(cls(pillRow)).toEqual(
      expect.arrayContaining(["flex-wrap", "sm:flex-col", "sm:flex-nowrap", "sm:items-end"]),
    );
    expect(cls(pill)).toContain("whitespace-nowrap");
  });

  it("numara pili kırılmaz; başlık telefonda üç, sm ve üstünde iki satır", () => {
    render(<ListingCard variant="row" data={base} />);
    expect(cls(screen.getByText("ROT-000846"))).toContain("whitespace-nowrap");
    const title = screen.getByText(base.title);
    expect(cls(title)).toEqual(expect.arrayContaining(["line-clamp-3", "sm:line-clamp-2"]));
    expect(cls(title)).not.toContain("line-clamp-2");
  });

  it("tek kalan son sütun telefonda iki sütunu kaplar, sm'de bir sütun", () => {
    const { container } = render(<ListingCard variant="row" data={base} />);
    const cells = [...container.querySelectorAll("dl > div")];
    expect(cells).toHaveLength(5);
    expect(cls(cells[4]!)).toEqual(expect.arrayContaining(["col-span-2", "sm:col-span-1"]));
    for (const c of cells.slice(0, 4)) expect(cls(c)).not.toContain("col-span-2");
  });

  it("çift sayıda sütunda hiçbiri yayılmaz", () => {
    const { container } = render(<ListingCard variant="row" data={{ ...base, facts: base.facts.slice(0, 4) }} />);
    for (const c of container.querySelectorAll("dl > div")) expect(cls(c)).not.toContain("col-span-2");
  });
});

describe("ListingCard row — alt satır telefonda sarar (mobil denetim 2026-10, RU 360)", () => {
  it("teklif durumu metriği telefonda kırpılmaz (sarar), sol grup satıra sığmazsa alta iner; sm'de tek satır + kırpma", () => {
    render(
      <ListingCard
        variant="row"
        data={{
          ...base,
          metric: { label: "Моё предложение", value: "Отозвано" },
          action: { label: "Подать предложение", href: "/company/ilan/l1/teklif-ver" },
          expandable: { id: "kalemler-l1", render: () => null },
        }}
      />,
    );
    const metric = screen.getByText("Отозвано").parentElement!;
    expect(metric).toHaveTextContent("Моё предложение: Отозвано");
    // Masaüstü: eskisi gibi tek satır kırpma; telefonda sarar.
    expect(cls(metric)).toEqual(expect.arrayContaining(["truncate", "max-sm:whitespace-normal", "max-sm:break-words"]));
    // Sol grup (detay oku + metrik) telefonda sarar; sm'de tek satır.
    const group = metric.parentElement!;
    expect(group).toContainElement(screen.getByRole("button", { name: /Detayları göster/ }));
    expect(cls(group)).toEqual(expect.arrayContaining(["flex", "min-w-0", "gap-4", "max-sm:flex-wrap", "max-sm:gap-y-1"]));
    expect(cls(group)).not.toContain("flex-wrap");
    // Eylem sağda, küçülmez.
    expect(cls(screen.getByRole("link", { name: /Подать предложение/ }))).toContain("shrink-0");
  });
});

describe("ListingCard row — alt çizginin sm+ AI Asistan payı (mobil denetim 2026-10, dördüncü tur)", () => {
  const data: ListingCardData = {
    ...base,
    metric: { label: "Teklifim", value: "Yok" },
    action: { label: "Teklif ver", href: "/company/ilan/l1/teklif-ver" },
    expandable: { id: "kalemler-l1", render: () => null },
  };
  it("panelde alt çizgi `FAB_CLEARANCE_SM_IN_PX3_CLASS` taşır (telefonda pay yok, sarma aynı); `fabClearance={false}` taşımaz", () => {
    const { unmount } = render(<ListingCard variant="row" data={data} />);
    const footer = screen.getByRole("link", { name: /Teklif ver/ }).parentElement!;
    expect(cls(footer)).toEqual(expect.arrayContaining(["mt-2", "flex", "justify-between", ...FAB_CLEARANCE_SM_IN_PX3_CLASS.split(" ")]));
    // Kırılımsız sağ pay yok: telefon yerleşimi değişmez.
    expect(cls(footer).filter((c) => /^(?:pr|pe)-/.test(c))).toEqual([]);
    // Sol grubun telefonda sarması korunur.
    expect(cls(footer.firstElementChild)).toEqual(expect.arrayContaining(["max-sm:flex-wrap", "max-sm:gap-y-1"]));
    unmount();
    render(<ListingCard variant="row" data={data} fabClearance={false} />);
    const plain = screen.getByRole("link", { name: /Teklif ver/ }).parentElement!;
    expect(cls(plain).filter((c) => /pr-/.test(c))).toEqual([]);
  });
});

describe("ListingTeaserRow — Kategori değeri telefonda iki satır", () => {
  it("telefonda line-clamp-2, sm ve üstünde tek satır kırpma", () => {
    const card = {
      number: "ROT-000301",
      slug: "rot-000301",
      type: "ALIM",
      title: "Paslanmaz çelik boru alımı",
      status: "OPEN",
      coverImageUrl: null,
      closesAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      publishedAt: "2026-09-11T09:00:00.000Z",
      primaryCurrency: "TRY",
      isInternational: false,
      targetCountries: [],
      itemCount: 2,
      itemSummary: { count: 2, totalQuantity: null, unit: null },
      excerpt: null,
      company: { city: null, country: "TR", industry: null, activities: [], verified: false },
      categories: [{ id: "40141700", name: "Hidrolik silindir ve bileşenleri tamir kitleri", level: 3 }],
    } as unknown as PublicListingCard;
    render(<ListingTeaserRow listing={card} />);
    const value = screen.getByText("Hidrolik silindir ve bileşenleri tamir kitleri");
    expect(cls(value)).toEqual(expect.arrayContaining(["max-sm:line-clamp-2", "sm:truncate"]));
    expect(cls(value)).not.toContain("truncate");
  });
});
