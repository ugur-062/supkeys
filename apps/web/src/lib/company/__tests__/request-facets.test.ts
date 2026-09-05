import { describe, expect, it } from "vitest";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";
import { EMPTY_REQUEST_FILTERS, type RequestFilterState } from "../request-filter-params";
import { matchedItemName, passes, requestFacets, sortRequests } from "../request-facets";

const NOW = Date.parse("2026-09-05T10:00:00Z");
const DAY = 86_400_000;
let seq = 0;
function row(over: Partial<SellerTenderRow> = {}): SellerTenderRow {
  seq++;
  return {
    id: `l${seq}`,
    number: `ROT-${seq}`,
    title: `Talep ${seq}`,
    status: "OPEN",
    visibility: "PUBLIC",
    format: "RFQ",
    currency: "TRY",
    isInternational: false,
    closesAt: new Date(NOW + 10 * DAY).toISOString(),
    createdAt: new Date(NOW - 2 * DAY).toISOString(),
    itemCount: 1,
    owner: { id: "c1", name: "Alıcı A" },
    ownerCity: "Bursa",
    masked: false,
    canBid: true,
    invited: false,
    connected: false,
    myBidStatus: null,
    myBidVersion: null,
    categoryMatch: false,
    categories: [{ code: "39121501", name: "Kablo" }],
    extraCategoryCount: 0,
    ...over,
  };
}
const F = (over: Partial<RequestFilterState> = {}): RequestFilterState => ({ ...EMPTY_REQUEST_FILTERS, ...over });
const NAMES = new Map([["39000000", "Elektrik"], ["23000000", "Makine"]]);

describe("passes — her boyut", () => {
  it("durum: aktif yalnız OPEN, geçmiş yalnız OPEN olmayan, tümü hepsi", () => {
    const open = row();
    const past = row({ status: "AWARDED" });
    expect(passes(open, F(), NOW)).toBe(true);
    expect(passes(past, F(), NOW)).toBe(false);
    expect(passes(past, F({ status: "gecmis" }), NOW)).toBe(true);
    expect(passes(open, F({ status: "gecmis" }), NOW)).toBe(false);
    expect(passes(past, F({ status: "tumu" }), NOW)).toBe(true);
  });

  it("uygunluk grup içi VEYA; kategori segmentte; kapsam/usul/para/alıcı/şehir", () => {
    const r = row({ invited: true, isInternational: true, currency: "USD", format: "ENGLISH_AUCTION", ownerCity: "İzmir" });
    expect(passes(r, F({ fit: ["baglanti", "davet"] }), NOW)).toBe(true);
    expect(passes(r, F({ fit: ["baglanti"] }), NOW)).toBe(false);
    expect(passes(r, F({ categories: ["39000000"] }), NOW)).toBe(true);
    expect(passes(r, F({ categories: ["23000000"] }), NOW)).toBe(false);
    expect(passes(r, F({ scope: "uluslararasi" }), NOW)).toBe(true);
    expect(passes(r, F({ scope: "yurtici" }), NOW)).toBe(false);
    expect(passes(r, F({ format: "pazarlik" }), NOW)).toBe(true);
    expect(passes(r, F({ format: "teklif" }), NOW)).toBe(false);
    expect(passes(r, F({ currencies: ["USD", "EUR"] }), NOW)).toBe(true);
    expect(passes(r, F({ currencies: ["TRY"] }), NOW)).toBe(false);
    expect(passes(r, F({ buyers: ["c1"] }), NOW)).toBe(true);
    expect(passes(row({ owner: null, masked: true }), F({ buyers: ["c1"] }), NOW)).toBe(false);
    expect(passes(r, F({ cities: ["İzmir"] }), NOW)).toBe(true);
    expect(passes(r, F({ cities: ["Bursa"] }), NOW)).toBe(false);
  });

  it("kapanış: N gün içinde, yalnız açık ve gelecekteki; yayın tarihi: son N gün", () => {
    const soon = row({ closesAt: new Date(NOW + 2 * DAY).toISOString() });
    const far = row({ closesAt: new Date(NOW + 20 * DAY).toISOString() });
    const expired = row({ closesAt: new Date(NOW - DAY).toISOString() });
    expect(passes(soon, F({ closing: 3 }), NOW)).toBe(true);
    expect(passes(far, F({ closing: 7 }), NOW)).toBe(false);
    expect(passes(far, F({ closing: 30 }), NOW)).toBe(true);
    expect(passes(expired, F({ closing: 7 }), NOW)).toBe(false);
    const old = row({ createdAt: new Date(NOW - 40 * DAY).toISOString() });
    expect(passes(old, F({ period: 30 }), NOW)).toBe(false);
    expect(passes(old, F({ period: 90 }), NOW)).toBe(true);
  });

  it("arama başlık/numara/alıcı/KALEM/kategori adında, Türkçe küçük harf duyarsız; `except` boyutu atlar", () => {
    const r = row({ title: "Çelik Boru Alımı", itemNames: ["Dirsek 90°", "Flanş DN100"] });
    expect(passes(r, F({ q: "ÇELİK" }), NOW)).toBe(true);
    expect(passes(r, F({ q: "vida" }), NOW)).toBe(false);
    expect(passes(r, F({ q: "vida" }), NOW, "q")).toBe(true);
    expect(passes(r, F({ q: "alıcı a" }), NOW)).toBe(true);
    // Kalem adı ve kategori adı da samanlıkta ("kalem" araması — 2026-09-05).
    expect(passes(r, F({ q: "flanş" }), NOW)).toBe(true);
    expect(passes(r, F({ q: "kablo" }), NOW)).toBe(true);
    expect(matchedItemName(r, "dn100")).toBe("Flanş DN100");
    expect(matchedItemName(r, "çelik")).toBeNull();
    // Çok kelimeli sorgu: kelimeler AND, sıra önemsiz (AI araması 2-4 kelime üretir).
    expect(passes(r, F({ q: "boru çelik" }), NOW)).toBe(true);
    expect(passes(r, F({ q: "çelik vida" }), NOW)).toBe(false);
    expect(matchedItemName(r, "flanş dn100")).toBe("Flanş DN100");
    expect(matchedItemName(r, "dirsek dn100")).toBe("Dirsek 90°");
    // Türkçe ek toleransı: "boruları" → "boru"; "flanşı" → "flan…" (ön ek).
    expect(passes(r, F({ q: "çelik boruları" }), NOW)).toBe(true);
    expect(matchedItemName(r, "flanşları")).toBe("Flanş DN100");
  });
});

describe("requestFacets — bağlamsal sayaçlar", () => {
  it("her boyut kendisi hariç süzgeçlerle sayılır; seçili değer 0 olsa da listede", () => {
    const rows = [
      row({ ownerCity: "Bursa", currency: "TRY" }),
      row({ ownerCity: "İzmir", currency: "USD" }),
      row({ ownerCity: "İzmir", currency: "TRY", status: "AWARDED" }),
    ];
    const f = F({ cities: ["Bursa"], currencies: ["EUR"] });
    const fx = requestFacets(rows, f, NAMES, NOW);
    // Şehir sayacı: şehir süzgeci HARİÇ (durum aktif + para EUR uygulanır → hiçbiri EUR değil → 0'lar)
    expect(fx.cities).toEqual([
      { key: "Bursa", label: "Bursa", count: 0 },
    ]);
    // Para sayacı: para süzgeci HARİÇ (aktif + Bursa) → TRY 1; seçili EUR 0 ile listede
    expect(fx.currencies).toEqual([
      { key: "TRY", label: "TRY", count: 1 },
      { key: "EUR", label: "EUR", count: 0 },
    ]);
    // Durum sayacı: durum HARİÇ (Bursa + EUR) → hepsi 0
    expect(fx.status).toEqual({ aktif: 0, gecmis: 0, tumu: 0 });
  });

  it("kategori segment adıyla ve satır başına bir kez; alıcı ada göre; kapanış/dönem pencereleri", () => {
    const rows = [
      row({ categories: [{ code: "39121501", name: "Kablo" }, { code: "39131700", name: "Pano" }], closesAt: new Date(NOW + 2 * DAY).toISOString() }),
      row({ categories: [{ code: "23151800", name: "Pres" }], owner: { id: "c2", name: "Alıcı B" }, createdAt: new Date(NOW - 50 * DAY).toISOString() }),
    ];
    const fx = requestFacets(rows, F(), NAMES, NOW);
    expect(fx.categories).toEqual([
      { key: "39000000", label: "Elektrik", count: 1 },
      { key: "23000000", label: "Makine", count: 1 },
    ]);
    expect(fx.buyers.map((b) => `${b.label}:${b.count}`)).toEqual(["Alıcı A:1", "Alıcı B:1"]);
    expect(fx.closing).toEqual({ 3: 1, 7: 1, 30: 2 });
    expect(fx.period).toEqual({ 7: 1, 30: 1, 90: 2 });
    expect(fx.fit).toEqual({ davet: 0, baglanti: 0, urun: 0, kategori: 0, teklif: 0 });
    expect(fx.scope).toEqual({ yurtici: 2, uluslararasi: 0 });
    expect(fx.format).toEqual({ teklif: 2, pazarlik: 0 });
  });
});

describe("sortRequests", () => {
  it("merdiven seçimin üstünde: davetli › bağlantılı › kategori › gerisi; kademe içinde seçim", () => {
    const rows = [
      row({ title: "Gerisi-uzak", closesAt: new Date(NOW + 9 * DAY).toISOString() }),
      row({ title: "Gerisi-yakın", closesAt: new Date(NOW + 1 * DAY).toISOString() }),
      row({ title: "Kategori", categoryMatch: true, closesAt: new Date(NOW + 30 * DAY).toISOString() }),
      row({ title: "Bağlantılı", connected: true }),
      row({ title: "Davetli", invited: true }),
    ];
    expect(sortRequests(rows, "yakin").map((r) => r.title)).toEqual(["Davetli", "Bağlantılı", "Kategori", "Gerisi-yakın", "Gerisi-uzak"]);
    expect(sortRequests(rows, "uzak").map((r) => r.title).slice(3)).toEqual(["Gerisi-uzak", "Gerisi-yakın"]);
  });

  it("'en yeni' oluşturma tarihine göre; kapanışsızlar sona", () => {
    const rows = [
      row({ title: "Eski", createdAt: new Date(NOW - 5 * DAY).toISOString(), closesAt: null }),
      row({ title: "Yeni", createdAt: new Date(NOW - 1 * DAY).toISOString() }),
    ];
    expect(sortRequests(rows, "yeni").map((r) => r.title)).toEqual(["Yeni", "Eski"]);
    expect(sortRequests(rows, "yakin").map((r) => r.title)).toEqual(["Yeni", "Eski"]);
  });
});
