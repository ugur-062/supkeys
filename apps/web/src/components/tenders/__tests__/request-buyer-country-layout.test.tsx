// @vitest-environment jsdom
/**
 * SON TOPARLAMA (2026-10-04, bayrak tarayıcı doğrulaması bulguları):
 *  1) Panel Açık Talepler maskeli satırı: "Alıcı gizli · <bayrak> Türkiye"
 *     FİRMA hücresinden KALEM sütununa taşıyordu → hücre içeriği sütuna bağlı
 *     (`max-w-full`), ülke sığmazsa alt satıra sarar, uzun metin `truncate` +
 *     tam metin `title`.
 *  2) Herkese açık talep satırı: faaliyet + ülke yarışınca ülke "Tü…"ye
 *     kısalıyordu → ülke öncelikli (sarma; faaliyet kısalır).
 *  3) Hedef ülke kapsamı küre yerine bayrakla; alıcının ülkesiyle aynıysa
 *     "Türkiye" iki kez yazılmaz.
 * jsdom yerleşim ölçmez: sözleşme yapı ve sınıflar üzerinden (taşma koruması
 * sınıfları silinirse test kırmızı olur).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";
import type { PublicListingCard } from "@/lib/public/marketplace-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satis",
}));

import { BrowseTenderRow } from "@/components/ihale/BrowseTenderRow";
import { ListingTeaserRow } from "@/components/marketplace/listing-teaser-row";
import { ScopeChip } from "@/components/tenders/scope-chip";
import { BuyerCountryScope, ScopeBesideBuyer, TargetScope } from "@/components/tenders/target-scope";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const future = new Date(Date.now() + 5 * 86_400_000).toISOString();

function sellerRow(over: Partial<SellerTenderRow> = {}): SellerTenderRow {
  return {
    id: "l1",
    number: "ROT-000823",
    title: "Vida alımı",
    status: "OPEN",
    visibility: "PUBLIC",
    format: "RFQ",
    currency: "TRY",
    isInternational: false,
    targetCountries: [],
    ownerCountry: "TR",
    closesAt: future,
    createdAt: new Date().toISOString(),
    itemCount: 2,
    owner: { id: "c1", name: "Çok Uzun Adlı Alıcı Sanayi ve Ticaret Anonim Şirketi" },
    canBid: true,
    invited: false,
    connected: false,
    myBidStatus: null,
    myBidSubmitCount: null,
    categoryMatch: false,
    categories: [{ code: "31161500", name: "Vidalar" }],
    extraCategoryCount: 0,
    ...over,
  };
}

/** FİRMA sütununun değer hücresi (`dd`) — başlığı "Firma" olan `dl` öğesi. */
function firmaCell(container: HTMLElement): HTMLElement {
  const dt = Array.from(container.querySelectorAll("dt")).find((el) => /firma/i.test(el.textContent ?? ""))!;
  return dt.parentElement!.querySelector("dd")!;
}

beforeEach(() => {
  useCompanyAuthStore.setState({ company: { tier: "STANDART", companyVerificationStatus: "VERIFIED" } as never });
});

describe("Açık Talepler FİRMA hücresi sütuna sığar (bulgu 1, yüksek)", () => {
  it("maskeli satır: içerik sütuna bağlı, ülke sarar (ayraç yok), uzun metinler kısalır + tam metin title'da", () => {
    const { container } = render(
      <BrowseTenderRow t={sellerRow({ id: "masked:ROT-000823", masked: true, owner: null, ownerVerified: true, canBid: false })} />,
    );
    const cell = firmaCell(container);
    const root = cell.firstElementChild as HTMLElement;
    expect(root.className).toContain("max-w-full");
    expect(root.className).toContain("min-w-0");

    const hidden = within(cell).getByText("Alıcı gizli");
    expect(hidden.className).toContain("truncate");
    expect(hidden).toHaveAttribute("title", "Alıcı gizli");

    // "Alıcı gizli" ile ülke AYNI sarılan satırda; sığmazsa ülke alt satıra iner.
    const line = hidden.closest(".flex-wrap") as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.className).toContain("max-w-full");
    const country = within(line).getByText("Türkiye");
    expect(country.className).toContain("truncate");
    const label = country.parentElement!;
    expect(label).toHaveAttribute("title", "Türkiye");
    expect(label.className).toContain("max-w-full");
    expect(label.querySelector('img[src="/flags/4x3/tr.svg"]')).not.toBeNull();
    // Satır başında sarkacak "·" ayracı yok.
    expect(line.textContent).not.toContain("·");

    // Rozet de hücreyi aşmaz.
    const badge = within(cell).getByText("Doğrulanmış alıcı");
    expect(badge.className).toContain("truncate");
    expect(badge.parentElement!.className).toContain("max-w-full");
  });

  it("adı görünen alıcı + bayrak: ad kısalır (title tam ad), bayrak küçülmez", () => {
    useCompanyAuthStore.setState({ company: { tier: "SILVER", companyVerificationStatus: "VERIFIED" } as never });
    const t = sellerRow();
    const { container } = render(<BrowseTenderRow t={t} />);
    const cell = firmaCell(container);
    const name = within(cell).getByText(t.owner!.name);
    expect(name.className).toContain("truncate");
    expect(name.className).toContain("min-w-0");
    expect(name).toHaveAttribute("title", t.owner!.name);
    expect((cell.firstElementChild as HTMLElement).className).toContain("max-w-full");
    const flag = cell.querySelector('img[src="/flags/4x3/tr.svg"]') as HTMLImageElement;
    expect(flag.className).toContain("shrink-0");
    expect(flag).toHaveAttribute("alt", "Türkiye");
  });

  it("ülkesi olmayan eski maskeli kayıt: yalnız 'Alıcı gizli', bayrak yok", () => {
    const { container } = render(
      <BrowseTenderRow t={sellerRow({ id: "masked:ROT-1", masked: true, owner: null, ownerCountry: null })} />,
    );
    const cell = firmaCell(container);
    expect(within(cell).getByText("Alıcı gizli")).toBeInTheDocument();
    expect(cell.querySelector('img[src^="/flags/"]')).toBeNull();
  });
});

describe("herkese açık talep satırı: ülke faaliyetten ÖNCELİKLİ (bulgu 2, orta)", () => {
  const card = {
    number: "ROT-000760",
    slug: "rot-000760-kapi",
    type: "ALIM",
    title: "Kapı alımı",
    status: "OPEN",
    coverImageUrl: null,
    closesAt: future,
    publishedAt: new Date().toISOString(),
    primaryCurrency: "TRY",
    isInternational: false,
    targetCountries: [],
    itemCount: 2,
    itemSummary: { count: 2, totalQuantity: null, unit: null },
    excerpt: null,
    company: { country: "TR", industry: null, activities: ["MANUFACTURER"], verified: true },
    categories: [{ id: "30171500", name: "Kapılar", level: 3 }],
  } as unknown as PublicListingCard;

  it("faaliyet ile ülke sarılan satırda; ülke tam (kısaltılmaz), faaliyet gerekirse kısalır + title", () => {
    const { container } = render(<ListingTeaserRow listing={card} />);
    const activity = screen.getByText("Üretici");
    expect(activity.className).toContain("truncate");
    expect(activity).toHaveAttribute("title", "Üretici");
    const line = activity.parentElement!;
    expect(line.className).toContain("flex-wrap");
    expect(line.className).toContain("max-w-full");
    const label = within(line).getByText("Türkiye").parentElement!;
    expect(label).toHaveAttribute("title", "Türkiye");
    expect(label.querySelector('img[src="/flags/4x3/tr.svg"]')).not.toBeNull();
    expect(line.textContent).not.toContain("·");
    expect(container.textContent).not.toContain("Tü…");
  });
});

describe("hedef ülke kapsamı bayrakla (bulgu 3, düşük)", () => {
  it("TargetScope: tüm ülkeler → küre; hedef ülke → bayrak, küre yok; çoklu → ipucunda tüm adlar", () => {
    const { container, rerender } = rtlRender(<TargetScope targetCountries={[]} />);
    expect(screen.getByText("Tüm ülkeler")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector('img[src^="/flags/"]')).toBeNull();

    rerender(<TargetScope targetCountries={["DE"]} />);
    expect(screen.getByText("Almanya")).toBeInTheDocument();
    expect(container.querySelector('img[src="/flags/4x3/de.svg"]')).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();

    rerender(<TargetScope targetCountries={["DE", "AZ", "FR", "IT"]} />);
    expect(container.querySelectorAll('img[src^="/flags/"]')).toHaveLength(3);
    expect(container.firstElementChild).toHaveAttribute("title", "Almanya, Azerbaycan, Fransa, İtalya");
  });

  it("alıcı kutusu: alıcı TR + yalnız DE → iki satır (TR bayrağı, DE bayrağı), küre yok", () => {
    const { container } = rtlRender(<BuyerCountryScope buyerCountry="TR" targetCountries={["DE"]} />);
    expect(screen.getByText("Türkiye")).toBeInTheDocument();
    expect(screen.getByText("Almanya")).toBeInTheDocument();
    expect(container.querySelector('img[src="/flags/4x3/de.svg"]')).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("alıcı kutusu: alıcı TR + yalnız TR → TEK satır, 'Türkiye' bir kez", () => {
    const { container } = rtlRender(<BuyerCountryScope buyerCountry="TR" targetCountries={["TR"]} />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.textContent).toBe("Türkiye·yalnız yurt içi tedarikçiler");
    expect(container.querySelectorAll('img[src="/flags/4x3/tr.svg"]')).toHaveLength(1);
  });

  it("alıcı kutusu: tüm ülkelere açık → ülke + küreli 'Tüm ülkeler'", () => {
    const { container } = rtlRender(<BuyerCountryScope buyerCountry="TR" targetCountries={[]} />);
    expect(screen.getByText("Türkiye")).toBeInTheDocument();
    expect(screen.getByText("Tüm ülkeler")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("kart içi kapsam: alıcının ülkesiyle aynı tek hedefte ülke adı tekrarlanmaz", () => {
    const { container, rerender } = rtlRender(<ScopeBesideBuyer buyerCountry="TR" targetCountries={["TR"]} />);
    expect(container.textContent).toBe("yalnız yurt içi tedarikçiler");
    rerender(<ScopeBesideBuyer buyerCountry="TR" targetCountries={["DE"]} />);
    expect(container.querySelector('img[src="/flags/4x3/de.svg"]')).not.toBeNull();
  });

  it("ScopeChip: hedef ülkeli çip bayraklı ve hücreyi aşmaz; tüm ülkeler ikon yok", () => {
    const { container, rerender } = rtlRender(<ScopeChip targetCountries={["DE", "AZ"]} />);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.querySelectorAll('img[src^="/flags/"]')).toHaveLength(2);
    expect(chip).toHaveAttribute("title", "Almanya, Azerbaycan");
    expect(chip.className).toContain("max-w-full");
    rerender(<ScopeChip targetCountries={[]} />);
    expect(container.querySelector('img[src^="/flags/"]')).toBeNull();
    expect(screen.getByText("Tüm ülkeler")).toBeInTheDocument();
  });
});
