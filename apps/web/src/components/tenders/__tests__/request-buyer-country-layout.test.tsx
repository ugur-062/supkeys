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
import { Badge } from "@/components/ui/badge";
import { ListingTeaserRow } from "@/components/marketplace/listing-teaser-row";
import { ScopeChip } from "@/components/tenders/scope-chip";
import { BuyerCountryScope, ScopeBesideBuyer, TargetScope } from "@/components/tenders/target-scope";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { messagesFor, WEB_NAMESPACES } from "@rothern/i18n/messages";

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

    // Etiket kısalmaz, en çok iki satıra sarılır (RU "Покупатель скрыт" → "Покупател…" bulgusu)
    // ve YALNIZ BOŞLUKTA sarılır (gizli satır rozeti, staging 2026-10-05: `break-words`
    // 1366 px'te "Покупате / ль скрыт" bölüyordu). Kilit karosu ilk sözcükten yer
    // çalmasın diye kilit SONDA, son sözcükle aynı nowrap parçada küçük ikon.
    const hidden = within(cell).getByTitle("Alıcı gizli");
    expect(hidden.className).toContain("line-clamp-2");
    expect(hidden.className).toContain("break-normal");
    expect(hidden.className).toContain("hyphens-none");
    expect(hidden.className).not.toContain("break-words");
    expect(hidden.className).not.toContain("break-all");
    expect(hidden.className).not.toContain("truncate");
    expect(hidden.className).toContain("max-w-full");
    expect(hidden).toHaveAttribute("title", "Alıcı gizli");
    const lock = hidden.querySelector("svg") as SVGElement;
    expect(lock).not.toBeNull();
    expect(lock.getAttribute("aria-hidden")).toBe("true");
    const tail = lock.parentElement!;
    expect(tail.parentElement).toBe(hidden);
    expect(tail.className).toContain("whitespace-nowrap");
    expect(tail.textContent).toBe("gizli");
    expect(hidden.lastElementChild).toBe(tail);
    expect(hidden.textContent).toBe("Alıcı gizli");
    expect(hidden.querySelector(".rounded-md")).toBeNull(); // sol kilit karosu yok

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

    // Rozet hücreyi aşmaz ve "…" ile kısalmaz (gizli satır rozeti: TR 1280–1366 px'te
    // "Doğrulanmış …" oluyordu): kısa metin (TR "Doğrulanmış", RU "Проверен"), sığmazsa
    // BOŞLUKTA sarılır (`wrap`), tam metin title'da.
    const badgeText = within(cell).getByText("Doğrulanmış");
    expect(badgeText.className).not.toContain("truncate");
    const badge = badgeText.parentElement!;
    expect(badge.className).toContain("max-w-full");
    expect(badge.className).toContain("whitespace-normal");
    expect(badge.className).toContain("break-normal");
    expect(badge.className).toContain("h-auto");
    expect(badge.className).not.toContain("whitespace-nowrap");
    expect(badge.className).not.toMatch(/(^|\s)h-5(\s|$)/);
    expect(badge).toHaveAttribute("title", "Doğrulanmış alıcı");
  });

  it("adı görünen satırda uzun firma adı taşmaz: `break-words` (yalnız maskeli etiket boşlukta sarılır)", () => {
    useCompanyAuthStore.setState({ company: { tier: "SILVER", companyVerificationStatus: "VERIFIED" } as never });
    const t = sellerRow({ owner: { id: "c1", name: "Uzunboşluksuzfirmaadısanayiveticaretanonimşirketi" } });
    const { container } = render(<BrowseTenderRow t={t} />);
    const name = within(firmaCell(container)).getByText(t.owner!.name);
    expect(name.className).toContain("break-words");
    expect(name.className).toContain("line-clamp-2");
  });

  it("adı görünen alıcı (SILVER/GOLD): ad iki satıra sarılır (title tam ad), bayrak + ülke KENDİ satırında", () => {
    // Canlı öncesi son tur: 1366–1440 px'te bayrak adla aynı satırı paylaşınca ad "QA Alı…"ya kısalıyordu.
    useCompanyAuthStore.setState({ company: { tier: "SILVER", companyVerificationStatus: "VERIFIED" } as never });
    const t = sellerRow();
    const { container } = render(<BrowseTenderRow t={t} />);
    const cell = firmaCell(container);
    const root = cell.firstElementChild as HTMLElement;
    expect(root.className).toContain("max-w-full");
    expect(root.className).toContain("flex-col");

    const name = within(cell).getByText(t.owner!.name);
    expect(name.className).toContain("line-clamp-2");
    expect(name.className).toContain("break-words");
    expect(name.className).toContain("min-w-0");
    expect(name.className).not.toContain("truncate");
    expect(name).toHaveAttribute("title", t.owner!.name);
    // Ad satırında bayrak yok; bayrak + ülke adı ayrı satır (maskeli satırdaki CountryLabel).
    const nameLine = name.parentElement!;
    expect(nameLine.querySelector('img[src^="/flags/"]')).toBeNull();
    const country = within(cell).getByText("Türkiye");
    const label = country.parentElement!;
    expect(label.parentElement).toBe(root);
    expect(label).toHaveAttribute("title", "Türkiye");
    expect(label.className).toContain("max-w-full");
    expect(label.querySelector('img[src="/flags/4x3/tr.svg"]')).not.toBeNull();
  });

  it("kompakt pano satırı: ad tek satırda kısalır, yanında yalnız bayrak (küçülmez)", () => {
    useCompanyAuthStore.setState({ company: { tier: "SILVER", companyVerificationStatus: "VERIFIED" } as never });
    const t = sellerRow();
    const { container } = render(<BrowseTenderRow t={t} compact />);
    const name = within(container).getByText(t.owner!.name);
    expect(name.className).toContain("truncate");
    expect(name).toHaveAttribute("title", t.owner!.name);
    const flag = name.parentElement!.querySelector('img[src="/flags/4x3/tr.svg"]') as HTMLImageElement;
    expect(flag.className).toContain("shrink-0");
    expect(flag).toHaveAttribute("alt", "Türkiye");
  });

  it("ülkesi olmayan eski maskeli kayıt: yalnız 'Alıcı gizli', bayrak yok", () => {
    const { container } = render(
      <BrowseTenderRow t={sellerRow({ id: "masked:ROT-1", masked: true, owner: null, ownerCountry: null })} />,
    );
    const cell = firmaCell(container);
    expect(within(cell).getByTitle("Alıcı gizli")).toHaveTextContent("Alıcı gizli");
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

  it("doğrulama rozeti ALICI hücresini aşmaz: kısa metin truncate, rozet max-w-full, tam metin title'da", () => {
    // Canlı öncesi son tur: RU "Проверенный покупатель" /ru/zayavki ve "Похожие" satırlarında 1440 px'te taşıyordu.
    render(<ListingTeaserRow listing={card} />);
    const text = screen.getByText("Doğrulanmış alıcı");
    expect(text.className).toContain("truncate");
    const badge = text.parentElement!;
    expect(badge.className).toContain("max-w-full");
    expect(badge).toHaveAttribute("title", "Doğrulanmış alıcı");
    expect((badge.parentElement as HTMLElement).className).toContain("max-w-full");
  });
});

describe("paylaşılan Badge `wrap` (gizli satır rozeti)", () => {
  it("varsayılan rozet tek satır hap (h-5, nowrap); `wrap` boşlukta sarılan, içeriğe göre uzayan rozet", () => {
    const { rerender } = rtlRender(<Badge tone="verified" size="sm">Doğrulanmış alıcı</Badge>);
    let el = screen.getByText("Doğrulanmış alıcı");
    expect(el.className).toContain("whitespace-nowrap");
    expect(el.className).toContain("h-5");
    expect(el.className).toContain("rounded-full");
    rerender(<Badge tone="verified" size="sm" wrap>Doğrulanmış alıcı</Badge>);
    el = screen.getByText("Doğrulanmış alıcı");
    expect(el.className).not.toContain("whitespace-nowrap");
    expect(el.className).toContain("whitespace-normal");
    expect(el.className).toContain("break-normal");
    expect(el.className).toContain("hyphens-none");
    expect(el.className).toContain("h-auto");
    expect(el.className).toContain("min-h-5");
    expect(el.className).not.toMatch(/(^|\s)h-5(\s|$)/);
    expect(el.className).not.toContain("rounded-full");
  });
});

describe("satır rozeti kısa metni (canlı öncesi son tur + gizli satır rozeti)", () => {
  it("kart rozeti: RU 'Проверен', TR/EN tam metin; panel satırı: TR 'Doğrulanmış' / EN 'Verified' / RU 'Проверен'; tam metin ayrı anahtarda kalır", () => {
    const pick = (locale: "tr" | "en" | "ru") => {
      type Row = { verifiedBuyer: string; verifiedBuyerShort: string; dogrulanmisAlici: string; dogrulanmisAliciKisa: string };
      const m = messagesFor(locale, WEB_NAMESPACES) as unknown as {
        web: { marketplace: { card: Row }; panel: { requests: { browsetenderrow: Row } } };
      };
      return {
        cardFull: m.web.marketplace.card.verifiedBuyer,
        cardShort: m.web.marketplace.card.verifiedBuyerShort,
        rowFull: m.web.panel.requests.browsetenderrow.dogrulanmisAlici,
        rowShort: m.web.panel.requests.browsetenderrow.dogrulanmisAliciKisa,
      };
    };
    const ru = pick("ru");
    expect(ru.cardShort).toBe("Проверен");
    expect(ru.rowShort).toBe("Проверен");
    expect(ru.cardFull).toBe("Проверенный покупатель");
    expect(ru.rowFull).toBe("Проверенный покупатель");
    for (const l of ["tr", "en"] as const) {
      const v = pick(l);
      expect(v.cardShort).toBe(v.cardFull);
    }
    // Panel maskeli satırı: değer hücresi 1280 px'te 82, 1366 px'te 100 px — tam metin
    // (TR 108 px rozet) sığmıyordu. Kısa biçim tek sözcük, tam metin `title`da.
    const tr = pick("tr");
    const en = pick("en");
    expect(tr.rowShort).toBe("Doğrulanmış");
    expect(tr.rowFull).toBe("Doğrulanmış alıcı");
    expect(en.rowShort).toBe("Verified");
    expect(en.rowFull).toBe("Verified buyer");
    for (const v of [tr, en, ru]) expect(v.rowShort).not.toContain(" ");
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
