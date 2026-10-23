import { i18nMessage } from "../../../common/i18n/http-i18n";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CATEGORY_NAME_SELECT, categoryName, categorySlug, localizeCategoryRows } from "../../../common/company/category-name";
import {
  categoryCatalogWhere,
  hiddenCategoryPrefixOf,
  hiddenCategoryWhere,
  isHiddenCategory,
  foldSearchText,
  tokenizeQuery,
  visibleCategoryIds,
  type CategoryCatalog,
} from "@rothern/shared";
import { likeLiteral } from "../../../common/prisma/like-literal";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  type CategoryRowRank,
  categoryCodePrefix,
  categoryNameMatchesAll,
  categoryRowRank,
  categorySearchStem,
  compareCategoryRank,
  stemAtWordStart,
  relevanceWeight,
} from "./category-search-rank";

/**
 * 4 seviye kategori servisi (kaynak: Ariba kataloğu, birebir).
 *   level 1 = Segment   (XX000000)
 *   level 2 = Family    (XXXX0000)
 *   level 3 = Class     (XXXXXX00)
 *   level 4 = Commodity (XXXXXXXX)
 *
 * Lazy loading: frontend `/all` ile L1-L2'yi çeker, bir düğüm açıldığında o
 * düğümün direkt çocuklarını `/children` ile ister. Seçim katmanı firma ANA
 * kategorisinde L1, ALT kategoride L2-L4, satın alma talebinde min L3.
 *
 * BELLEK NOTU (2026-09-01): burada kategorilerin TAMAMINI belleğe alan bir
 * breadcrumb cache'i (`loadAllCategories`) vardı — çağıranı kalmamıştı ve
 * katalog 158 bin satıra çıkınca çağrılsaydı tek istekte ~24 MB JSON çekip
 * Render free planının 512 MB'ını zorlardı. Silindi; breadcrumb'lar
 * `getByIds`'te hedefli sorguyla çıkarılıyor (yalnız seçili kodlar).
 */
/** Public kategori arama sorgusunun en fazla uzunluğu (karakter). */
export const CATEGORY_SEARCH_MAX_LENGTH = 120;
/** Arama sorgusunda AND'lenen en fazla (tekil) kelime sayısı. */
export const CATEGORY_SEARCH_MAX_TOKENS = 8;
/** Ağaca giren en fazla eşleşme (L3+L4) — aşılırsa `truncated`. */
export const CATEGORY_SEARCH_RESULT_CAP = 200;
/**
 * Alaka puanıyla sıralanacak aday havuzu (O-022). Kırpma puanlamadan SONRA
 * yapılır; havuz yalnız hafif alanları taşır.
 */
const CATEGORY_SEARCH_POOL = 1000;
/** Adı / eş anlamlısı eşleşip BÜTÜN sınıflarıyla açılan en fazla aile (L2). */
const CATEGORY_SEARCH_FAMILY_CAP = 20;
/**
 * Aile tavanı SIRADAN sonra uygulanır: eşleşen aileler önce hafif alanlarla
 * (çocuksuz) bu kadarına dek çekilir, sıralanır, ilk 20'sinin sınıfları ayrıca
 * istenir. Eskiden sorgu katalog sırasıyla ilk 20'yi alıyordu; adı sorguya
 * eşit olan aile 20'nin dışında kalabilirdi.
 */
const CATEGORY_SEARCH_FAMILY_POOL = 200;
/**
 * Adı eşleşen en fazla sektör (L1) — her biri bütün aileleri ve sınıflarıyla
 * döner (category-18). "makineleri" gibi tek kelime beş sektörün adında
 * geçer; hepsi açılsaydı yüzlerce satır eklenirdi. Aşılırsa `truncated`.
 */
const CATEGORY_SEARCH_SECTOR_CAP = 3;

/**
 * Kökün HAM (katlanmamış) karşılığı. `nameTr`/`nameEn`/`nameRu` ILIKE
 * yedekleri katlanmamış kolona bakar, kök de ham yazılır ("Boruları" →
 * "Boru"). Katlama harf sayısını değiştirdiyse (bitişik harf, ayrık aksan)
 * önek güvenle kesilemez; o durumda kelimenin kendisi kalır.
 */
function rawStemOf(raw: string, stem: string): string {
  const cut = raw.slice(0, stem.length);
  return foldSearchText(cut) === stem ? cut : raw;
}

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * V2-6.5 — Ağacın ÜST katmanı (flat). Modal bunu tek seferde çeker,
   * parentId üzerinden client-side traverse eder.
   *
   * Payload optimizasyonu — yalnızca L1-L2 (Segment/Family) döner.
   * L3 sınıflar ve L4 emtialar `/children` ile açıldıkça lazy çekilir. Her
   * düğüme `childCount` eklenir → frontend alt katmanı yüklemeden "expand
   * var mı" gösterebilir.
   *
   * NEDEN L3 DE DIŞARIDA (2026-09-01): katalog Ariba dışa aktarımına geçince
   * L1-L3 1.796 satırdan 8.582'ye çıktı — yani ~180 KB'lık cevap 1,43 MB
   * oldu. Modal her açılışta (staleTime 5 dk) bunu indiriyordu. L1-L2 ise
   * 616 satır / ~90 KB: bugünkünden de KÜÇÜK. Sınıflar zaten yalnız kullanıcı
   * bir aileyi açtığında gerekiyor ve tek ailenin altında en fazla birkaç
   * düzine sınıf var — o istek küçük ve seyrek.
   */
  async getAllActive() {
    const cats = localizeCategoryRows(await this.prisma.category.findMany({
      // Gizli segmentler (katalog sadeleştirme, 2026-09-19) hiçbir listede yok.
      where: { isActive: true, level: { lte: 2 }, ...hiddenCategoryWhere() },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        code: true,
        ...CATEGORY_NAME_SELECT,
        level: true,
        parentId: true,
        segmentLetter: true,
        sortOrder: true,
      },
    }));
    return this.attachChildCount(cats);
  }

  /**
   * YALNIZ segmentler (L1) — perf turu (denetim P10 Dalga B).
   *
   * `useRoots()` yalnız 38 aktif segmenti gösteriyor ama bunun için
   * `/categories/all`'ı (≈8,2k satır / ~180 KB) indiriyordu. Onboarding ve
   * profil düzenleme gibi kategori AĞACINA hiç girilmeyen ekranlarda bu
   * tamamen boşa trafik. Ağaca gerçekten ihtiyaç duyan tek yüzey seçim
   * modalı; o zaten drill-down sırasında `/all`'ı çekiyor.
   */
  async getSegments() {
    const raw = await this.prisma.category.findMany({
      where: { isActive: true, level: 1, ...hiddenCategoryWhere() },
      orderBy: [{ sortOrder: "asc" }],
      select: {
        id: true,
        code: true,
        ...CATEGORY_NAME_SELECT,
        level: true,
        parentId: true,
        segmentLetter: true,
        sortOrder: true,
      },
    });
    // i18n Faz 4: ad okuyucunun dilinde; adres slug'ı HER ZAMAN Türkçe addan (dilden bağımsız).
    const cats = localizeCategoryRows(raw);
    const withCount = await this.attachChildCount(cats);
    const trSlug = new Map(raw.map((c) => [c.id, categorySlug(c.nameTr)] as const));
    return withCount.map((c) => ({ ...c, slug: trSlug.get(c.id) ?? categorySlug(c.nameTr) }));
  }

  /**
   * Bir parent'ın direkt çocukları (L3 sınıf / L4 emtia lazy-load için).
   *
   * `catalog` YALNIZ burada ve `searchHierarchical`'da anlamlı: iki katalog
   * (firma seçimi = tam, talep/ilan = discovery) yalnız L4 yaprakta ayrışıyor.
   * `getAllActive` (L1-L2) ve `getSegments` (L1) o yüzden katalog almıyor —
   * o katmanlar iki dışa aktarımda kod ve ad olarak birebir aynı.
   */
  async childrenOf(parentId: string, catalog: CategoryCatalog = "full") {
    if (!parentId) return [];
    const cats = localizeCategoryRows(await this.prisma.category.findMany({
      where: { isActive: true, parentId, ...categoryCatalogWhere(catalog) },
      orderBy: [{ sortOrder: "asc" }],
      select: {
        id: true,
        code: true,
        ...CATEGORY_NAME_SELECT,
        level: true,
        parentId: true,
        segmentLetter: true,
        sortOrder: true,
      },
    }));
    return this.attachChildCount(cats, catalog);
  }

  /**
   * Verilen düğümlere `childCount` (aktif direkt çocuk sayısı) ekler.
   *
   * `catalog` sayıma da uygulanır: aksi hâlde çocukları yalnız discovery-dışı
   * yapraklardan ibaret bir sınıf, talep/ilan seçicisinde "açılabilir" görünür
   * ve açılınca BOŞ gelirdi.
   */
  private async attachChildCount<T extends { id: string }>(
    cats: T[],
    catalog: CategoryCatalog = "full",
  ): Promise<(T & { childCount: number })[]> {
    if (cats.length === 0) return [];
    const counts = await this.prisma.category.groupBy({
      by: ["parentId"],
      where: {
        isActive: true,
        parentId: { in: cats.map((c) => c.id) },
        ...categoryCatalogWhere(catalog),
      },
      _count: { _all: true },
    });
    const m = new Map(counts.map((c) => [c.parentId, c._count._all]));
    return cats.map((c) => ({ ...c, childCount: m.get(c.id) ?? 0 }));
  }

  /**
   * Hiyerarşik search — eşleşen Class/Commodity'leri parent path'leri ile birlikte
   * tree olarak döner. Aynı segment/family altındaki match'ler birlikte gruplanır;
   * eşleşmeyen kardeşler gizlenir. Frontend modalında PratisPro tarzı render için.
   */
  async searchHierarchical(
    query: string,
    catalog: CategoryCatalog = "full",
  ): Promise<{
    segments: Array<{
      id: string;
      code: string;
      nameTr: string;
      level: number;
      segmentLetter: string | null;
      /** Sektörün KENDİ adı sorguyla eşleşti (category-18). */
      isMatch: boolean;
      families: Array<{
        id: string;
        code: string;
        nameTr: string;
        level: number;
        /** Ailenin kendisi sorguyla eşleşti (ad / eş anlamlı / kod öneki). */
        isMatch: boolean;
        classes: Array<{
          id: string;
          code: string;
          nameTr: string;
          level: number;
          isMatch: boolean;
          /**
           * Sınıf, ailesi ya da sektörü eşleştiği için listede (category-18):
           * kendi adı eşleşmese de SEÇİLEBİLİR satır olarak gösterilir.
           */
          parentMatch: boolean;
          commodities: Array<{
            id: string;
            code: string;
            nameTr: string;
            level: number;
            isMatch: boolean;
          }>;
        }>;
      }>;
    }>;
    /** 200 sonuç tavanına takıldı — kullanıcıya "aramayı daraltın" gösterilir. */
    truncated: boolean;
    /**
     * Sonuçsuz KOD aramasında kod gizli bir dalın altındaysa o dalın öneki
     * (O-048, yeniden doğrulama): segment 2 hane ("10"), aile 4 ("4610"),
     * sınıf 6 ("461825") — admin kategori tarayıcısı "Sonuç yok" yerine
     * nedenini ve düzeyini söyler. Diğer durumlarda yok.
     */
    hiddenPrefix?: string;
    /**
     * Eski biçim: gizli SEGMENTİN iki hanesi. Yalnız segmentin tamamı
     * gizliyse döner — görünür segmentin gizli ailesinde / sınıfında
     * ("46 gizli" yanlış olurdu) yalnız `hiddenPrefix` vardır.
     */
    hiddenSegment?: string;
  }> {
    // Kimliksiz uç: sorgu uzunluğu ve token sayısı SINIRLI. Sınırsızken
    // ~16 KB'lık "er er er ..." tek istekte ~10.000 ILIKE yüklemli sorgu
    // üretiyordu (derin denetim MU-11). Diğer public arama uçları da q'yu
    // 80-120 karaktere kırpıyor.
    const q = (query ?? "").trim().slice(0, CATEGORY_SEARCH_MAX_LENGTH).trim();
    if (q.length < 2) return { segments: [], truncated: false };

    // TR-katlanmış arama: 'İ' (PG lower → i+combining dot) ve aksansız yazım
    // ("jenerator") ham ILIKE'ta eşleşmez — searchText + katlanmış sorgu esas
    // yol, nameTr ILIKE searchText'i boş kalmış satırlar için yedek.
    //
    // TOKENLİ arama: sorgu TEK PARÇA aranırsa kelime sırası tutmadığında hiçbir
    // şey bulunmaz — "paslanmaz sac" kategori adı "Sac ve paslanmaz yassı
    // mamul" olan satırı ıskalar, "hidrolik pompa fiyatı" hiç bulmaz. Sorgu
    // kelimelere bölünüp AND'lenir: her kelime bir yerde geçmeli, sırası
    // önemsiz. Bu, hiç yeni veri eklemeden recall'ü artırır ve eşanlamlı
    // sözlüğünün (keywords) değerini çarpar — kullanıcı ürün adıyla marka/
    // özellik kelimesini aynı sorguda karıştırdığında da eşleşir.
    const folded = foldSearchText(q);
    // Tekrarlanan kelime (katlanmış biçimiyle) AND listesine bir şey katmaz,
    // yalnız yüklem çoğaltır — tekilleştirilip ilk N kelimeyle sınırlanır.
    const seenTokens = new Set<string>();
    const tokens = tokenizeQuery(q)
      .filter((t) => {
        const key = foldSearchText(t);
        if (seenTokens.has(key)) return false;
        seenTokens.add(key);
        return true;
      })
      .slice(0, CATEGORY_SEARCH_MAX_TOKENS);
    // EK TOLERANSI (code-category-2). Her kelime iki biçimde aranır:
    //   · yazıldığı gibi (düz alt dizgi);
    //   · KÖKÜYLE ("çelik boruları" → "celik" + "boru", "rulmanlarının" →
    //     "rulman", "pipes" → "pipe", "кабели" → "кабел"; `categorySearchStem`),
    //     yalnız bir sözcüğün BAŞINDA.
    // İki biçim AYRI çekilir ve satırlar birleştirilip SIRALANIR
    // (`categoryRowRank`): adı yazılan kelimeyi taşıyan > adı kökü taşıyan >
    // yazılan kelime yalnız eş anlamlıda > kök yalnız eş anlamlıda. 200 tavanı
    // bu sıradan sonra uygulanır. Kökü kelimeyle aynı olan sorguda (ek yok,
    // yalnız rakam, 4 karakterden kısa kök) kök sorgusu HİÇ atılmaz.
    //
    // Eski kural "yazılan kelime nerede geçerse geçsin önce" idi
    // (cat-search-stem-displaces-typed-word): "hidrolik pompası"nda eş
    // anlamlısında "pompası" geçen laboratuvar cihazları, adı "Hidrolik
    // pompalar" olan satırın önüne geçiyordu (recategory-new-1). O kuralın
    // çözdüğü sorun (kök başka sözcüğün İÇİNDE geçiyor: "nakliye" → "nakli" ⊂
    // "kaynaklı") artık süzgeçte çözülü: kök yalnız sözcük başında aranır.
    //
    // JOKER YOK (category-17): Prisma `contains` değeri LIKE desenine olduğu
    // gibi koyar; "%%" / "__" bütün satırlarla, "a_" "a" + herhangi bir
    // karakterle eşleşiyordu. Desene giden her kullanıcı metni `likeLiteral`
    // ile kaçırılır → `%`, `_` ve `\` yalnız kendisiyle eşleşir.
    const terms = tokens.map((raw) => {
      const fold = foldSearchText(raw);
      const stem = categorySearchStem(fold);
      return { raw, fold, stem, rawStem: rawStemOf(raw, stem) };
    });
    // KÖK YALNIZ SÖZCÜK BAŞINDA ARANIR (`stemAtWordStart`, 2026-10-08): düz alt
    // dizgi olarak arandığında "nakliye" 46 birincil satırın arkasına 153
    // alakasız "kaynaklı …" satırı dolduruyor ve sonuç kesiliyordu. Yazılan
    // biçim eskisi gibi düz alt dizgidir.
    const termFilter = (form: "typed" | "stem") => ({
      AND: terms.map((t) => ({
        OR:
          form === "typed" || t.stem === t.fold
            ? [
                { searchText: { contains: likeLiteral(t.fold) } },
                { nameTr: { contains: likeLiteral(t.raw), mode: "insensitive" as const } },
              ]
            : [
                ...stemAtWordStart("searchText", likeLiteral(t.stem)),
                ...stemAtWordStart("nameTr", likeLiteral(t.rawStem), true),
              ],
      })),
    });
    const typedFilter = terms.length
      ? termFilter("typed")
      : // Tek anlamlı kelime kalmadı ("ve ile" gibi) — bütün ifadeyi ara.
        {
          OR: [
            { searchText: { contains: likeLiteral(folded) } },
            { nameTr: { contains: likeLiteral(q), mode: "insensitive" as const } },
          ],
        };

    // Kodla arama (O-048): yalnız rakamdan oluşan sorgu kod ÖNEKİYLE de
    // eşleşir ("43230000" → aile "4323", "31161603" → tam kod). Metin yolu
    // da açık kalır (eş anlamlıda geçen model numarası gibi).
    const codePrefix = categoryCodePrefix(q);
    const withCode = <F extends object>(filter: F) =>
      codePrefix ? { OR: [{ code: { startsWith: codePrefix } }, filter] } : filter;
    const typedMatch = withCode(typedFilter);
    const stemMatch = terms.some((t) => t.stem !== t.fold) ? withCode(termFilter("stem")) : null;
    /** Aynı sorguyu yazılan biçimle ve (kökü farklı kelime varsa) kökle koşar. */
    const bothForms = <T>(run: (match: typeof typedMatch) => Promise<T[]>): Promise<[T[], T[]]> =>
      Promise.all([run(typedMatch), stemMatch ? run(stemMatch) : Promise.resolve<T[]>([])]);
    // ALAKA SIRASI (O-022): eşleşen L3/L4 adayları hafif alanlarla çekilir,
    // sıralanır (tam ad > eşleşme sınıfı > puan: ad başı / tam sözcük > ad içi;
    // kod eşleşmesi en önde) ve 200 tavanı bu sıradan SONRA uygulanır.
    // Eskiden düzey + sıra numarasıyla kesiliyordu → "rulman"da eş anlamlıdan
    // gelen alakasız satırlar öne geçiyor, "kablo"/"boru" 200'de alakasız
    // ilk sonuçlarla kesiliyordu. Eşit puanda SINIF (L3) önce kalır: gezinilebilir
    // omurga emtia seline feda edilmez (2026-09-01 ölçümü "makine").
    //
    // Katalog süzgeci YALNIZ burada: eşleşenler L3+L4 ve iki katalog yalnız
    // L4'te ayrışıyor. Aşağıdaki `famMatches` (L2 + L3 çocukları) süzülmüyor —
    // o katmanlar iki dışa aktarımda birebir aynı.
    const poolSelect = {
      id: true,
      code: true,
      ...CATEGORY_NAME_SELECT,
      level: true,
      sortOrder: true,
      // Eşleşme sınıfı için: kelime adda değilse eş anlamlıda mı (bkz. `categoryRowRank`).
      searchText: true,
    } as const;
    const baseWhere = {
      isActive: true,
      level: { in: [3, 4] },
      ...categoryCatalogWhere(catalog),
    };
    const [typedPool, stemPool] = await bothForms((match) =>
      this.prisma.category.findMany({
        where: { ...baseWhere, ...match },
        select: poolSelect,
        orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
        take: CATEGORY_SEARCH_POOL,
      }),
    );
    /**
     * Çok geniş sorgu: havuz eş anlamlı eşleşmeleriyle dolmuş olabilir →
     * ADINDA geçenler ayrıca çekilir ki alakalı satır havuz dışında kalmasın.
     */
    const addNameRows = async (pool: typeof typedPool, form: "typed" | "stem") => {
      if (pool.length < CATEGORY_SEARCH_POOL || terms.length === 0) return;
      const byName = await this.prisma.category.findMany({
        where: {
          ...baseWhere,
          AND: terms.map((t) => ({
            OR:
              form === "typed" || t.stem === t.fold
                ? [
                    { nameTr: { contains: likeLiteral(t.raw), mode: "insensitive" as const } },
                    { nameEn: { contains: likeLiteral(t.raw), mode: "insensitive" as const } },
                    { nameRu: { contains: likeLiteral(t.raw), mode: "insensitive" as const } },
                  ]
                : [
                    ...stemAtWordStart("nameTr", likeLiteral(t.rawStem), true),
                    ...stemAtWordStart("nameEn", likeLiteral(t.rawStem), true),
                    ...stemAtWordStart("nameRu", likeLiteral(t.rawStem), true),
                  ],
          })),
        },
        select: poolSelect,
        orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
        take: CATEGORY_SEARCH_POOL,
      });
      const seen = new Set(pool.map((r) => r.id));
      for (const r of byName) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        pool.push(r);
      }
    };
    // Havuz kendi tavanına takıldıysa ADINDA geçenler ayrıca istenir: yazılan
    // biçim için (sınıf 0) ve kök için (sınıf 1). İkisi de eş anlamlı
    // eşleşmelerinin önünde sıralandığından havuz dışında kalmamalıdır.
    await Promise.all([addNameRows(typedPool, "typed"), addNameRows(stemPool, "stem")]);
    const candidates = new Map(typedPool.map((r) => [r.id, r] as const));
    for (const r of stemPool) if (!candidates.has(r.id)) candidates.set(r.id, r);

    const foldedTokens = terms.map((t) => t.fold);
    /**
     * Satırın sırası: kod eşleşmesi kendi sınıfının en önünde (puan ≥ 100).
     * "Adının tamamı sorguya eşit" önceliği sektör / aile / sınıf içindir;
     * emtia (L4) kendi puanıyla yarışır — "çelik" yazınca adı "Çelik" olan tek
     * emtia, çelik ürünlerinin sektörünü geçmesin.
     */
    const rankOf = (row: {
      code: string;
      level: number;
      nameTr: string;
      nameEn: string | null;
      nameRu: string | null;
      searchText?: string | null;
    }): CategoryRowRank => {
      if (codePrefix && row.code.startsWith(codePrefix)) {
        return {
          exact: false,
          matchClass: 0,
          score: 100 + (row.code === codePrefix.padEnd(8, "0") ? 50 : 0),
          wordMatch: false,
        };
      }
      // `wordMatch` okuyucunun gördüğü ada göre (bkz. `CategoryRowRank.wordMatch`).
      const rank = categoryRowRank(row, foldedTokens, folded, categoryName(row));
      return rank.exact && row.level > 3 ? { ...rank, exact: false } : rank;
    };
    // 200 tavanı: sıra tam ad → eşleşme sınıfı → puan; eşitte SINIF (L3) emtiadan
    // önce (gezinilebilir omurga emtia seline feda edilmez), sonra katalog sırası.
    const top = Array.from(candidates.values())
      .map((row) => ({ row, rank: rankOf(row) }))
      .sort(
        (a, b) =>
          compareCategoryRank(a.rank, b.rank) ||
          a.row.level - b.row.level ||
          a.row.sortOrder - b.row.sortOrder,
      )
      .slice(0, CATEGORY_SEARCH_RESULT_CAP);
    const rankById = new Map(top.map((x) => [x.row.id, x.rank] as const));

    // Yalnız ağaca girecek satırların ata zinciri.
    const chainRows = top.length
      ? await this.prisma.category.findMany({
          where: { id: { in: top.map((x) => x.row.id) } },
          include: {
            parent: {
              include: {
                parent: {
                  include: {
                    parent: true,
                  },
                },
              },
            },
          },
        })
      : [];
    const chainById = new Map(chainRows.map((r) => [r.id, r] as const));
    const matched = top
      .map((x) => chainById.get(x.row.id))
      .filter((r): r is (typeof chainRows)[number] => !!r);

    // Family (L2) adıyla arama da bulsun: eşleşen family'lerin TÜM Class'ları
    // sonuç ağacına eklenir — "Pano ve dağıtım sistemleri" yazan kullanıcı
    // altındaki seçilebilir detayları görür (Class/Commodity adı eşleşmese de).
    // Aile tavanı SIRADAN sonra: adı sorguya eşit olan ya da yazılan kelimeyi
    // taşıyan aile, katalog sırasında önde gelen eş anlamlı / kök eşleşmeleri
    // yüzünden düşmez. Sınıflar yalnız tavana giren aileler için istenir.
    const sectorSelect = {
      id: true,
      code: true,
      ...CATEGORY_NAME_SELECT,
      level: true,
      segmentLetter: true,
      sortOrder: true,
      searchText: true,
    } as const;
    const [typedFams, stemFams] = await bothForms((match) =>
      this.prisma.category.findMany({
        where: {
          isActive: true,
          level: 2,
          ...match,
          ...hiddenCategoryWhere(),
        },
        select: {
          id: true,
          code: true,
          ...CATEGORY_NAME_SELECT,
          level: true,
          sortOrder: true,
          searchText: true,
          parent: { select: sectorSelect },
        },
        take: CATEGORY_SEARCH_FAMILY_POOL,
        orderBy: { sortOrder: "asc" },
      }),
    );
    const famById = new Map(typedFams.map((f) => [f.id, f] as const));
    for (const f of stemFams) if (!famById.has(f.id)) famById.set(f.id, f);
    const famMatches = Array.from(famById.values())
      .map((row) => ({ row, rank: rankOf(row) }))
      .sort((a, b) => compareCategoryRank(a.rank, b.rank) || a.row.sortOrder - b.row.sortOrder)
      .slice(0, CATEGORY_SEARCH_FAMILY_CAP);
    const classSelect = {
      id: true,
      code: true,
      ...CATEGORY_NAME_SELECT,
      level: true,
      sortOrder: true,
      parentId: true,
    } as const;
    const famClasses = famMatches.length
      ? await this.prisma.category.findMany({
          where: {
            isActive: true,
            level: 3,
            parentId: { in: famMatches.map((x) => x.row.id) },
            // Görünür ailenin GİZLİ sınıfı listelenmez (2026-10-10: gizleme
            // sınıf düzeyinde de var — 4618 ailesinin 461825 sınıfı).
            ...hiddenCategoryWhere(),
          },
          select: classSelect,
          orderBy: { sortOrder: "asc" },
        })
      : [];

    // SEKTÖR (L1) adıyla arama da bulsun (category-18): listede görünen sektör
    // adını ("Elektrik Sistemleri ve Aydınlatma") yazan kullanıcı "sonuç
    // bulunamadı" görüyordu — arama yalnız L2-L4'e bakıyordu. Adı eşleşen
    // sektör BÜTÜN aileleri ve onların sınıflarıyla döner; kullanıcı aradığını
    // oradan açar. Ölçüt AD (her kelime adın bir sözcüğünün BAŞINDA geçmeli,
    // `categoryNameMatchesAll`): süzgeç eş anlamlıya ve sözcük içine de
    // baktığından ad ayrıca denetlenir. Kod araması ve yalnız bağlaçtan oluşan
    // sorgu ("ve") sektör döndürmez. Sektör tavanı da satır sırasıyla dolar
    // (adı sorguya eşit olan, sonra yazılan kelimeyi taşıyan, sonra kökü).
    const [typedSectors, stemSectors] =
      !codePrefix && terms.length > 0
        ? await bothForms((match) =>
            this.prisma.category.findMany({
              where: { isActive: true, level: 1, ...match, ...hiddenCategoryWhere() },
              select: sectorSelect,
              orderBy: { sortOrder: "asc" },
            }),
          )
        : [[], []];
    const sectorById = new Map(typedSectors.map((r) => [r.id, r] as const));
    for (const r of stemSectors) if (!sectorById.has(r.id)) sectorById.set(r.id, r);
    const sectorNameMatches = Array.from(sectorById.values())
      .filter((row) => categoryNameMatchesAll(row, foldedTokens, folded))
      .map((row) => ({ row, rank: rankOf(row) }))
      .sort((a, b) => compareCategoryRank(a.rank, b.rank) || a.row.sortOrder - b.row.sortOrder);
    const sectorMatches = sectorNameMatches.slice(0, CATEGORY_SEARCH_SECTOR_CAP);
    const sectorFamilies = sectorMatches.length
      ? await this.prisma.category.findMany({
          where: {
            isActive: true,
            level: 2,
            parentId: { in: sectorMatches.map((x) => x.row.id) },
            // Görünür sektörün GİZLİ aileleri ve sınıfları açılmaz
            // (2026-10-10): adı eşleşen sektör "bütün aileleriyle" döner ama
            // gizli dallar o bütünün parçası değildir (46 → 4610 … 4622).
            ...hiddenCategoryWhere(),
          },
          include: {
            children: {
              where: { isActive: true, level: 3, ...hiddenCategoryWhere() },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { sortOrder: "asc" },
        })
      : [];

    if (matched.length === 0 && famMatches.length === 0 && sectorMatches.length === 0) {
      // Sonuçsuz aramalar keywords/taksonomi kürasyonunun ham girdisi —
      // log drain'de "Kategori araması sonuçsuz" ile toplanır.
      // Kod araması kürasyon kuyruğuna YAZILMAZ: eş anlamlı ekleyerek
      // çözülecek bir terim değil (O-048 — sahte kayıt düşüyordu).
      if (codePrefix) {
        const hiddenPrefix = hiddenCategoryPrefixOf(codePrefix);
        if (!hiddenPrefix) return { segments: [], truncated: false };
        return {
          segments: [],
          truncated: false,
          hiddenPrefix,
          ...(hiddenPrefix.length === 2 ? { hiddenSegment: hiddenPrefix } : {}),
        };
      }
      this.logger.log(`Kategori araması sonuçsuz: "${q.slice(0, 80)}"`);
      await this.recordSearchMiss(q, folded);
      return { segments: [], truncated: false };
    }

    /**
     * Bir düğümün (sektör / aile / sınıf) sıralama anahtarı
     * (recategory-new-1 / new-2). Düğüm, alt ağacındaki EN İYİ satırla
     * (kendi adı dahil) yarışır; satırlar önce KÜMELERE ayrılır:
     *   0 — adının tamamı sorguya eşit
     *   1-4 — eşleşme sınıfı 0-3 (ad + yazılan kelime … eş anlamlıda kök)
     * Düğümün kümesi, satırı olan en küçük kümedir. Sıra için bkz. `byBestRow`.
     */
    interface RankKeys {
      /** Alt ağaçta (düğümün kendi adı dahil) satırı olan en iyi küme; eşleşme yoksa -1. */
      bucket: number;
      /**
       * O kümede, adı sorgu kelimelerini SÖZCÜK olarak taşıyan (`wordMatch`)
       * satırların en ÜST düzeyi (1 sektör … 4 emtia); öyle satır yoksa
       * `NO_WORD_LEVEL`.
       */
      topLevel: number;
      /** O kümedeki ad eşleşmelerinin toplam ağırlığı (`relevanceWeight`). */
      weight: number;
      /** O kümedeki en iyi puan. */
      score: number;
    }
    const NO_WORD_LEVEL = 9;
    const newRank = (): RankKeys => ({ bucket: -1, topLevel: NO_WORD_LEVEL, weight: 0, score: 0 });
    const bucketOf = (rank: CategoryRowRank) => (rank.exact ? 0 : rank.matchClass + 1);
    const credit = (acc: RankKeys, rank: CategoryRowRank, level: number) => {
      const bucket = bucketOf(rank);
      if (acc.bucket !== -1 && bucket > acc.bucket) return;
      if (bucket !== acc.bucket) {
        acc.bucket = bucket;
        acc.topLevel = NO_WORD_LEVEL;
        acc.weight = 0;
        acc.score = 0;
      }
      if (rank.wordMatch) acc.topLevel = Math.min(acc.topLevel, level);
      acc.weight += relevanceWeight(rank.score);
      acc.score = Math.max(acc.score, rank.score);
    };

    interface ClassAcc extends RankKeys {
      id: string;
      code: string;
      nameTr: string;
      level: number;
      sortOrder: number;
      isMatch: boolean;
      /** Ailesi ya da sektörü eşleştiği için listede (category-18). */
      parentMatch: boolean;
      /** Sınıfın KENDİ satırının sırası (kendisi eşleştiyse). */
      own: CategoryRowRank | null;
      commodities: Map<
        string,
        {
          id: string;
          code: string;
          nameTr: string;
          level: number;
          sortOrder: number;
          isMatch: boolean;
          rank: CategoryRowRank;
        }
      >;
    }
    interface FamilyAcc extends RankKeys {
      id: string;
      code: string;
      nameTr: string;
      level: number;
      sortOrder: number;
      isMatch: boolean;
      classes: Map<string, ClassAcc>;
    }
    interface SegmentAcc extends RankKeys {
      id: string;
      code: string;
      nameTr: string;
      level: number;
      segmentLetter: string | null;
      sortOrder: number;
      isMatch: boolean;
      families: Map<string, FamilyAcc>;
    }

    const segmentMap = new Map<string, SegmentAcc>();

    /**
     * Ata zincirindeki düğümlerin YALNIZ kullanılan alanları.
     *
     * Eskiden `typeof cat.parent` yazılıyordu; o tip include derinliğini de
     * taşıdığı için `family.parent` (bir seviye SIĞ) `segment`e atanamıyordu
     * ve `tsc` TAM derlemede patlıyordu. Yerelde fark edilmiyordu: artımlı
     * derleme (`tsbuildinfo`) değişmeyen bu dosyayı yeniden denetlemiyor,
     * Docker'daki temiz build ise her dosyayı denetliyor → her deploy düştü
     * (2026-09-03). Yapısal tip derinlikten bağımsız: her seviye bu alanları
     * taşır.
     */
    type CatNode = {
      id: string;
      code: string;
      nameTr: string;
      level: number;
      segmentLetter: string | null;
      sortOrder: number;
    };
    /** Aile ve sınıf düğümü — `segmentLetter` yalnız sektörde okunur. */
    type TreeNode = Omit<CatNode, "segmentLetter">;

    // Düğüm yoksa kurar, varsa olanı döner — eşleşme, aile ve sektör döngüleri
    // aynı ağacı doldurur.
    const segAccOf = (segment: CatNode): SegmentAcc => {
      let acc = segmentMap.get(segment.id);
      if (!acc) {
        acc = {
          id: segment.id,
          code: segment.code,
          nameTr: categoryName(segment),
          level: segment.level,
          segmentLetter: segment.segmentLetter,
          sortOrder: segment.sortOrder,
          isMatch: false,
          ...newRank(),
          families: new Map(),
        };
        segmentMap.set(segment.id, acc);
      }
      return acc;
    };
    const famAccOf = (segAcc: SegmentAcc, family: TreeNode): FamilyAcc => {
      let acc = segAcc.families.get(family.id);
      if (!acc) {
        acc = {
          id: family.id,
          code: family.code,
          nameTr: categoryName(family),
          level: family.level,
          sortOrder: family.sortOrder,
          isMatch: false,
          ...newRank(),
          classes: new Map(),
        };
        segAcc.families.set(family.id, acc);
      }
      return acc;
    };
    const clsAccOf = (famAcc: FamilyAcc, cls: TreeNode): ClassAcc => {
      let acc = famAcc.classes.get(cls.id);
      if (!acc) {
        acc = {
          id: cls.id,
          code: cls.code,
          nameTr: categoryName(cls),
          level: cls.level,
          sortOrder: cls.sortOrder,
          isMatch: false,
          parentMatch: false,
          own: null,
          ...newRank(),
          commodities: new Map(),
        };
        famAcc.classes.set(cls.id, acc);
      }
      return acc;
    };

    for (const cat of matched) {
      // Tüm match level 3 veya 4. Parent zinciri 4-seviye yukarı çıkar.
      let segment: CatNode | null = null;
      let family: CatNode | null = null;
      let cls: CatNode | null = null;
      let commodity: CatNode | null = null;

      if (cat.level === 4) {
        commodity = cat;
        cls = cat.parent;
        family = cat.parent?.parent ?? null;
        segment = cat.parent?.parent?.parent ?? null;
      } else if (cat.level === 3) {
        cls = cat;
        family = cat.parent;
        segment = cat.parent?.parent ?? null;
      }

      if (!segment || !family || !cls) continue;
      const rank = rankById.get(cat.id);
      if (!rank) continue;

      const segAcc = segAccOf(segment);
      const famAcc = famAccOf(segAcc, family);
      credit(segAcc, rank, cat.level);
      credit(famAcc, rank, cat.level);

      const clsAcc = clsAccOf(famAcc, cls);
      if (cat.level === 3 && cat.id === cls.id) {
        // Yalnız kökle ya da eş anlamlıdan gelen satır da EŞLEŞMEDİR (vurgu +
        // seçilebilir); yalnız sıralamada geride durur.
        clsAcc.isMatch = true;
        clsAcc.own = rank;
      }
      credit(clsAcc, rank, cat.level);

      if (commodity) {
        if (!clsAcc.commodities.has(commodity.id)) {
          clsAcc.commodities.set(commodity.id, {
            id: commodity.id,
            code: commodity.code,
            nameTr: categoryName(commodity),
            level: commodity.level,
            sortOrder: commodity.sortOrder,
            isMatch: true,
            rank,
          });
        }
      }
    }

    // Family eşleşmeleri: segment→family bloğu kur, Class çocuklarını ekle
    // (isMatch=false — vurgu yalnız ada eşleşen düğümde kalır). Sınıflar
    // `parentMatch` ile İŞARETLENİR (category-18): kendi adı eşleşmeyen, emtiası
    // da olmayan sınıfı arayüz hiç çizmiyordu → aile çıplak başlık kalıyordu.
    // İşaret "ailesi eşleşti, seçilebilir satır olarak listele" demektir.
    const classesByFamily = new Map<string, typeof famClasses>();
    for (const cls of famClasses) {
      if (!cls.parentId) continue;
      const list = classesByFamily.get(cls.parentId);
      if (list) list.push(cls);
      else classesByFamily.set(cls.parentId, [cls]);
    }
    for (const { row: fam, rank } of famMatches) {
      const segment = fam.parent;
      if (!segment) continue;
      const segAcc = segAccOf(segment);
      const famAcc = famAccOf(segAcc, fam);
      famAcc.isMatch = true;
      credit(segAcc, rank, fam.level);
      credit(famAcc, rank, fam.level);
      for (const cls of classesByFamily.get(fam.id) ?? []) clsAccOf(famAcc, cls).parentMatch = true;
    }

    // Sektör eşleşmeleri (category-18): sektör, BÜTÜN aileleri ve sınıflarıyla.
    // Sınıflar yukarıdaki gibi `parentMatch`; aileler kendileri eşleşmediyse
    // `isMatch=false` kalır. Sektörün kendi adı yalnız KENDİ sırasını etkiler —
    // altındaki ailelerin sırası gerçek eşleşmelerle, sonra katalog sırasıyla
    // (eşleşmesi olmayan aile sona düşer).
    const matchedSectorById = new Map(sectorMatches.map((x) => [x.row.id, x] as const));
    for (const { row, rank } of sectorMatches) {
      const segAcc = segAccOf(row);
      segAcc.isMatch = true;
      credit(segAcc, rank, row.level);
    }
    for (const fam of sectorFamilies) {
      const sector = fam.parentId ? matchedSectorById.get(fam.parentId) : undefined;
      if (!sector) continue;
      const famAcc = famAccOf(segAccOf(sector.row), fam);
      for (const cls of fam.children) clsAccOf(famAcc, cls).parentMatch = true;
    }

    // SIRALAMA (O-022; recategory-new-1 / new-2). Her düzeyde aynı ilke:
    // düğüm, alt ağacındaki EN İYİ satırla yarışır.
    //   1) KÜME: adının tamamı sorguya eşit bir satırı (sektör / aile / sınıf)
    //      olan düğüm EN ÖNDE — "hardware" yazınca "Hardware" ailesinin
    //      sektörü, adında "… hardware …" geçen 40 satırlı sektörün önünde.
    //      Sonra en iyi satırın eşleşme sınıfı (ad + yazılan kelime > ad + kök >
    //      yalnız eş anlamlı > eş anlamlıda kök).
    //   2) O kümedeki en ÜST düzey — genel olan özelden önce: "tekstil" yazınca
    //      adında Tekstil geçen SEKTÖR, sonra adı eşleşen AİLESİ olan sektör,
    //      sonra yalnız sınıfı / emtiası eşleşenler ("сварка": "… для сварки и
    //      пайки" ailesi, yüz "… с ультразвуковой сваркой" emtiasından önce).
    //      Yalnız kelimeyi SÖZCÜK olarak taşıyan ad sayılır (`wordMatch`):
    //      "motor" yazınca "Motorlu araçlar" ailesi bu önceliği almaz.
    //   3) O kümedeki ad eşleşmelerinin AĞIRLIĞI. En iyi tek puan çok sık
    //      eşitlenir ("kablo"da 11 segmentin hepsinde adı "Kablo …" ile başlayan
    //      bir satır var); ağırlık yalnız ADDA geçen satırları sayar (eş anlamlı
    //      = 0), dolayısıyla eş anlamlı seli segmenti öne çekemez.
    //   4) En iyi puan, sonra katalog sırası.
    // Sınıflarda 2. adım sınıfın KENDİ satırının sırasıdır ("kablo": "Kablo
    // tesisatı" sınıfı, yüz "… kablosu" emtiası olan "Elektrik kablosu ve
    // aksesuarları" sınıfının altında gömülmesin); emtia yaprakları kendi
    // satır sırasıyla. Eşleşmesi olmayan düğüm (yalnız eşleşen sektörün /
    // ailenin altında listelenen) sonda, katalog sırasıyla.
    const unmatchedLast = <T extends RankKeys & { sortOrder: number }>(a: T, b: T) =>
      Number(a.bucket === -1) - Number(b.bucket === -1) || a.sortOrder - b.sortOrder;
    const byBestRow = <T extends RankKeys & { sortOrder: number }>(a: T, b: T) =>
      a.bucket === -1 || b.bucket === -1
        ? unmatchedLast(a, b)
        : a.bucket - b.bucket ||
          a.topLevel - b.topLevel ||
          b.weight - a.weight ||
          b.score - a.score ||
          a.sortOrder - b.sortOrder;
    /**
     * Sınıfın kendi satırı — yalnız sıraya bir şey katıyorsa: adı eşleşti ya
     * da puanı var. Yalnız eş anlamlıdan gelen (puan 0) kendi eşleşmesi,
     * emtiası eşleşen sınıfın önüne geçmez.
     */
    const ownRow = (acc: ClassAcc) =>
      acc.own && (acc.own.matchClass <= 1 || acc.own.score > 0) ? acc.own : null;
    const byOwnName = (a: ClassAcc, b: ClassAcc) => {
      if (a.bucket === -1 || b.bucket === -1) return unmatchedLast(a, b);
      const ownA = ownRow(a);
      const ownB = ownRow(b);
      return (
        a.bucket - b.bucket ||
        (ownA && ownB ? compareCategoryRank(ownA, ownB) : Number(!ownA) - Number(!ownB)) ||
        b.weight - a.weight ||
        b.score - a.score ||
        a.sortOrder - b.sortOrder
      );
    };
    const byRank = <T extends { sortOrder: number; rank: CategoryRowRank }>(a: T, b: T) =>
      compareCategoryRank(a.rank, b.rank) || a.sortOrder - b.sortOrder;

    const segments = Array.from(segmentMap.values())
      .sort(byBestRow)
      .map((seg) => ({
        id: seg.id,
        code: seg.code,
        nameTr: categoryName(seg),
        level: seg.level,
        segmentLetter: seg.segmentLetter,
        isMatch: seg.isMatch,
        families: Array.from(seg.families.values())
          .sort(byBestRow)
          .map((fam) => ({
            id: fam.id,
            code: fam.code,
            nameTr: categoryName(fam),
            level: fam.level,
            isMatch: fam.isMatch,
            classes: Array.from(fam.classes.values())
              .sort(byOwnName)
              .map((cls) => ({
                id: cls.id,
                code: cls.code,
                nameTr: categoryName(cls),
                level: cls.level,
                isMatch: cls.isMatch,
                parentMatch: cls.parentMatch,
                commodities: Array.from(cls.commodities.values())
                  .sort(byRank)
                  .map((com) => ({
                    id: com.id,
                    code: com.code,
                    nameTr: categoryName(com),
                    level: com.level,
                    isMatch: com.isMatch,
                  })),
              })),
          })),
      }));

    // 200 tavanına çarptıysak kullanıcı bilsin — sessiz kırpma yanıltıcı.
    return {
      segments,
      truncated:
        candidates.size > CATEGORY_SEARCH_RESULT_CAP ||
        sectorNameMatches.length > CATEGORY_SEARCH_SECTOR_CAP,
    };
  }

  /**
   * Belirli ID'lerin breadcrumb bilgisi (chip listesi için).
   *
   * V2-6.5 fix — `isActive` filtresi kaldırıldı. Eski tender'larda seçilmiş
   * kategori sonradan gizlenmişse (cleanup script ile `isActive=false`), chip
   * listesinde "Yükleniyor…" sonsuza dek kalıyordu. Artık adı/breadcrumb'ı
   * yine döner — kullanıcı eski seçimi görür ama yeni kategori seçim
   * listesinde (getRoots/getChildren) görünmez. Hard-delete'lenmiş id boş
   * döner (findMany doğal davranış).
   *
   * GİZLİ SEGMENT ÇÖZÜLMEZ (2026-10-09, sahip kuralı: "anasayfada olmayan
   * kategori talepte, üründe ya da başka yerde de gösterilmesin"). Bu uç
   * SAKLANMIŞ kodu ada + kırıntıya çeviren GENEL çözücüdür (talep detayı,
   * Ayarlar › Kategoriler çipleri, onay detayı, ürün formu — hepsi buraya
   * sorar); gizli segmentin kodu hiç dönmez, `isActive` muafiyeti ona UZANMAZ.
   * Web sözleşmesi: dönmeyen id için hiçbir şey çizilmez (çip, kırıntı,
   * "Yükleniyor…" iskeleti dahil).
   */
  async getByIds(ids: string[]) {
    const visible = visibleCategoryIds(ids);
    if (visible.length === 0) return [];

    const cats = await this.prisma.category.findMany({
      where: { id: { in: visible } },
      include: {
        parent: {
          include: {
            parent: {
              include: {
                parent: {
                  select: {
                    id: true,
                    ...CATEGORY_NAME_SELECT,
                    segmentLetter: true,
                    level: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return cats.map((c) => ({
      id: c.id,
      code: c.code,
      nameTr: categoryName(c),
      level: c.level,
      breadcrumb: buildBreadcrumb(c),
    }));
  }

  /**
   * Sonuçsuz aramayı kürasyon kuyruğuna yazar (Faz 6).
   *
   * Katlanmış biçim tekil anahtar: "Abkant", "abkant", "ABKANT" tek satırda
   * toplanır ve sayaç GERÇEK talebi gösterir — yoksa aynı ihtiyaç üç ayrı
   * düşük-sayılı satıra bölünür ve kuyrukta hiç yukarı çıkmaz.
   *
   * AWAIT ediliyor, fire-and-forget DEĞİL. Gerekçe: bu depoda arkada bırakılan
   * yazımlar test yalıtımını bozup TRUNCATE ile kilit yarışına giriyordu
   * (CLAUDE.md 40P01 notu). Sonuçsuz arama zaten azınlık yol; tek ek tur
   * kullanıcıya hissettirmez.
   *
   * Hata YUTULUR: kürasyon istatistiği hiçbir zaman aramayı düşürmemeli.
   */
  private async recordSearchMiss(raw: string, folded: string): Promise<void> {
    // Çok uzun sorgu kürasyona bir şey katmaz, tabloyu şişirir (yapıştırılan
    // ürün tarifi, tesadüfi metin). Kısa olan zaten çağıran tarafta elendi.
    if (!folded || folded.length > 60) return;
    try {
      await this.prisma.categorySearchMiss.upsert({
        where: { query: folded },
        create: { query: folded, rawQuery: raw.slice(0, 80) },
        update: {
          count: { increment: 1 },
          lastSeenAt: new Date(),
          rawQuery: raw.slice(0, 80),
          // Yeniden aranıyorsa çözüm tutmamış demektir — kuyruğa geri alınır.
          resolvedAt: null,
        },
      });
    } catch {
      // Sessiz: tablo yoksa (migration uygulanmamış ortam) ya da yarış
      // durumunda arama akışı etkilenmemeli.
    }
  }

  /**
   * Validation — ID'ler aktif kategoriye işaret etmeli; options ile level
   * kısıtı uygulanır. İki mod:
   *   - `minLevel`: her ID'nin level'ı >= minLevel olmalı (tender → 3 ile çağrılır;
   *     Class veya Commodity kabul, Segment/Family reddedilir).
   *   - `exactLevel`: her ID'nin level'ı tam olarak verilen değer olmalı
   *     (tedarikçi → 1 ile çağrılır; sadece ana başlık/Segment kabul).
   * Numeric arg geriye uyum için minLevel olarak yorumlanır.
   *
   * `allowHidden` (code-category-12): gizli segment süzgecinden MUAF kodlar —
   * firmanın beyanında ZATEN duran kodlar. Segment gizlenmeden önce kaydedilmiş
   * kod, başka bir değişikliğin kaydını engellemesin diye; varlık, `isActive`
   * ve seviye kuralı onlara da uygulanır. Listede olmayan (yeni eklenen) gizli
   * kod eskisi gibi "geçersiz"dir.
   */
  async validateIds(
    ids: string[],
    options:
      | number
      | { minLevel?: number; exactLevel?: number; allowHidden?: Iterable<string> } = {
      minLevel: 3,
    },
  ): Promise<void> {
    if (ids.length === 0) return;

    const opts =
      typeof options === "number" ? { minLevel: options } : options;
    const allowHidden = new Set(opts.allowHidden ?? []);

    const rows = await this.prisma.category.findMany({
      // Gizli segmentin kodu "geçersiz" sayılır — seçicide zaten görünmez.
      // Muaf kod varken süzgeç sorguda değil aşağıda, kod bazında uygulanır.
      where: {
        id: { in: ids },
        isActive: true,
        ...(allowHidden.size === 0 ? hiddenCategoryWhere() : {}),
      },
      select: { id: true, level: true },
    });
    const found =
      allowHidden.size === 0
        ? rows
        : rows.filter((c) => allowHidden.has(c.id) || !isHiddenCategory(c.id));

    const foundIds = new Set(found.map((c) => c.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        i18nMessage("api.categories.gecersizKategoriId", { join: missing.join(", ") }),
      );
    }

    if (opts.exactLevel !== undefined) {
      const wrong = found.filter((c) => c.level !== opts.exactLevel);
      if (wrong.length > 0) {
        throw new BadRequestException(
          opts.exactLevel === 1
            ? i18nMessage("api.categories.yalnizSegmentSeviyesiSecilebilir")
            : i18nMessage("api.categories.yalnizBelirtilenSeviyeSecilebilir", {
                level: opts.exactLevel,
              }),
        );
      }
      return;
    }

    if (opts.minLevel !== undefined) {
      const tooHigh = found.filter((c) => c.level < (opts.minLevel as number));
      if (tooHigh.length > 0) {
        // Mesaj minLevel'a göre kurulur. Sabit metin, minLevel=3 varsayıyordu;
        // firma ALT kategorisi minLevel=2 ile çağırıyor ve orada Family GEÇERLİ
        // — sabit metin kullanıcıya yanlış kuralı söylerdi.
        throw new BadRequestException(
          opts.minLevel >= 3
            ? i18nMessage("api.categories.yalnizClassVeyaCommoditySecilebilir")
            : i18nMessage("api.categories.segmentAltKategoriOlarakSecilemez"),
        );
      }
    }
  }
}

/**
 * Bir kategorinin (4 seviye parent chain ile birlikte) breadcrumb string'ini
 * üretir: "A. Segment Adı › Family Adı › Class Adı › Commodity Adı".
 *
 * Caller include'da `parent.parent.parent.parent` (en az level 1'e ulaşana
 * kadar) zincirini sağlamalı. Eksik zincirde mevcut kısmı verir.
 */
export function buildBreadcrumb(node: unknown): string {
  const parts: string[] = [];
  let cur: any = node;
  while (cur) {
    if (cur.level === 1) {
      const letter = cur.segmentLetter ? `${cur.segmentLetter}. ` : "";
      parts.unshift(`${letter}${categoryName(cur)}`);
    } else if (cur.nameTr) {
      parts.unshift(categoryName(cur));
    }
    cur = cur.parent;
  }
  return parts.join(" › ");
}
