import { categoryPrefix } from "../helpers/category-code";

/**
 * Kategori kataloğu ekseni — Ariba'nın İKİ dışa aktarımı var ve platformda
 * İKİ AYRI yerde kullanılıyorlar:
 *
 *   "full"      → FİRMA kategori seçimi ("hangi alandasınız"): ana + alt
 *                 kategoriler. Tam katalog (158.018).
 *   "discovery" → TALEP ve İLAN kategorisi. Ariba Discovery alt kümesi
 *                 (158.005).
 *
 * Ölçülen fark YALNIZ L4 yaprakta: 13 yaprak yalnız tam katalogda. L1 (58
 * segment), L2 (558 aile) ve L3 (7.966 sınıf) kod ve ad olarak birebir aynı.
 * Bu yüzden ayrı tablo/ayrı ağaç yok — tek katalog + `Category.inDiscovery`
 * bayrağı (bkz. `packages/db/prisma/schema.prisma`).
 *
 * ⚠️ Buradaki değer yalnız hangi ağacın GÖSTERİLECEĞİNİ seçer — yetki kapısı
 * DEĞİL. Asıl kapı backend'de: talep/ilan kategori doğrulaması `inDiscovery:
 * true` şart koşar (`company-listings.service.ts`), firma seçimi koşmaz
 * (`category-selection.helper.ts`). İstemci `catalog` göndermese bile
 * discovery dışı bir kod talebe/ilana YAZILAMAZ.
 */
export const CATEGORY_CATALOGS = ["full", "discovery"] as const;

export type CategoryCatalog = (typeof CATEGORY_CATALOGS)[number];

/**
 * Gövde/query'den gelen ham değeri güvenli daraltır.
 *
 * Bilinmeyen veya eksik değer → `"full"`. Fail-open BİLİNÇLİ: bu bir yetki
 * kapısı değil, ağaç seçimi. Yanlış tarafa düşmesi hâlinde kullanıcı 13 fazla
 * yaprak görür ve seçerse backend reddeder; ters varsayım (`"discovery"`)
 * firma kategori seçimini sessizce daraltır ve kimse fark etmez.
 */
export function parseCategoryCatalog(value: unknown): CategoryCatalog {
  return value === "discovery" ? "discovery" : "full";
}

/**
 * Prisma `where` parçası: discovery kataloğunda süz, tam katalogda süzme.
 * Tek yerde tutuluyor ki "hangi uçta filtre var" sorusu tek kaynağa baksın.
 */
export function categoryCatalogWhere(catalog: CategoryCatalog): CategoryCatalogWhere {
  return {
    ...(catalog === "discovery" ? { inDiscovery: true as const } : {}),
    ...hiddenCategoryWhere(),
  };
}

export type CategoryCatalogWhere = { inDiscovery?: true } & HiddenCategoryWhere;

/**
 * GİZLİ KATEGORİLER — KATALOG SADELEŞTİRME (2026-09-19, kullanıcı kararı:
 * "endüstriyel, inşaat, sanayi tarzı şeyler hariç gereksiz kategorileri
 * kaldır"). Ariba kataloğu BİREBİR kalır (satır silinmez, `seed-categories`
 * ve çeviri katmanı dokunulmaz); buradaki iki liste yalnız hangi DALLARIN
 * ürün arayüzünde GÖRÜNMEYECEĞİNİ söyler. Tek kaynak: seçiciler, arama,
 * facet, herkese açık kategori sayfaları, sitemap, AI önerisi ve doğrulama
 * kapıları hepsi buradan okur. Geri almak = listeden çıkarmak.
 *
 * KURALIN BİRİMİ KOD ÖNEKİDİR (2026-10-10): hiyerarşi koddan türediği için
 * (segment = ilk 2 hane, aile = ilk 4, sınıf = ilk 6) bir dalı gizlemek o
 * öneki listeye yazmaktır. Gizli önekin altındaki kategori hiç kimseye,
 * hiçbir yüzeyde gösterilmez (ad, çip, kırıntı, bağlantı, süzgeç seçeneği,
 * sayı, ikon / fotoğraf, e-posta, AI istemi); eski kayıt durur; eşleştirme
 * ve bildirim saklanan kodların tamamını kullanır; yeni ya da değişen değer
 * görünür olmalıdır.
 *
 *   `HIDDEN_SEGMENTS`         — tümüyle gizli segmentler (2 hane).
 *   `HIDDEN_BRANCH_PREFIXES`  — GÖRÜNÜR bir segmentin gizli aileleri (4 hane)
 *                               ve sınıfları (6 hane).
 *   `HIDDEN_CATEGORY_PREFIXES`— ikisinin birleşimi; aşağıdaki bütün
 *                               yardımcılar YALNIZ bunu okur (tek tanım).
 *
 * 2026-10-09 (kullanıcı kararı): 77 (Çevre Hizmetleri) gizlendi —
 * "anasayfadan kaldır; anasayfada olmayan kategori talepte, üründe ya da
 * başka yerde de gösterilmesin". Anasayfa vitrini görünür segmentlerin
 * TAMAMINI çizer (`buildShowcase` limit 100), yani "anasayfada görünen
 * sektör" = "`HIDDEN_SEGMENTS`te olmayan"; kategori gösteren her yüzey
 * buradan okur. Aynı gün 46 da tümüyle gizlenmişti.
 *
 * 2026-10-10 (sahip kararı): 46 GERİ AÇILDI ve adı değişti — TR "İş Güvenliği
 * ve Yangın Ekipmanları" · EN "Workplace Safety and Fire Equipment" · RU
 * "Средства охраны труда и противопожарное оборудование" (Ariba adı "Law
 * Enforcement and National Security and Security and Safety Equipment and
 * Supplies"). Segmentin altında baret, eldiven, yangın ve iş güvenliği
 * grupları seçilebilir; yalnız silah ve kolluk dalları gizli kalır
 * (`HIDDEN_BRANCH_PREFIXES`). 46'nın görünür aileleri: 4616 (trafik
 * kontrolü, su güvenliği, kurtarma), 4617 (kilit, gözetleme, araç geçiş
 * kontrolü), 4618 (kişisel koruyucu donanım; 461825 hariç), 4619 (yangından
 * korunma), 4621 (iş güvenliği).
 *
 * YENİ SONUÇ — GÖRÜNÜR ATANIN GİZLİ TORUNU OLABİLİR. Görünür bir kategorinin
 * ALT AĞACINI gezen ya da sayan her şey (alt liste, arama, öneri, "46
 * altındaki ürünler / talepler / firmalar" süzgeçleri ve sayıları, segmente
 * yuvarlama, sitemap, iniş sayfaları) gizli torunları dışarıda bırakır:
 * 4610xxxx'te saklanmış kayıt "İş Güvenliği ve Yangın Ekipmanları" altında
 * listelenmez, sayılmaz. Bunun yapı taşları `hiddenPrefixesUnder`,
 * `categorySubtreeWhere`, `categorySubtreeMatcher` ve (ata zinciri saklayan
 * firma beyanı için) `visibleCompanyCategorySelection`.
 *
 * Görünür segmentler: malzeme (11 12 13 14 15 30 31 32), makine / ekipman
 * (20 21 22 23 24 25 26 27 39 40 41 47), iş güvenliği ve yangın (46),
 * endüstriyel hizmet (71 72 73 76 78 81), yapılar ve altyapı (95).
 */
export const HIDDEN_SEGMENTS: readonly string[] = [
  "10", // Canlı bitkiler, hayvanlar
  "42", // Tıp
  "43", // Bilgisayar, yazılım, telekom
  "44", // Ofis ekipmanı
  "45", // Baskı, fotoğraf, ses-video
  "48", // Hizmet sektörü ekipmanı
  "49", // Spor
  "50", // Gıda ve içecek
  "51", // İlaç
  "52", // Tüketici elektroniği
  "53", // Giyim, kişisel bakım
  "54", // Takılar
  "55", // Yayınlanmış ürünler
  "56", // Mobilya
  "57", // İnsani yardım
  "60", // Eğitim gereçleri, oyuncak
  "64", // Finansal araçlar
  "70", // Tarım ve balıkçılık hizmetleri
  "77", // Çevre hizmetleri (2026-10-09)
  "80", // Profesyonel ve idari hizmetler
  "82", // Kreatif hizmetler
  "83", // Kamu sektörü hizmetleri
  "84", // Finans ve sigorta hizmetleri
  "85", // Sağlık bakım hizmetleri
  "86", // Eğitim ve öğretim hizmetleri
  "90", // Konaklama
  "91", // Kişisel ve ev içi hizmetler
  "92", // Kamu düzeni hizmetleri
  "93", // Siyasi hizmetler
  "94", // Organizasyonlar ve kulüpler
];

/**
 * GÖRÜNÜR bir segmentin gizli aileleri (4 hane) ve sınıfları (6 hane).
 * 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" adıyla
 * açık; silah ve kolluk dalları gizli. Bir önek, başka bir gizli önekin
 * altına YAZILMAZ (zaten gizlidir) — `hidden-segments.spec` kilitler.
 */
export const HIDDEN_BRANCH_PREFIXES: readonly string[] = [
  "4610", // Hafif silahlar ve mühimmat
  "4611", // Geleneksel savaş silahları
  "4612", // Füzeler
  "4613", // Roketler ve alt sistemleri
  "4614", // Fırlatıcılar
  "4615", // Kolluk ekipmanları (kalabalık kontrol, adli, patlayıcı kontrol)
  "4620", // Savunma ve kolluk eğitim ekipmanları (kamu güvenliği, hafif silah)
  "4622", // Askeri silah ve mühimmat imha, mayın temizleme
  "461825", // Kişisel güvenlik cihazları veya silahları (görünür 4618 ailesinin gizli sınıfı)
];

/** Gizli öneklerin TAMAMI (segment + aile + sınıf) — kuralın TEK tanımı. */
export const HIDDEN_CATEGORY_PREFIXES: readonly string[] = [...HIDDEN_SEGMENTS, ...HIDDEN_BRANCH_PREFIXES];

const HIDDEN_PREFIX_SET: ReadonlySet<string> = new Set(HIDDEN_CATEGORY_PREFIXES);
/** Listede geçen önek uzunlukları, kısadan uzuna. */
const HIDDEN_PREFIX_LENGTHS: readonly number[] = [...new Set(HIDDEN_CATEGORY_PREFIXES.map((p) => p.length))].sort(
  (a, b) => a - b,
);

/**
 * Kodu kapsayan gizli önek ("10" · "4610" · "461825"); görünürse `null`.
 * Girdi 8 haneli kod ya da kodun baş kısmıdır (kod aramasına yazılan "4610").
 * Önekin uzunluğu gizlemenin DÜZEYİNİ söyler: 2 segment, 4 aile, 6 sınıf.
 */
export function hiddenCategoryPrefixOf(code: string | null | undefined): string | null {
  if (!code) return null;
  for (const length of HIDDEN_PREFIX_LENGTHS) {
    if (code.length < length) break;
    const prefix = code.slice(0, length);
    if (HIDDEN_PREFIX_SET.has(prefix)) return prefix;
  }
  return null;
}

/** Kod (herhangi seviye) gizli bir önekin — segment, aile ya da sınıf — altında mı? */
export function isHiddenCategory(code: string | null | undefined): boolean {
  return hiddenCategoryPrefixOf(code) !== null;
}

/**
 * SAKLANMIŞ kodları GÖSTERİME hazırlar: gizli bir önekin altındaki kodlar düşer,
 * sıra korunur. Kural (2026-10-09, kullanıcı): "anasayfada olmayan kategori
 * talepte, üründe ya da başka yerde de gösterilmesin" — kataloğu GEZDİREN
 * yüzeyler `hiddenCategoryWhere` ile zaten süzülüyordu; saklanmış bir kodu ada
 * / etikete / bağlantıya / sayıya çeviren her okuma da BURADAN geçer (eski
 * kayıt durur, yalnız gizli kategorisi görünmez). Eşleştirme ve bildirim
 * saklanan kodların TAMAMINI kullanmaya devam eder — bu yardımcı oraya girmez.
 *
 * Ata zinciri SAKLAYAN kayıtta (firma beyanı: segment + aile + sınıf + yaprak)
 * bu tek başına yetmez — gizli seçimin görünür atası geride kalır. Orada
 * `visibleCompanyCategorySelection` kullanılır.
 */
export function visibleCategoryIds<T extends string | null | undefined>(ids: readonly T[] | null | undefined): string[] {
  const out: string[] = [];
  for (const id of ids ?? []) if (id && !isHiddenCategory(id)) out.push(id);
  return out;
}

/** Tek kod için aynı kural: gizliyse `null`. */
export function visibleCategoryId(id: string | null | undefined): string | null {
  return id && !isHiddenCategory(id) ? id : null;
}

/** Tek `startsWith` koşulu; `F` kategori kodunu tutan Prisma alanı (`id`, `categoryId`, …). */
export type CategoryPrefixClause<F extends string = "id"> = Record<F, { startsWith: string }>;

export type HiddenCategoryWhere<F extends string = "id"> = { NOT: CategoryPrefixClause<F>[] };

function prefixClause<F extends string>(field: F, prefix: string): CategoryPrefixClause<F> {
  return { [field]: { startsWith: prefix } } as CategoryPrefixClause<F>;
}

/**
 * Prisma `where` parçası — gizli öneklerin altındaki kodları dışarıda bırakır.
 * Alan verilmezse `Category.id` (biçim eskisiyle aynı); kodu başka adla tutan
 * tabloda alan adıyla çağrılır: `hiddenCategoryWhere("categoryId")`.
 *
 * ⚠️ Parça `NOT` anahtarı taşır: yanına ikinci bir `NOT` SPREAD EDİLMEZ
 * (anahtar ezilir) — `AND: [hiddenCategoryWhere(), …]`.
 * ⚠️ NULL olabilen alanda `NOT startsWith` kategorisiz (NULL) satırı da eler;
 * o satırlar kalacaksa çağıran `OR: [{ alan: null }, hiddenCategoryWhere("alan")]` kurar.
 */
export function hiddenCategoryWhere(): HiddenCategoryWhere;
export function hiddenCategoryWhere<F extends string>(field: F): HiddenCategoryWhere<F>;
export function hiddenCategoryWhere(field: string = "id"): HiddenCategoryWhere<string> {
  // Aşırı yükleme, tür parametresi değil: argümansız çağrının dönüş türü
  // bağlamdan ÇIKARILMAZ (`AND: [hiddenCategoryWhere()]` içinde alan adı
  // `keyof …WhereInput`e genişler ve atama düşerdi), her zaman `id`dir.
  return { NOT: HIDDEN_CATEGORY_PREFIXES.map((p) => prefixClause(field, p)) };
}

/**
 * ALT AĞAÇ ÖNEKİ — 8 haneli kod seviyesine göre kesilir (`categoryPrefix`:
 * `46000000` → `46`, `46180000` → `4618`, yaprak → kendisi); 2 / 4 / 6 haneli
 * girdi zaten önektir. Geçersiz girdi `null`.
 */
function subtreePrefix(codeOrPrefix: string | null | undefined): string | null {
  if (!codeOrPrefix) return null;
  if (codeOrPrefix.length === 8) return categoryPrefix(codeOrPrefix);
  return /^(\d\d){1,3}$/.test(codeOrPrefix) ? codeOrPrefix : null;
}

/**
 * Bir kategorinin ALT AĞACINDAKİ gizli önekler (kendisinden UZUN olanlar):
 * `46000000` / `"46"` → 4610 … 4622 + 461825 · `46180000` / `"4618"` →
 * 461825 · torunu gizli olmayan kod → `[]`.
 *
 * Girdinin KENDİSİ gizliyse de `[]` döner (altında ayrıca gizlenecek bir şey
 * yok): "gizli kod süzgeç değildir" kararı çağıranındır ve bu çağrıdan ÖNCE
 * `visibleCategoryId` ile verilir. Ham SQL süzgeci bu listeden kurulur
 * (`c LIKE '46%' AND NOT (c LIKE ANY(<önek%>))`).
 */
export function hiddenPrefixesUnder(codeOrPrefix: string | null | undefined): string[] {
  const prefix = subtreePrefix(codeOrPrefix);
  if (!prefix) return [];
  return HIDDEN_CATEGORY_PREFIXES.filter((hidden) => hidden.length > prefix.length && hidden.startsWith(prefix));
}

/** `categorySubtreeWhere` sonucu: alt ağaç koşulu + (gizli torun varsa) dışlama listesi. */
export type CategorySubtreeWhere<F extends string> = CategoryPrefixClause<F> & { NOT?: CategoryPrefixClause<F>[] };

/**
 * Prisma `where` parçası — "alan `<önek>` ile başlar AMA altındaki gizli bir
 * önekle başlamaz": görünür bir kategorinin alt ağacındaki kayıtlar, gizli
 * torunlar hariç. `{ categoryId: { startsWith: categoryPrefix(code) } }`
 * yazan her yerin karşılığıdır:
 *
 *   categorySubtreeWhere("31160000", "categoryId")
 *     → { categoryId: { startsWith: "3116" } }                     (eskisiyle AYNI)
 *   categorySubtreeWhere("46180000", "categoryId")
 *     → { categoryId: { startsWith: "4618" }, NOT: [{ categoryId: { startsWith: "461825" } }] }
 *
 * · Gizli torunu olmayan kodda `NOT` anahtarı HİÇ yoktur (bugünkü biçim).
 * · Geçersiz girdi `null` (çağıran `?? {}` ile "süzgeç yok"a çevirir).
 * · Girdinin kendisi gizliyse sonuç HAM alt ağaçtır (bkz. `hiddenPrefixesUnder`).
 * · `NOT` taşıyabildiği için `where`e spread edilmez; `AND: [...]` öğesi olur.
 * · `Category` tablosunda alan `"id"`dir; orada `hiddenCategoryWhere()` zaten
 *   bütün gizli önekleri eler, bu parça yalnız alt ağaç koşulunu ekler.
 */
export function categorySubtreeWhere<F extends string>(
  codeOrPrefix: string | null | undefined,
  field: F,
): CategorySubtreeWhere<F> | null {
  const prefix = subtreePrefix(codeOrPrefix);
  if (!prefix) return null;
  const hidden = hiddenPrefixesUnder(prefix);
  const own = prefixClause(field, prefix);
  return hidden.length > 0 ? { ...own, NOT: hidden.map((p) => prefixClause(field, p)) } : own;
}

/**
 * `categorySubtreeWhere`in BELLEKTEKİ ikizi — satırları kodla süzen yerler
 * (facet sayaçları, alt dal kırılımı): kod alt ağaçta VE gizli bir torun
 * önekinin altında değilse `true`. Aynı kural, aynı kenar durumları; geçersiz
 * girdi `null`.
 */
export function categorySubtreeMatcher(
  codeOrPrefix: string | null | undefined,
): ((code: string | null | undefined) => boolean) | null {
  const prefix = subtreePrefix(codeOrPrefix);
  if (!prefix) return null;
  const hidden = hiddenPrefixesUnder(prefix);
  return (code) => !!code && code.startsWith(prefix) && !hidden.some((p) => code.startsWith(p));
}

/**
 * FİRMA KATEGORİ BEYANI TAVANLARI — TEK KAYNAK.
 *
 * Neden burada: 2026-09-14'te ölçüldü, ana kategori tavanı ÜÇ AYRI değerdi —
 * onboarding 3 (DTO + arayüz), ayarlar arayüzü 10 (`SegmentOnlyPicker`
 * varsayılanı, prop hiç geçilmemiş), ayarlar DTO'su 50. Sonuç: kayıtta 3'e
 * sıkışan firma ayarlardan 50 segment işaretleyip bildirim havuzunu
 * şişirebiliyordu ve `validateCategorySelection`'ın "1-3" kuralı ayarlar
 * yolunda HİÇ çalışmıyordu. Sayı artık tek yerde; ayrışması için iki dosyanın
 * birlikte değişmesi gerekir.
 *
 * 5, ölçülmüş bir orta yol: 3 dardı (makine imalatçısı = makine + metal +
 * elektrik + hidrolik, zaten 4), 50 ise anlamsız — 58 segmentin 50'sini seçen
 * firma "her şeyi yaparım" demiş olur, her talebin bildirimini alır ve bir
 * süre sonra hepsini görmezden gelir. Sinyal ölür.
 */
export const MAX_COMPANY_MAIN_CATEGORIES = 5;

/**
 * Alt kategori DEPOLAMA tavanı — kullanıcının seçim tavanı DEĞİL.
 *
 * Kullanıcı en fazla `MAX_COMPANY_SUB_PICKS` (50) ürün/hizmet seçer; her seçim
 * ata zinciriyle birlikte saklandığı için depoda seçim başına en fazla üç kayıt
 * (L2+L3+L4) oluşur. Zincir gerekli: eşleştirme ata zincirini TALEBİN kodundan
 * yukarı çıkarıyor, firmanın beyanından aşağı inmiyor — yaprak tek başına
 * saklanırsa alıcı L3'te talep açtığında dar eksen tutmaz.
 *
 * 200 = 50 seçim × 3 seviye + pay. Ana kategoriden yüksek olması DOĞRU: alt
 * kategori daraltır, genişletmez.
 */
export const MAX_COMPANY_SUB_CATEGORIES = 200;
