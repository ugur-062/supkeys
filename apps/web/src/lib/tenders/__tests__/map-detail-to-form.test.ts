import { describe, expect, it } from "vitest";
import type { ListingDetail } from "@/hooks/use-company-listings";
import {
  copyTitle,
  hasRetiredCategory,
  mapDetailToForm,
  seedHasRetiredCategory,
  toDateInput,
  toLocalInput,
} from "../map-detail-to-form";
import { makeTenderFormSchema } from "../form-schema";

const detail = {
  id: "l1",
  title: "Çelik alımı",
  description: "açıklama",
  type: "ALIM",
  format: "RFQ",
  status: "OPEN",
  visibility: "PUBLIC",
  isInternational: false,
  targetCountries: [],
  closesAt: "2026-07-05T11:30:00.000Z",
  bidsOpenAt: null,
  primaryCurrency: "TRY",
  allowedCurrencies: ["TRY"],
  paymentCategory: "ADVANCE",
  advancePercent: 100,
  items: [
    {
      id: "i1",
      name: "Çelik",
      quantity: "5",
      unit: "ton",
      questions: [],
    },
  ],
  invitations: [
    { companyName: "A", rothernId: "ROT-0001" },
    { companyName: "B", rothernId: null },
  ],
} as unknown as ListingDetail;

describe("toLocalInput / toDateInput", () => {
  it("null/boş → ''", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toDateInput(undefined)).toBe("");
  });
  it("geçersiz ISO → ''", () => {
    expect(toLocalInput("xx")).toBe("");
  });
  it("geçerli ISO → biçim", () => {
    expect(toDateInput("2026-07-05T11:30:00.000Z")).toBe("2026-07-05");
    expect(toLocalInput("2026-07-05T11:30:00.000Z")).toMatch(
      /^2026-07-05T\d{2}:\d{2}$/,
    );
  });
  it("UTC'nin batısındaki tarayıcıda gün kaymaz; kayıtla gidiş-dönüş simetrik (derin denetim S095)", () => {
    const prev = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      // map-to-input tarih alanını böyle yazar: "YYYY-MM-DD" → UTC gece yarısı.
      const saved = new Date("2026-10-05").toISOString();
      expect(saved).toBe("2026-10-05T00:00:00.000Z");
      expect(toDateInput(saved)).toBe("2026-10-05");
      expect(toDateInput("2026-10-05")).toBe("2026-10-05");
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });
});

describe("mapDetailToForm", () => {
  it("derin denetim S028: eski talepteki 3-4 ondalık teklif/DB ölçeğine (2) indirilir", () => {
    const legacy = { ...detail, decimalPlaces: 4 } as unknown as ListingDetail;
    expect(mapDetailToForm(legacy, { forCopy: true }).decimalPlaces).toBe(2);
    const zero = { ...detail, decimalPlaces: 0 } as unknown as ListingDetail;
    expect(mapDetailToForm(zero).decimalPlaces).toBe(0);
  });

  // 2026-10-09 (W-11): gizli segmentteki kod forma taşınmaz — düzenlemede çip
  // olarak görünmez, kopyada yeni talebe ön-seçili gelmez.
  it("gizli segmentteki kategori forma taşınmaz (düzenleme ve kopya); görünürler sırayla kalır", () => {
    const legacy = { ...detail, categoryIds: ["46101500", "39121600", "10151500", "31161500"] } as unknown as ListingDetail;
    expect(mapDetailToForm(legacy).categoryIds).toEqual(["39121600", "31161500"]);
    expect(mapDetailToForm(legacy, { forCopy: true }).categoryIds).toEqual(["39121600", "31161500"]);
  });

  it("yalnız gizli kategorisi olan eski talep kategorisiz açılır → formun 'kategori zorunlu' kuralı güncel kategori ister", () => {
    const legacy = { ...detail, categoryIds: ["46101500"] } as unknown as ListingDetail;
    const form = mapDetailToForm(legacy);
    expect(form.categoryIds).toEqual([]);
    const schema = makeTenderFormSchema((key) => key);
    const parsed = schema.safeParse({ ...form, deliveryAddressId: "addr-1" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === "categoryIds" && i.message === "formSchema.categoryMin")).toBe(true);
    }
  });

  // Gözden geçirme R-WEB-01: YAYINDAKİ talebin düzenlemesinde kategori zorunlu
  // değildir — aynı form, `categoryRequired: false` şemasından geçer.
  it("yalnız gizli kategorisi olan YAYINDAKİ talep: kategorisiz form canlı düzenleme şemasından geçer", () => {
    const legacy = { ...detail, categoryIds: ["46101500"] } as unknown as ListingDetail;
    const form = { ...mapDetailToForm(legacy), deliveryAddressId: "addr-1", deliveryTerm: "DOMESTIC_DELIVERED", bidsCloseAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    const liveEdit = makeTenderFormSchema((key) => key, { categoryRequired: false }).safeParse(form);
    expect(liveEdit.error?.issues ?? []).toEqual([]);
    const publish = makeTenderFormSchema((key) => key).safeParse(form);
    expect(publish.error?.issues.map((i) => i.message)).toEqual(["formSchema.categoryMin"]);
  });

  // 2026-10-10: 46 görünür sektör. Koruyucu giysi (46181500) sıradan bir
  // kategoridir: forma taşınır, "kullanımdan kalktı" işareti doğurmaz. Gizli
  // sınıfın yaprağı (46182501) gizli ailenin kodu gibi düşer ve işaretlenir.
  it("46'nın görünür kategorisi forma taşınır; gizli sınıfı taşınmaz ve işaret doğurur", () => {
    const mixed = { ...detail, categoryIds: ["46181500", "46182501", "46191600"] } as unknown as ListingDetail;
    expect(mapDetailToForm(mixed).categoryIds).toEqual(["46181500", "46191600"]);
    expect(hasRetiredCategory({ categoryIds: ["46181500", "46191600"] })).toBe(false);
    expect(hasRetiredCategory({ categoryIds: ["46181500", "46182501"] })).toBe(true);
  });

  it("hasRetiredCategory: saklanan kodlarda gizli segment varsa true; görünür / boş listede false", () => {
    expect(hasRetiredCategory({ categoryIds: ["46101500"] })).toBe(true);
    expect(hasRetiredCategory({ categoryIds: ["39121600", "10151500"] })).toBe(true);
    expect(hasRetiredCategory({ categoryIds: ["39121600", "31161500"] })).toBe(false);
    // Güncel API sahibine görünür kodları verir: tek kategorisi gizli talep boş liste gelir.
    expect(hasRetiredCategory({ categoryIds: [] })).toBe(false);
    expect(hasRetiredCategory({})).toBe(false);
    // Güncel API: kodlar yalnız görünür gelir, saklanan gizli kodu işaret söyler.
    expect(hasRetiredCategory({ categoryIds: [], hasRetiredCategory: true })).toBe(true);
    expect(hasRetiredCategory({ categoryIds: ["39121600"], hasRetiredCategory: true })).toBe(true);
    expect(hasRetiredCategory({ categoryIds: ["39121600"], hasRetiredCategory: false })).toBe(false);
  });

  it("düzenleme: alanlar detaydan gelir", () => {
    const f = mapDetailToForm(detail);
    expect(f.title).toBe("Çelik alımı");
    expect(f.type).toBe("RFQ");
    expect(f.items[0]).toMatchObject({ name: "Çelik", quantity: 5, unit: "ton" });
    expect(f.bidsCloseAt).not.toBe(""); // closesAt taşınır
    expect(f.invitedSupplierIds).toEqual(["ROT-0001"]); // null rothernId atılır
  });

  it("kopya: başlık sayaç alır, kapanış boşalır, açılış 'şimdi' olur", () => {
    const f = mapDetailToForm(detail, { forCopy: true });
    expect(f.title).toBe("Çelik alımı (2)");
    expect(f.bidsCloseAt).toBe("");
    // Açılış "şimdi" öntanımlı (YYYY-MM-DDTHH:mm) — kaynaktan kopyalanmaz.
    expect(f.bidsOpenAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("copyTitle: '(kopya)' zinciri temizlenir, sayaç tek seviyede artar (Faz 6.5)", () => {
    expect(copyTitle("X")).toBe("X (2)");
    expect(copyTitle("X (2)")).toBe("X (3)");
    expect(copyTitle("X (kopya)")).toBe("X (2)");
    expect(copyTitle("X (kopya) (kopya)")).toBe("X (2)");
    expect(copyTitle("X (kopya) (kopya) (kopya)")).toBe("X (2)");
  });
});

/**
 * Canlı doğrulama CP-05: kopya yolları (`?from=`, "Son taleplerden başla")
 * kategori alanını nedensiz boş açıyordu — gizli kod forma girmez, form da
 * nedenini değerlerden bilemez. Eşleyici tohumu işaretler, form sorar.
 */
describe("seedHasRetiredCategory — tohum eski kategorili talepten mi", () => {
  it("API işaretiyle (hasRetiredCategory) gelen talep: düzenleme ve kopya tohumu işaretlidir, gizli kod forma girmez", () => {
    const legacy = { ...detail, categoryIds: [], hasRetiredCategory: true } as unknown as ListingDetail;
    for (const seed of [mapDetailToForm(legacy), mapDetailToForm(legacy, { forCopy: true })]) {
      expect(seedHasRetiredCategory(seed)).toBe(true);
      expect(seed.categoryIds).toEqual([]);
    }
  });

  it("saklanan kodları taşıyan yanıt (eski API): gizli kod düşer, tohum işaretlenir; görünür kod kalır", () => {
    const seed = mapDetailToForm({ ...detail, categoryIds: ["46101500", "31161500"] } as unknown as ListingDetail, { forCopy: true });
    expect(seed.categoryIds).toEqual(["31161500"]);
    expect(seedHasRetiredCategory(seed)).toBe(true);
  });

  it("eski kategorisi olmayan talebin tohumu işaretsizdir (kategorisiz talep dahil)", () => {
    expect(seedHasRetiredCategory(mapDetailToForm({ ...detail, categoryIds: ["31161500"] } as unknown as ListingDetail))).toBe(false);
    expect(seedHasRetiredCategory(mapDetailToForm({ ...detail, categoryIds: [] } as unknown as ListingDetail, { forCopy: true }))).toBe(false);
  });

  it("işaret nesneye bağlıdır: eşleyiciden gelmeyen tohum (şablon, boş form) ve boş değer işaretsizdir", () => {
    const legacy = { ...detail, categoryIds: [], hasRetiredCategory: true } as unknown as ListingDetail;
    expect(seedHasRetiredCategory({ ...mapDetailToForm(legacy) })).toBe(false);
    expect(seedHasRetiredCategory(undefined)).toBe(false);
    expect(seedHasRetiredCategory(null)).toBe(false);
  });
});
