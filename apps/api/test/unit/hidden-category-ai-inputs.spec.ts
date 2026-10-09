import { sanitizeAiDraft } from "../../src/modules/ai/tender-extract/ai-draft-sanitizer";
import { localizeToolCodes, redactHiddenCategories } from "../../src/modules/ai/assistant/assistant-tools";

/**
 * GİZLİ SEGMENT — AI girdileri (2026-10-09, kullanıcı: "anasayfada olmayan
 * kategori talepte, üründe ya da başka yerde de gösterilmesin"; model istemi
 * ve asistan kartı dahil). Eski kayıt durur, yalnız gizli kategorisi görünmez.
 *
 *  - AI talep taslağı: segment gizlenmeden önce önerilmiş kod eski oturumdan ya
 *    da istemcideki taslaktan geri gelmez (`sanitizeAiDraft`); boşalan öneri
 *    "kategori eksik" sayılır ve yeniden önerilir.
 *  - Asistan araç sonuçları: gizli kategori (kod / ad / referans) modele gitmez
 *    (`redactHiddenCategories`).
 *
 * Örnek kodlar: 46xxxxxx ve 10xxxxxx gizli, 30/31/39 görünür.
 */
describe("sanitizeAiDraft — gizli segmentteki kategori önerisi taşınmaz", () => {
  const base = {
    title: "500 adet baret alımı",
    deliveryTerm: "DOMESTIC_DELIVERED",
    bidsCloseAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    items: [{ name: "Baret", quantity: 500, unit: "adet" }],
  };

  it("eski oturumdaki 46/10 kodu düşer, görünür kod sırasıyla kalır", () => {
    const s = sanitizeAiDraft(
      { ...base, suggestedCategoryIds: ["46181700", "30191500", "10101500", " 31161500 "] },
      "refine",
    );
    expect(s.draft.suggestedCategoryIds).toEqual(["30191500", "31161500"]);
    expect(s.missingRequired).not.toContain("category");
  });

  it("yalnız gizli kod kalmışsa öneri boşalır ve kategori EKSİK sayılır (yeniden önerilsin)", () => {
    const s = sanitizeAiDraft({ ...base, suggestedCategoryIds: ["46181700"] }, "refine");
    expect(s.draft.suggestedCategoryIds).toEqual([]);
    expect(s.missingRequired).toContain("category");
    // Modele giden taslak bağlamında da kod yok.
    expect(JSON.stringify(s.draft)).not.toContain("46181700");
  });

  it("gizli kod on öneri tavanında yer kapmaz", () => {
    const hidden = Array.from({ length: 10 }, (_, i) => `4618${String(1000 + i)}`);
    const s = sanitizeAiDraft({ ...base, suggestedCategoryIds: [...hidden, "39121500"] }, "refine");
    expect(s.draft.suggestedCategoryIds).toEqual(["39121500"]);
  });

  it("belge yolu da aynı kuraldan geçer; katalog dışı biçim eskisi gibi servis doğrulamasına kalır", () => {
    const s = sanitizeAiDraft({ ...base, suggestedCategoryIds: ["10101500", "cat-1"] }, "text");
    expect(s.draft.suggestedCategoryIds).toEqual(["cat-1"]);
  });
});

describe("redactHiddenCategories — asistan araç sonucu", () => {
  it("talep listesi satırı: gizli kod ve kategori referansı düşer, görünür olan ve kaydın kendisi kalır", () => {
    const rows = [
      {
        id: "cku1legacy",
        title: "Baret alımı",
        status: "OPEN",
        categoryIds: ["46181700", "30191500"],
        categories: [
          { code: "46181700", name: "Baş koruma" },
          { code: "30191500", name: "İskeleler" },
        ],
        paymentCategory: "DEFERRED",
        closesAt: new Date("2026-10-20T10:00:00Z"),
      },
    ];
    const out = redactHiddenCategories(rows) as typeof rows;
    expect(out[0]).toEqual({
      id: "cku1legacy",
      title: "Baret alımı",
      status: "OPEN",
      categoryIds: ["30191500"],
      categories: [{ code: "30191500", name: "İskeleler" }],
      paymentCategory: "DEFERRED",
      closesAt: new Date("2026-10-20T10:00:00Z"),
    });
    const json = JSON.stringify(out);
    expect(json).not.toContain("46181700");
    expect(json).not.toContain("Baş koruma");
    // Girdi değişmedi (servis yanıtı başka yerde de kullanılır).
    expect(rows[0]!.categoryIds).toEqual(["46181700", "30191500"]);
  });

  it("firma profili: `{ id, name }` kategorileri, dört beyan dizisi, tekil kategori / segment alanları", () => {
    const profile = {
      rothernId: "RTH-1",
      name: "Güvenlik Ekipmanları AŞ",
      categories: [
        { id: "46000000", name: "Kolluk, Ulusal Güvenlik ve Emniyet Ekipmanları" },
        { id: "31000000", name: "İmalat bileşenleri" },
      ],
      sellerCategoryIds: ["46000000", "31000000"],
      sellerSubCategoryIds: ["46180000", "46181700", "31160000"],
      buyerCategoryIds: ["10000000"],
      buyerSubCategoryIds: [],
      products: [
        {
          id: "p1",
          name: "Baret",
          categoryId: "46181700",
          category: { id: "46181700", name: "Baş koruma" },
          segment: { id: "46000000", name: "Kolluk", slug: "46000000-kolluk" },
        },
        {
          id: "p2",
          name: "Vida",
          categoryId: "31161500",
          category: { id: "31161500", name: "Vidalar" },
          segment: { id: "31000000", name: "İmalat bileşenleri", slug: "31000000-imalat" },
        },
      ],
    };
    const out = redactHiddenCategories(profile) as typeof profile;
    expect(out.categories).toEqual([{ id: "31000000", name: "İmalat bileşenleri" }]);
    expect(out.sellerCategoryIds).toEqual(["31000000"]);
    expect(out.sellerSubCategoryIds).toEqual(["31160000"]);
    expect(out.buyerCategoryIds).toEqual([]);
    expect(out.products[0]).toEqual({ id: "p1", name: "Baret", categoryId: null, category: null, segment: null });
    expect(out.products[1]).toEqual(profile.products[1]);
    expect(JSON.stringify(out)).not.toMatch(/46\d{6}|10000000|Baş koruma|Kolluk/);
  });

  it("kategori alanı DIŞINDAKİ sekiz haneli değerlere dokunmaz (malzeme kodu, sayı)", () => {
    const row = { materialCode: "46181700", code: "46181700", quantity: 46181700, items: [{ id: "46181700", name: "Kalem" }] };
    expect(redactHiddenCategories(row)).toEqual(row);
  });

  it("durum etiketlemesiyle birlikte çalışır (asistanın araç hattı: önce süz, sonra etiketle)", () => {
    const out = localizeToolCodes(
      redactHiddenCategories([{ id: "l1", status: "OPEN", categoryIds: ["10101500"], extraCategoryCount: 0 }]),
      "listing",
      "tr",
    ) as Record<string, unknown>[];
    expect(out[0]).toEqual({ id: "l1", status: "Yayında", statusCode: "OPEN", categoryIds: [], extraCategoryCount: 0 });
  });
});
