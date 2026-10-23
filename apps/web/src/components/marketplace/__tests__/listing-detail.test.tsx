// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PublicListingDetail } from "@/lib/public/marketplace-api";

vi.mock("../public-layout", () => ({ PublicLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/seo/json-ld", () => ({ JsonLd: () => null }));

import { ListingDetail } from "../listing-detail";

/**
 * Herkese açık talep sayfası (arayüz testi D-061, D-073, D-334): kategori
 * çipi adıyla aynı kategoriye gider; erken kapanmış talepte ileri tarihli
 * "Son teklif tarihi" ve teklif çağrısı yok; bilgi tablosunda tek tarih biçimi.
 */
const future = new Date(Date.now() + 5 * 86_400_000).toISOString();

const base = {
  number: "ROT-000295",
  slug: "celik-levha",
  type: "ALIM",
  title: "Çelik levha alımı",
  status: "OPEN",
  coverImageUrl: null,
  closesAt: future,
  publishedAt: "2026-09-11T09:00:00.000Z",
  primaryCurrency: "TRY",
  isInternational: false,
  targetCountries: [],
  itemCount: 1,
  itemSummary: { count: 1, totalQuantity: "10", unit: "adet" },
  company: { verified: true, activities: [], industry: null, city: null },
  categories: [{ id: "31161500", name: "Vidalar", level: 4 }],
  description: null,
  format: "RFQ",
  allowedCurrencies: ["TRY"],
  categoryIds: ["31161500"],
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
  items: [{ lineNo: 1, name: "S235 levha", quantity: "10", unit: "adet" }],
} as unknown as PublicListingDetail;

describe("ListingDetail", () => {
  it("kategori çipi yaprağın kendisine bağlanır (segmente yuvarlanmaz)", () => {
    render(<ListingDetail listing={base} />);
    expect(screen.getByRole("link", { name: "Vidalar" }).getAttribute("href")).toMatch(/\?kategori=31161500$/);
  });

  it("açık talep: son teklif tarihi ve yayın tarihi aynı (kısa) biçimde, teklif çağrısı var", () => {
    render(<ListingDetail listing={base} />);
    const info = screen.getByRole("heading", { name: "Talep bilgileri" }).parentElement as HTMLElement;
    expect(within(info).getByText("Son teklif tarihi")).toBeInTheDocument();
    expect(within(info).getByText("11 Eyl 2026")).toBeInTheDocument();
    expect(screen.getByText(/belgeleri görmek ve teklif vermek için firma doğrulaması gerekir/)).toBeInTheDocument();
  });

  it("erken kapanmış talep: ileri tarihli son teklif tarihi ve teklif çağrısı yok", () => {
    render(<ListingDetail listing={{ ...base, status: "AWARDED" }} />);
    const info = screen.getByRole("heading", { name: "Talep bilgileri" }).parentElement as HTMLElement;
    expect(within(info).queryByText("Son teklif tarihi")).toBeNull();
    expect(screen.queryByText(/teklif vermek için firma doğrulaması/)).toBeNull();
    expect(screen.getByText(/belgeleri görmek için firma doğrulaması gerekir/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Kaydol — teklif firma doğrulamasıyla" })).toBeNull();
    expect(screen.getByText("Bu talep teklife kapalı.")).toBeInTheDocument();
  });

  it("misafir: kapı başlığı, kayıt CTA'sı ve ödül listesi firma doğrulamasını baştan söyler; 'üyelere/kayıtlı' vaadi ve paket adı yok (arayüz testi kapanış COPY)", () => {
    const { container } = render(<ListingDetail listing={base} />);
    expect(screen.getByText("Alıcı firma, şartname ve ekli belgeler doğrulanmış firmalara açılır")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kaydol — teklif firma doğrulamasıyla" })).toHaveAttribute(
      "href",
      expect.stringContaining("/company/kayit?intent=teklif"),
    );
    expect(screen.getByText(/tek şart ücretsiz firma doğrulamasıdır/)).toBeInTheDocument();
    expect(screen.getByText("Firma doğrulamasıyla: alıcı adı, şartname ve ekli belgeler")).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/üyelere açık|kayıtlı (kullanıcı|firma)lara/);
    expect(text).not.toMatch(/Teklif vermek için kaydol/);
    // Ücretsiz dönem (2026-10-07): hiçbir yerde paket adı yazmaz.
    expect(text).not.toMatch(/Gold|Silver|paket|premium/i);
  });

  it("mobil (g02-04 / g02-07): kalem adı kırpılmaz, sarar; miktar tek satır; kategori çipi tek blok sarar", () => {
    const long = "Sıva altı dağıtım panosu 36 modül IP40 metal kapaklı";
    render(<ListingDetail listing={{ ...base, items: [{ lineNo: 1, name: long, quantity: "4", unit: "adet" }] } as PublicListingDetail} />);
    const name = screen.getByText(long, { selector: "li span" });
    // jsdom yerleşim yapmaz; sınıflar sözleşmedir: `truncate` adı tek satıra kesiyordu.
    expect(name.className).not.toMatch(/(^|\s)truncate(\s|$)/);
    expect(name.className).toMatch(/(^|\s)break-words(\s|$)/);
    const row = name.parentElement as HTMLElement;
    expect(row.className).toMatch(/(^|\s)items-start(\s|$)/);
    const qty = row.lastElementChild as HTMLElement;
    expect(qty.className).toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
    expect(qty.className).toMatch(/(^|\s)shrink-0(\s|$)/);
    const chip = screen.getByRole("link", { name: "Vidalar" });
    expect(chip.className).toMatch(/(^|\s)inline-block(\s|$)/);
    expect(chip.className).toMatch(/(^|\s)max-w-full(\s|$)/);
  });

  it("talep numarası tabular rakamsız ve harf aralıksız tek belirteç (smoke-public#new1: 'ROT -000846' boşluğu)", () => {
    render(<ListingDetail listing={base} />);
    // Başlık kartındaki numara (bilgi tablosunda da geçer).
    const ref = screen.getAllByText("ROT-000295").find((el) => el.closest("header")) as HTMLElement;
    expect(ref).toBeTruthy();
    // Inter'in tabular tiresi rakam genişliği alıp sağa yaslanıyor → tire önünde boşluk.
    expect(ref.className).not.toMatch(/tabular-nums|(^|\s)tnum(\s|$)|tracking-(?!normal)/);
    expect(ref.className).toMatch(/(^|\s)normal-nums(\s|$)/);
    expect(ref.className).toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
  });
});
