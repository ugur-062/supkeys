import { describe, expect, it } from "vitest";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";
import { EMPTY_REQUEST_FILTERS, type RequestFilterState } from "../request-filter-params";
import { matchedItemName, passes, requestFacets, rowSegments, sortRequests } from "../request-facets";

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
    ownerCountry: "TR",
    canBid: true,
    invited: false,
    connected: false,
    myBidStatus: null,
    myBidSubmitCount: null,
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

  it("uygunluk grup içi VEYA; kategori segmentte; kapsam/usul/para/alıcı/alıcı ülkesi", () => {
    const r = row({ invited: true, isInternational: true, currency: "USD", format: "ENGLISH_AUCTION", ownerCountry: "DE" });
    expect(passes(r, F({ fit: ["baglanti", "davet"] }), NOW)).toBe(true);
    expect(passes(r, F({ fit: ["baglanti"] }), NOW)).toBe(false);
    expect(passes(r, F({ categories: ["39000000"] }), NOW)).toBe(true);
    expect(passes(r, F({ categories: ["23000000"] }), NOW)).toBe(false);
    expect(passes(r, F({ format: "pazarlik" }), NOW)).toBe(true);
    expect(passes(r, F({ format: "teklif" }), NOW)).toBe(false);
    expect(passes(r, F({ currencies: ["USD", "EUR"] }), NOW)).toBe(true);
    expect(passes(r, F({ currencies: ["TRY"] }), NOW)).toBe(false);
    expect(passes(r, F({ buyers: ["c1"] }), NOW)).toBe(true);
    expect(passes(row({ owner: null }), F({ buyers: ["c1"] }), NOW)).toBe(false);
    expect(passes(r, F({ countries: ["DE"] }), NOW)).toBe(true);
    expect(passes(r, F({ countries: ["TR"] }), NOW)).toBe(false);
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
      row({ ownerCountry: "TR", currency: "TRY" }),
      row({ ownerCountry: "DE", currency: "USD" }),
      row({ ownerCountry: "DE", currency: "TRY", status: "AWARDED" }),
    ];
    const f = F({ countries: ["TR"], currencies: ["EUR"] });
    const fx = requestFacets(rows, f, NAMES, NOW);
    // Ülke sayacı: ülke süzgeci HARİÇ (durum aktif + para EUR uygulanır → hiçbiri EUR değil → 0'lar)
    expect(fx.countries).toEqual([
      { key: "TR", label: "TR", count: 0 },
    ]);
    // Para sayacı: para süzgeci HARİÇ (aktif + TR) → TRY 1; seçili EUR 0 ile listede
    expect(fx.currencies).toEqual([
      { key: "TRY", label: "TRY", count: 1 },
      { key: "EUR", label: "EUR", count: 0 },
    ]);
    // Durum sayacı: durum HARİÇ (TR + EUR) → hepsi 0
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
    expect(fx.format).toEqual({ teklif: 2, pazarlik: 0 });
  });

  it("gizli segment (segment listesinde yok) kategori yüzünde ham kodla GÖRÜNMEZ (arayüz testi D-009)", () => {
    const rows = [
      row({ categories: [{ code: "39121501", name: "Kablo" }] }),
      // 10 = gizli segment (canlı hayvan) — eski test verisi.
      row({ categories: [{ code: "10101501", name: "Canlı hayvan" }] }),
    ];
    const fx = requestFacets(rows, F({ status: "tumu" }), NAMES, NOW);
    expect(fx.categories).toEqual([{ key: "39000000", label: "Elektrik", count: 1 }]);
    expect(fx.categories.some((c) => c.label === "10000000")).toBe(false);
  });

  // 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" görünür,
  // silah / kolluk dalları gizli. Sektör adı listede VAR; gizli daldaki talep
  // yine de o sektöre sayılmaz ve o sektörün süzgecinden geçmez — kod segmente
  // yuvarlanmadan ÖNCE sınanır (ada bakan eski süzgeç bunu yakalayamazdı).
  it("görünür sektörün gizli dalındaki talep o sektöre sayılmaz ve süzgecinden geçmez; görünür dalındaki sayılır", () => {
    const names = new Map([...NAMES, ["46000000", "İş Güvenliği ve Yangın Ekipmanları"]]);
    const weapon = row({ categories: [{ code: "46101500", name: "Ateşli silahlar" }] });
    const spray = row({ categories: [{ code: "46182501", name: "Biber gazı" }] });
    const glove = row({ categories: [{ code: "46181500", name: "Koruyucu giysi" }] });
    const mixed = row({ categories: [{ code: "46151600", name: "Kalabalık kontrol" }, { code: "46191600", name: "Yangın söndürücüler" }] });
    expect(rowSegments(weapon)).toEqual([]);
    expect(rowSegments(spray)).toEqual([]);
    expect(rowSegments(glove)).toEqual(["46000000"]);
    expect(rowSegments(mixed)).toEqual(["46000000"]);

    const fx = requestFacets([weapon, spray, glove, mixed], F(), names, NOW);
    expect(fx.categories).toEqual([{ key: "46000000", label: "İş Güvenliği ve Yangın Ekipmanları", count: 2 }]);
    const only46 = F({ categories: ["46000000"] });
    expect([weapon, spray, glove, mixed].filter((r) => passes(r, only46, NOW)).map((r) => r.id)).toEqual([glove.id, mixed.id]);
  });
});

describe("requestFacets — tarama tavanı (D-116, yeniden doğrulama)", () => {
  const CAPS = { open: 3, past: 2 };
  const rows = () => [
    row({ ownerCountry: "TR" }),
    row({ ownerCountry: "TR" }),
    row({ ownerCountry: "DE" }),
    row({ status: "AWARDED", ownerCountry: "TR" }),
    row({ status: "AWARDED", ownerCountry: "DE" }),
  ];

  it("tavandaki kapsamın tamamı sayılıyorsa durum sayacı alt sınırdır (başlıkla aynı karar)", () => {
    const fx = requestFacets(rows(), F({ status: "gecmis" }), NAMES, NOW, {}, CAPS);
    expect(fx.status).toEqual({ aktif: 3, gecmis: 2, tumu: 5 });
    expect(fx.statusAtLeast).toEqual({ aktif: true, gecmis: true, tumu: true });
  });

  it("süzgeç kapsamı daraltınca sayı kesin; tavan altındaki kapsam hiç '+' almaz", () => {
    const narrowed = requestFacets(rows(), F({ countries: ["TR"] }), NAMES, NOW, {}, CAPS);
    expect(narrowed.status).toEqual({ aktif: 2, gecmis: 1, tumu: 3 });
    expect(narrowed.statusAtLeast).toEqual({ aktif: false, gecmis: false, tumu: false });
    const below = requestFacets(rows(), F(), NAMES, NOW, {}, { open: 10, past: 10 });
    expect(below.statusAtLeast).toEqual({ aktif: false, gecmis: false, tumu: false });
  });
});

describe("alıcı ülkesi — alıcı şehri süzgecinin yerine (2026-10-04 sahip kararı)", () => {
  const COUNTRY: Record<string, string> = { TR: "Турция", DE: "Германия", GB: "Великобритания", CA: "Канада" };
  const labels = { country: (c: string) => COUNTRY[c] ?? c };

  it("şehir boyutu YOK: facet'te `cities` anahtarı yok, eski `?sehir=` durumu taşınmaz", () => {
    const fx = requestFacets([row(), row({ ownerCountry: "DE" })], F(), NAMES, NOW, labels);
    expect(fx).not.toHaveProperty("cities");
    expect(F()).not.toHaveProperty("cities");
  });

  it("maskeli satır (alıcı adı yok) da ülke sayacına ve süzgecine girer", () => {
    const masked = row({ id: "masked:ROT-9", masked: true, owner: null, ownerCountry: "DE", canBid: false });
    const rows = [row(), masked];
    const fx = requestFacets(rows, F(), NAMES, NOW, labels);
    expect(fx.countries).toEqual([
      { key: "DE", label: "Германия", count: 1 },
      { key: "TR", label: "Турция", count: 1 },
    ]);
    expect(rows.filter((r) => passes(r, F({ countries: ["DE"] }), NOW))).toEqual([masked]);
  });

  it("alıcı ülkesi süzgeci + bağlamsal sayaç (kendi boyutu hariç), etiket çevirmenden", () => {
    const rows = [
      row({ ownerCountry: "TR", currency: "TRY" }),
      row({ ownerCountry: "TR", currency: "USD" }),
      row({ ownerCountry: "DE", currency: "EUR" }),
    ];
    expect(passes(rows[2]!, F({ countries: ["DE"] }), NOW)).toBe(true);
    expect(passes(rows[0]!, F({ countries: ["DE"] }), NOW)).toBe(false);
    expect(passes(row({ ownerCountry: null }), F({ countries: ["TR"] }), NOW)).toBe(false);
    const fx = requestFacets(rows, F({ countries: ["DE"], currencies: ["TRY", "EUR"] }), NAMES, NOW, labels);
    // Ülke sayacı ülke süzgeci HARİÇ (para TRY/EUR uygulanır): TR 1, DE 1.
    expect(fx.countries).toEqual([
      { key: "DE", label: "Германия", count: 1 },
      { key: "TR", label: "Турция", count: 1 },
    ]);
    // Seçili ama sonuçsuz ülke listede kalır.
    const none = requestFacets(rows, F({ countries: ["GB"] }), NAMES, NOW, labels);
    expect(none.countries.find((c) => c.key === "GB")).toEqual({ key: "GB", label: "Великобритания", count: 0 });
  });
});

describe("seçili ama listede olmayan alıcı (derin denetim LU-24)", () => {
  it("etiket çağıranın katalog metninden gelir, sabit Türkçe değil", () => {
    const rows = [row()];
    const fx = requestFacets(rows, F({ buyers: ["gone"] }), NAMES, NOW, { unknownBuyer: "Buyer" });
    expect(fx.buyers.find((b) => b.key === "gone")).toEqual({ key: "gone", label: "Buyer", count: 0 });
    const bare = requestFacets(rows, F({ buyers: ["gone"] }), NAMES, NOW);
    expect(bare.buyers.find((b) => b.key === "gone")?.label).toBe("—");
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
