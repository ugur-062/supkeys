import { sanitizeAiDraft } from "../../src/modules/ai/tender-extract/ai-draft-sanitizer";
import { connectionsForModel, localizeToolCodes, redactHiddenCategories } from "../../src/modules/ai/assistant/assistant-tools";

/**
 * GİZLİ DAL — AI girdileri (2026-10-09, kullanıcı: "anasayfada olmayan
 * kategori talepte, üründe ya da başka yerde de gösterilmesin"; model istemi
 * ve asistan kartı dahil). Eski kayıt durur, yalnız gizli kategorisi görünmez.
 *
 *  - AI talep taslağı: dal gizlenmeden önce önerilmiş kod eski oturumdan ya
 *    da istemcideki taslaktan geri gelmez (`sanitizeAiDraft`); boşalan öneri
 *    "kategori eksik" sayılır ve yeniden önerilir.
 *  - Asistan araç sonuçları: gizli kategori (kod / ad / referans) modele gitmez
 *    (`redactHiddenCategories`).
 *  - Asistanın bağlantı listesi: firma beyanı ata zinciriyle saklanır; yalnız
 *    gizli bir seçimin atası olan görünür kod da modele gitmez
 *    (`connectionsForModel`).
 *
 * 2026-10-10: gizlemenin birimi KOD ÖNEKİ. Örnek kodlar:
 *   46101500 — gizli AİLE (4610) altında,
 *   46182500 / 46182501 — görünür ailenin (4618) gizli SINIFI (461825),
 *   10xxxxxx — tümüyle gizli SEGMENT,
 *   46181700 / 46000000 — 46 altındaki GÖRÜNÜR kodlar (sıradan kategori),
 *   30 / 31 / 39 — görünür segmentler.
 */
const HIDDEN_FAMILY = "46101500";
const HIDDEN_CLASS_LEAF = "46182501";
const HIDDEN_SEGMENT = "10101500";
const SAFETY = "46181700";

describe("sanitizeAiDraft — gizli daldaki kategori önerisi taşınmaz", () => {
  const base = {
    title: "500 adet baret alımı",
    deliveryTerm: "DOMESTIC_DELIVERED",
    bidsCloseAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    items: [{ name: "Baret", quantity: 500, unit: "adet" }],
  };

  it("eski oturumdaki gizli aile / sınıf / segment kodu düşer, görünür kod sırasıyla kalır", () => {
    const s = sanitizeAiDraft(
      { ...base, suggestedCategoryIds: [HIDDEN_FAMILY, "30191500", HIDDEN_SEGMENT, HIDDEN_CLASS_LEAF, " 31161500 ", "46182500"] },
      "refine",
    );
    expect(s.draft.suggestedCategoryIds).toEqual(["30191500", "31161500"]);
    expect(s.missingRequired).not.toContain("category");
  });

  it.each([
    ["gizli aile", HIDDEN_FAMILY],
    ["gizli sınıf", HIDDEN_CLASS_LEAF],
    ["gizli segment", HIDDEN_SEGMENT],
  ])("yalnız %s kodu kalmışsa öneri boşalır ve kategori EKSİK sayılır (yeniden önerilsin)", (_level, code) => {
    const s = sanitizeAiDraft({ ...base, suggestedCategoryIds: [code] }, "refine");
    expect(s.draft.suggestedCategoryIds).toEqual([]);
    expect(s.missingRequired).toContain("category");
    // Modele giden taslak bağlamında da kod yok.
    expect(JSON.stringify(s.draft)).not.toContain(code);
  });

  it("46 altındaki görünür kod sıradan öneridir: taşınır, kategori eksik sayılmaz", () => {
    const s = sanitizeAiDraft({ ...base, suggestedCategoryIds: [SAFETY, HIDDEN_FAMILY] }, "refine");
    expect(s.draft.suggestedCategoryIds).toEqual([SAFETY]);
    expect(s.missingRequired).not.toContain("category");
  });

  it("gizli kod on öneri tavanında yer kapmaz", () => {
    const hidden = Array.from({ length: 10 }, (_, i) => `4610${String(1000 + i)}`);
    const s = sanitizeAiDraft({ ...base, suggestedCategoryIds: [...hidden, "39121500"] }, "refine");
    expect(s.draft.suggestedCategoryIds).toEqual(["39121500"]);
  });

  it("belge yolu da aynı kuraldan geçer; katalog dışı biçim eskisi gibi servis doğrulamasına kalır", () => {
    const s = sanitizeAiDraft({ ...base, suggestedCategoryIds: [HIDDEN_SEGMENT, HIDDEN_FAMILY, "cat-1"] }, "text");
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
        categoryIds: [HIDDEN_FAMILY, "30191500", HIDDEN_CLASS_LEAF, SAFETY, HIDDEN_SEGMENT],
        categories: [
          { code: HIDDEN_FAMILY, name: "Ateşli silahlar" },
          { code: "30191500", name: "İskeleler" },
          { code: HIDDEN_CLASS_LEAF, name: "Biber gazı spreyleri" },
          { code: SAFETY, name: "Baş koruma" },
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
      categoryIds: ["30191500", SAFETY],
      categories: [
        { code: "30191500", name: "İskeleler" },
        { code: SAFETY, name: "Baş koruma" },
      ],
      paymentCategory: "DEFERRED",
      closesAt: new Date("2026-10-20T10:00:00Z"),
    });
    const json = JSON.stringify(out);
    for (const hidden of [HIDDEN_FAMILY, HIDDEN_CLASS_LEAF, HIDDEN_SEGMENT, "Ateşli silahlar", "Biber gazı"]) {
      expect(json).not.toContain(hidden);
    }
    // Girdi değişmedi (servis yanıtı başka yerde de kullanılır).
    expect(rows[0]!.categoryIds).toEqual([HIDDEN_FAMILY, "30191500", HIDDEN_CLASS_LEAF, SAFETY, HIDDEN_SEGMENT]);
  });

  it("firma profili: `{ id, name }` kategorileri, dört beyan dizisi, tekil kategori / segment alanları", () => {
    const profile = {
      rothernId: "RTH-1",
      name: "Güvenlik Ekipmanları AŞ",
      categories: [
        { id: "10000000", name: "Canlı Bitki ve Hayvan Malzemeleri" },
        { id: "46000000", name: "İş Güvenliği ve Yangın Ekipmanları" },
        { id: "31000000", name: "İmalat bileşenleri" },
      ],
      sellerCategoryIds: ["46000000", "31000000"],
      sellerSubCategoryIds: ["46100000", HIDDEN_FAMILY, "46180000", "46182500", HIDDEN_CLASS_LEAF, SAFETY, "31160000"],
      buyerCategoryIds: ["10000000"],
      buyerSubCategoryIds: [],
      products: [
        {
          id: "p1",
          name: "Eski tüfek kılıfı",
          categoryId: HIDDEN_FAMILY,
          category: { id: HIDDEN_FAMILY, name: "Ateşli silahlar" },
          segment: null,
        },
        {
          id: "p2",
          name: "Vida",
          categoryId: "31161500",
          category: { id: "31161500", name: "Vidalar" },
          segment: { id: "31000000", name: "İmalat bileşenleri", slug: "31000000-imalat" },
        },
        {
          id: "p3",
          name: "Eski yem",
          categoryId: HIDDEN_SEGMENT,
          category: { id: HIDDEN_SEGMENT, name: "Çiftlik hayvanları" },
          segment: { id: "10000000", name: "Canlı", slug: "10000000-canli" },
        },
        {
          id: "p4",
          name: "Baret",
          categoryId: SAFETY,
          category: { id: SAFETY, name: "Baş koruma" },
          segment: { id: "46000000", name: "İş Güvenliği ve Yangın Ekipmanları", slug: "46000000-is-guvenligi" },
        },
      ],
    };
    const out = redactHiddenCategories(profile) as typeof profile;
    expect(out.categories).toEqual([
      { id: "46000000", name: "İş Güvenliği ve Yangın Ekipmanları" },
      { id: "31000000", name: "İmalat bileşenleri" },
    ]);
    expect(out.sellerCategoryIds).toEqual(["46000000", "31000000"]);
    // Alt eksen: gizli aile (4610…) ve gizli sınıf (461825…) düşer; 4618'in görünür kodları kalır.
    expect(out.sellerSubCategoryIds).toEqual(["46180000", SAFETY, "31160000"]);
    expect(out.buyerCategoryIds).toEqual([]);
    expect(out.products[0]).toEqual({ id: "p1", name: "Eski tüfek kılıfı", categoryId: null, category: null, segment: null });
    expect(out.products[1]).toEqual(profile.products[1]);
    expect(out.products[2]).toEqual({ id: "p3", name: "Eski yem", categoryId: null, category: null, segment: null });
    // 46 altındaki görünür ürün kategorisi ve segment halkasıyla aynen kalır.
    expect(out.products[3]).toEqual(profile.products[3]);
    expect(JSON.stringify(out)).not.toMatch(/4610\d{4}|461825\d{2}|10\d{6}|Ateşli|Çiftlik|Canlı/);
  });

  it("kategori alanı DIŞINDAKİ sekiz haneli değerlere dokunmaz (malzeme kodu, sayı)", () => {
    const row = { materialCode: HIDDEN_FAMILY, code: HIDDEN_FAMILY, quantity: 46101500, items: [{ id: HIDDEN_CLASS_LEAF, name: "Kalem" }] };
    expect(redactHiddenCategories(row)).toEqual(row);
  });

  it("durum etiketlemesiyle birlikte çalışır (asistanın araç hattı: önce süz, sonra etiketle)", () => {
    const out = localizeToolCodes(
      redactHiddenCategories([{ id: "l1", status: "OPEN", categoryIds: [HIDDEN_SEGMENT, HIDDEN_FAMILY], extraCategoryCount: 0 }]),
      "listing",
      "tr",
    ) as Record<string, unknown>[];
    expect(out[0]).toEqual({ id: "l1", status: "Yayında", statusCode: "OPEN", categoryIds: [], extraCategoryCount: 0 });
  });
});

/**
 * BAĞLANTI LİSTESİ (`list_my_connections`). Kartın `categoryIds` alanı karşı
 * firmanın SAKLANAN satış beyanıdır: ana + alt eksen birleşik, her seçim ata
 * zinciriyle (`46101500` seçen firmada `46000000` + `46100000` + `46101500`).
 * Yalnız gizli kodları düşürmek geride görünür atayı bırakır ve model firmayı
 * "İş Güvenliği ve Yangın Ekipmanları" tedarikçisi diye sunar. Modele giden
 * liste firmanın GÖSTERİLEN beyanıdır (`visibleCompanyCategorySelection`).
 */
describe("connectionsForModel — bağlantı kartında firmanın gösterilen beyanı", () => {
  /** `CompanyConnectionsService.list` satırının biçimi. */
  const row = (name: string, categoryIds: string[]) => ({
    connectionId: `conn-${name}`,
    origin: "PREMIUM",
    company: { id: `co-${name}`, name, city: "Bursa", activities: ["MANUFACTURER"], categoryIds, productPreview: null },
    decidedAt: new Date("2026-10-01T10:00:00Z"),
  });
  const rows = () => [
    row("Silah", ["46000000", "46100000", HIDDEN_FAMILY]), // tek seçimi gizli AİLEDE
    row("Sprey", ["46000000", "46180000", "46182500", HIDDEN_CLASS_LEAF]), // tek seçimi gizli SINIFTA
    row("Baret", ["46000000", "31000000", "46180000", SAFETY, "46100000", HIDDEN_FAMILY, "31160000"]),
    row("Sektor", ["46000000"]), // bilinçli "sektörün tamamı"
    row("Hayvan", ["10000000", "30000000", "10100000", HIDDEN_SEGMENT]),
  ];

  it("yalnız gizli kodu düşürmek yetmez: gizli seçimin görünür atası geride kalır", () => {
    const out = redactHiddenCategories(rows()) as ReturnType<typeof rows>;
    expect(out[0]!.company.categoryIds).toEqual(["46000000"]);
    expect(out[1]!.company.categoryIds).toEqual(["46000000", "46180000"]);
  });

  it("asistanın araç hattı (önce gösterilen beyan, sonra süzgeç): ata da modele gitmez; görünür seçimin zinciri kalır", () => {
    const input = rows();
    const out = redactHiddenCategories(connectionsForModel(input)) as typeof input;
    expect(out.map((r) => r.company.categoryIds)).toEqual([
      [],
      [],
      ["46000000", "31000000", "46180000", SAFETY, "31160000"],
      ["46000000"],
      ["30000000"],
    ]);
    // Kaydın kendisi ve diğer alanları aynen gider.
    expect(out.map((r) => r.company.name)).toEqual(["Silah", "Sprey", "Baret", "Sektor", "Hayvan"]);
    expect(out[0]).toEqual({ ...input[0], company: { ...input[0]!.company, categoryIds: [] } });
    // Girdi değişmedi: servis yanıtı web davet seçicisinde ham kodlarla puanlanır.
    expect(input[0]!.company.categoryIds).toEqual(["46000000", "46100000", HIDDEN_FAMILY]);
  });

  it("beyan taşımayan satır ve gizli kod saklamayan beyan aynen geçer", () => {
    const plain = row("Vida", ["31000000", "31160000", "31161500"]);
    const other = { rothernId: "RTH-9", name: "Bağlantı AŞ" };
    const noList = { connectionId: "c1", company: { id: "co-1", name: "Listesiz" } };
    expect(connectionsForModel([plain, other, noList])).toEqual([plain, other, noList]);
    expect(connectionsForModel([])).toEqual([]);
  });
});
