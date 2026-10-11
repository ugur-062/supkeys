// @vitest-environment jsdom
/**
 * GİZLİ SEGMENTTEKİ KATEGORİ HERKESE AÇIK TALEP YÜZEYLERİNDE GÖRÜNMEZ
 * (2026-10-09, sahip kararı: "anasayfada olmayan kategori talepte, üründe ya
 * da başka yerde de gösterilmesin"; arayüz denetimi W-01, W-02, W-19).
 *
 * Eski talep (gizlenmeden önce 4610 = hafif silahlar ailesinde — görünür 46
 * sektörünün gizli dalı, 2026-10-10 — ya da 10 = canlı bitki segmentinde
 * açılmış) YAYINDA KALIR; yalnız gizli kategorisi hiçbir okumada
 * çizilmez: çip, süzgeç bağlantısı, "Kategori" sütunu, ipucu, "+N kategori".
 * API aynı süzgeci uygular — bu sınamalar web'in İKİNCİ katını kilitler: API
 * gizli kategoriyi gönderse bile ekrana çıkmaz, ve görünür kategorisi kalmayan
 * talepte sayfa düzgün kalır (boş çip satırı, sahipsiz ayraç yok).
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PublicListingCard, PublicListingDetail } from "@/lib/public/marketplace-api";

vi.mock("../public-layout", () => ({ PublicLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/seo/json-ld", () => ({ JsonLd: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { ListingTeaserRow } from "../listing-teaser-row";
import { ListingTeaserCard } from "../listing-teaser-card";
import { ListingCard } from "../listing-card";
import { ListingDetail } from "../listing-detail";

const future = new Date(Date.now() + 5 * 86_400_000).toISOString();

const HIDDEN = { id: "46101500", name: "Ateşli silahlar", level: 3 };
const HIDDEN_SEG = { id: "10000000", name: "Canlı Bitki ve Hayvanlar", level: 1 };
const VISIBLE = { id: "40141700", name: "Borular", level: 3 };
const VISIBLE_2 = { id: "31161500", name: "Vidalar", level: 3 };

function card(categories: PublicListingCard["categories"]): PublicListingCard {
  return {
    number: "ROT-000460",
    slug: "eski-talep",
    type: "ALIM",
    title: "Eski talep",
    status: "OPEN",
    coverImageUrl: null,
    closesAt: future,
    publishedAt: "2026-09-11T09:00:00.000Z",
    primaryCurrency: "TRY",
    isInternational: false,
    targetCountries: [],
    itemCount: 1,
    itemSummary: { count: 1, totalQuantity: null, unit: null },
    excerpt: null,
    company: { city: null, country: "TR", industry: null, activities: [], verified: false },
    categories,
  } as unknown as PublicListingCard;
}

function detail(categories: PublicListingCard["categories"]): PublicListingDetail {
  return {
    ...card(categories),
    description: null,
    format: "RFQ",
    allowedCurrencies: ["TRY"],
    categoryIds: categories.map((c) => c.id),
    preferredActivities: [],
    keywords: [],
    requireAllItems: false,
    requireBidDocument: false,
    requireGuaranteeLetter: false,
    isSealedBid: true,
    isLogistics: false,
    deliveryTerm: null,
    paymentCategory: "CASH",
    paymentTiming: "ON_DELIVERY",
    advancePercent: null,
    paymentDays: null,
    lcType: null,
    lcConfirmed: false,
    updatedAt: "2026-09-11T09:00:00.000Z",
    indexable: true,
    items: [{ lineNo: 1, name: "Kalem", quantity: "10", unit: "adet" }],
  } as unknown as PublicListingDetail;
}

const HIDDEN_TEXT = /Ateşli silahlar|Canlı Bitki|46101500|10000000/;

describe("herkese açık talep sayfası (ListingDetail) — W-01", () => {
  it("gizli kategori çip olmaz, süzgeç bağlantısı üretilmez; görünür kategori kalır", () => {
    const { container } = render(<ListingDetail listing={detail([HIDDEN, VISIBLE, HIDDEN_SEG])} />);
    expect(screen.getByRole("link", { name: "Borular" }).getAttribute("href")).toMatch(/\?kategori=40141700$/);
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    expect(container.querySelector('a[href*="kategori=46"]')).toBeNull();
    expect(container.querySelector('a[href*="kategori=10"]')).toBeNull();
  });

  it("görünür kategorisi kalmayan talep: çip satırı HİÇ açılmaz, sayfa başlığı ve bilgileri durur", () => {
    const { container } = render(<ListingDetail listing={detail([HIDDEN])} />);
    expect(screen.getByRole("heading", { level: 1, name: "Eski talep" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    // Başlık kartında liste (çip satırı) yok — boş <ul> de kalmaz.
    expect(container.querySelector("header ul")).toBeNull();
    expect(container.querySelector('a[href*="kategori="]')).toBeNull();
    expect(screen.getByRole("heading", { name: "Talep bilgileri" })).toBeInTheDocument();
  });
});

describe("talep satırı (ListingTeaserRow) — anasayfa tedarikçi yüzü, dizin, benzer talepler — W-02", () => {
  it("Kategori sütunu ilk GÖRÜNÜR kategoriyi yazar; ipucu ve '+N' gizliyi saymaz", () => {
    const { container } = render(<ListingTeaserRow listing={card([HIDDEN, VISIBLE, VISIBLE_2, HIDDEN_SEG])} />);
    expect(screen.getByText("Borular")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    // İpucu (title) yalnız görünür adları taşır.
    expect(screen.getByText("Borular").parentElement).toHaveAttribute("title", "Borular, Vidalar");
    expect(container.querySelector(`[title*="Ateşli"]`)).toBeNull();
    // Dört kategoriden ikisi görünür → "+1 kategori" (gizliler sayılmaz).
    expect(screen.getByText("+1 kategori")).toBeInTheDocument();
    expect(screen.queryByText("+3 kategori")).toBeNull();
  });

  // Canlı doğrulama PUB-02: hücre etiket + "—" ile çiziliyordu ("KATEGORİ —");
  // 390 px'te kartın tam bir satırını boş bir bilgi tutuyordu.
  it("görünür kategorisi kalmayan talep: Kategori hücresi HİÇ çizilmez (etiket, ikon, '—' yok); diğer sütunlar durur", () => {
    const { container } = render(<ListingTeaserRow listing={card([HIDDEN, HIDDEN_SEG])} />);
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    expect(container.textContent).not.toMatch(/\+\d+ kategori/);
    expect(screen.queryByText("Kategori")).toBeNull();
    const labels = [...container.querySelectorAll("dl dt")].map((dt) => dt.textContent);
    expect(labels).toEqual(["Alıcı", "Kalem", "Görünürlük", "Kapanış"]);
    // Kalan hücrelerin hiçbiri yalnız bir tire değil.
    expect([...container.querySelectorAll("dl dd")].some((dd) => dd.textContent?.trim() === "—")).toBe(false);
  });

  it("hiç kategorisi olmayan talep de aynı: boş Kategori hücresi yok", () => {
    const { container } = render(<ListingTeaserRow listing={card([])} />);
    expect(screen.queryByText("Kategori")).toBeNull();
    expect(container.querySelectorAll("dl dt")).toHaveLength(4);
  });

  it("görünür kategorili talepte hücre beşinci sütun olarak çizilir", () => {
    const { container } = render(<ListingTeaserRow listing={card([VISIBLE])} />);
    const labels = [...container.querySelectorAll("dl dt")].map((dt) => dt.textContent);
    expect(labels).toEqual(["Alıcı", "Kalem", "Görünürlük", "Kapanış", "Kategori"]);
  });
});

describe("bugün bağlı olmayan kartlar da aynı kuralı taşır — W-19", () => {
  it("teaser kartı (ListingTeaserCard): gizli kategori rozet olmaz", () => {
    const { container, unmount } = render(<ListingTeaserCard listing={card([HIDDEN])} />);
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    unmount();
    render(<ListingTeaserCard listing={card([HIDDEN, VISIBLE])} />);
    expect(screen.getByText("Borular")).toBeInTheDocument();
  });

  it("pazar yeri kartı (ListingCard listing=…): gizli kategori adı basılmaz", () => {
    const { container, unmount } = render(<ListingCard listing={card([HIDDEN_SEG])} />);
    expect(container.textContent).not.toMatch(HIDDEN_TEXT);
    unmount();
    render(<ListingCard listing={card([HIDDEN_SEG, VISIBLE])} />);
    expect(screen.getByText("Borular")).toBeInTheDocument();
  });
});
