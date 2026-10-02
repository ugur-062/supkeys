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
  hiddenCategoryWhere,
  isHiddenCategory,
  foldSearchText,
  tokenizeQuery,
  type CategoryCatalog,
} from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  categoryCodePrefix,
  categoryMatchScore,
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
      families: Array<{
        id: string;
        code: string;
        nameTr: string;
        level: number;
        classes: Array<{
          id: string;
          code: string;
          nameTr: string;
          level: number;
          isMatch: boolean;
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
     * Sonuçsuz KOD aramasında kod gizli bir segmentin altındaysa o segmentin
     * iki hanesi (O-048, yeniden doğrulama) — admin kategori tarayıcısı "Sonuç
     * yok" yerine nedenini söyler. Diğer durumlarda yok.
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
    const nameFilter = tokens.length
      ? {
          AND: tokens.map((t) => ({
            OR: [
              { searchText: { contains: foldSearchText(t) } },
              { nameTr: { contains: t, mode: "insensitive" as const } },
            ],
          })),
        }
      : // Tek anlamlı kelime kalmadı ("ve ile" gibi) — bütün ifadeyi ara.
        {
          OR: [
            { searchText: { contains: folded } },
            { nameTr: { contains: q, mode: "insensitive" as const } },
          ],
        };

    // Kodla arama (O-048): yalnız rakamdan oluşan sorgu kod ÖNEKİYLE de
    // eşleşir ("43230000" → aile "4323", "31161603" → tam kod). Metin yolu
    // da açık kalır (eş anlamlıda geçen model numarası gibi).
    const codePrefix = categoryCodePrefix(q);
    const matchFilter = codePrefix
      ? { OR: [{ code: { startsWith: codePrefix } }, nameFilter] }
      : nameFilter;

    // ALAKA SIRASI (O-022): eşleşen L3/L4 adayları hafif alanlarla çekilir,
    // puanlanır (ad başı / tam sözcük > ad içi > yalnız eş anlamlı; kod
    // eşleşmesi en önde) ve 200 tavanı puan sırasından SONRA uygulanır.
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
    } as const;
    const baseWhere = {
      isActive: true,
      level: { in: [3, 4] },
      ...categoryCatalogWhere(catalog),
    };
    const pool = await this.prisma.category.findMany({
      where: { ...baseWhere, ...matchFilter },
      select: poolSelect,
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
      take: CATEGORY_SEARCH_POOL,
    });
    const poolFull = pool.length >= CATEGORY_SEARCH_POOL;
    if (poolFull && tokens.length > 0) {
      // Çok geniş sorgu: havuz eş anlamlı eşleşmeleriyle dolmuş olabilir →
      // ADINDA geçenler ayrıca çekilir ki alakalı satır havuz dışında kalmasın.
      const byName = await this.prisma.category.findMany({
        where: {
          ...baseWhere,
          AND: tokens.map((t) => ({
            OR: [
              { nameTr: { contains: t, mode: "insensitive" as const } },
              { nameEn: { contains: t, mode: "insensitive" as const } },
              { nameRu: { contains: t, mode: "insensitive" as const } },
            ],
          })),
        },
        select: poolSelect,
        orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
        take: CATEGORY_SEARCH_POOL,
      });
      const seen = new Set(pool.map((r) => r.id));
      for (const r of byName) if (!seen.has(r.id)) pool.push(r);
    }

    const foldedTokens = tokens.map((t) => foldSearchText(t));
    const scoreOf = (row: {
      code: string;
      nameTr: string;
      nameEn: string | null;
      nameRu: string | null;
    }) =>
      codePrefix && row.code.startsWith(codePrefix)
        ? 100 + (row.code === codePrefix.padEnd(8, "0") ? 50 : 0)
        : categoryMatchScore(row, foldedTokens, folded);
    const scored = pool
      .map((row) => ({ row, score: scoreOf(row) }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.row.level - b.row.level ||
          a.row.sortOrder - b.row.sortOrder,
      );
    const top = scored.slice(0, CATEGORY_SEARCH_RESULT_CAP);
    const scoreById = new Map(scored.map((x) => [x.row.id, x.score] as const));

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
    const famMatches = await this.prisma.category.findMany({
      where: {
        isActive: true,
        level: 2,
        ...matchFilter,
        ...hiddenCategoryWhere(),
      },
      include: {
        parent: true,
        children: {
          where: { isActive: true, level: 3 },
          orderBy: { sortOrder: "asc" },
        },
      },
      take: 20,
      orderBy: { sortOrder: "asc" },
    });

    if (matched.length === 0 && famMatches.length === 0) {
      // Sonuçsuz aramalar keywords/taksonomi kürasyonunun ham girdisi —
      // log drain'de "Kategori araması sonuçsuz" ile toplanır.
      // Kod araması kürasyon kuyruğuna YAZILMAZ: eş anlamlı ekleyerek
      // çözülecek bir terim değil (O-048 — sahte kayıt düşüyordu).
      if (codePrefix) {
        return isHiddenCategory(codePrefix)
          ? { segments: [], truncated: false, hiddenSegment: codePrefix.slice(0, 2) }
          : { segments: [], truncated: false };
      }
      this.logger.log(`Kategori araması sonuçsuz: "${q.slice(0, 80)}"`);
      await this.recordSearchMiss(q, folded);
      return { segments: [], truncated: false };
    }

    interface ClassAcc {
      id: string;
      code: string;
      nameTr: string;
      level: number;
      sortOrder: number;
      isMatch: boolean;
      /** En iyi alaka puanı (kendisi ya da altındaki emtia) — sıralama. */
      score: number;
      /** Alt ağaçtaki ad eşleşmelerinin toplam ağırlığı (`relevanceWeight`). */
      weight: number;
      /** Sınıfın KENDİ adının puanı (eşleşmediyse 0). */
      ownScore: number;
      commodities: Map<
        string,
        {
          id: string;
          code: string;
          nameTr: string;
          level: number;
          sortOrder: number;
          isMatch: boolean;
          score: number;
          weight: number;
        }
      >;
    }
    interface FamilyAcc {
      id: string;
      code: string;
      nameTr: string;
      level: number;
      sortOrder: number;
      score: number;
      weight: number;
      classes: Map<string, ClassAcc>;
    }
    interface SegmentAcc {
      id: string;
      code: string;
      nameTr: string;
      level: number;
      segmentLetter: string | null;
      sortOrder: number;
      score: number;
      weight: number;
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
      const rowScore = scoreById.get(cat.id) ?? 0;

      let segAcc = segmentMap.get(segment.id);
      if (!segAcc) {
        segAcc = {
          id: segment.id,
          code: segment.code,
          nameTr: categoryName(segment),
          level: segment.level,
          segmentLetter: segment.segmentLetter,
          sortOrder: segment.sortOrder,
          score: 0,
          weight: 0,
          families: new Map(),
        };
        segmentMap.set(segment.id, segAcc);
      }

      let famAcc = segAcc.families.get(family.id);
      if (!famAcc) {
        famAcc = {
          id: family.id,
          code: family.code,
          nameTr: categoryName(family),
          level: family.level,
          sortOrder: family.sortOrder,
          score: 0,
          weight: 0,
          classes: new Map(),
        };
        segAcc.families.set(family.id, famAcc);
      }
      const rowWeight = relevanceWeight(rowScore);
      segAcc.score = Math.max(segAcc.score, rowScore);
      famAcc.score = Math.max(famAcc.score, rowScore);
      segAcc.weight += rowWeight;
      famAcc.weight += rowWeight;

      let clsAcc = famAcc.classes.get(cls.id);
      if (!clsAcc) {
        clsAcc = {
          id: cls.id,
          code: cls.code,
          nameTr: categoryName(cls),
          level: cls.level,
          sortOrder: cls.sortOrder,
          isMatch: false,
          score: 0,
          weight: 0,
          ownScore: 0,
          commodities: new Map(),
        };
        famAcc.classes.set(cls.id, clsAcc);
      }
      if (cat.level === 3 && cat.id === cls.id) {
        clsAcc.isMatch = true;
        clsAcc.ownScore = rowScore;
      }
      clsAcc.score = Math.max(clsAcc.score, rowScore);
      clsAcc.weight += rowWeight;

      if (commodity) {
        if (!clsAcc.commodities.has(commodity.id)) {
          clsAcc.commodities.set(commodity.id, {
            id: commodity.id,
            code: commodity.code,
            nameTr: categoryName(commodity),
            level: commodity.level,
            sortOrder: commodity.sortOrder,
            isMatch: true,
            score: rowScore,
            weight: rowWeight,
          });
        }
      }
    }

    // Family eşleşmeleri: segment→family bloğu kur, Class çocuklarını ekle
    // (isMatch=false — vurgu yalnız ada eşleşen düğümde kalır).
    for (const fam of famMatches) {
      const segment = fam.parent;
      if (!segment) continue;
      const famScore = scoreOf(fam);
      let segAcc = segmentMap.get(segment.id);
      if (!segAcc) {
        segAcc = {
          id: segment.id,
          code: segment.code,
          nameTr: categoryName(segment),
          level: segment.level,
          segmentLetter: segment.segmentLetter,
          sortOrder: segment.sortOrder,
          score: 0,
          weight: 0,
          families: new Map(),
        };
        segmentMap.set(segment.id, segAcc);
      }
      let famAcc = segAcc.families.get(fam.id);
      if (!famAcc) {
        famAcc = {
          id: fam.id,
          code: fam.code,
          nameTr: categoryName(fam),
          level: fam.level,
          sortOrder: fam.sortOrder,
          score: 0,
          weight: 0,
          classes: new Map(),
        };
        segAcc.families.set(fam.id, famAcc);
      }
      segAcc.score = Math.max(segAcc.score, famScore);
      famAcc.score = Math.max(famAcc.score, famScore);
      segAcc.weight += relevanceWeight(famScore);
      famAcc.weight += relevanceWeight(famScore);
      for (const cls of fam.children) {
        if (!famAcc.classes.has(cls.id)) {
          famAcc.classes.set(cls.id, {
            id: cls.id,
            code: cls.code,
            nameTr: categoryName(cls),
            level: cls.level,
            sortOrder: cls.sortOrder,
            isMatch: false,
            score: 0,
            weight: 0,
            ownScore: 0,
            commodities: new Map(),
          });
        }
      }
    }

    // SIRALAMA (O-022, yeniden doğrulama). Segment ve aile alt ağaçlarındaki
    // ad eşleşmelerinin AĞIRLIĞIYLA dizilir: en iyi tek puan çok sık eşitleniyor
    // ("kablo"da 11 segmentin hepsinde adı "Kablo …" ile başlayan bir satır var)
    // ve eşitlik kod sırasına düşünce Madencilik (20…) Elektrik kablosunun
    // (26…) önüne geçiyordu; "rulman"da tek "Rulman ayırıcı"lı El aletleri
    // segmenti, yalnız eş anlamlıdan gelen kardeşleriyle birlikte, "Rulmanlar
    // ve yataklar" sınıfının önünde kalıyordu. Ağırlık yalnız ADDA geçen
    // satırları sayar (eş anlamlı = 0), dolayısıyla eş anlamlı seli segment
    // öne çekemez; yalnız eş anlamlıdan gelen kardeşler kendi düzeylerinde en
    // sona düşer. Sınıflarda önce sınıfın KENDİ adı ("kablo": "Kablo tesisatı"
    // sınıfı, yüz "… kablosu" emtiası olan "Elektrik kablosu ve aksesuarları"
    // sınıfının altında gömülmesin), sonra ağırlık (onlarca "… vana" emtiası
    // olan "Valflar", tek "Vana kutusu" emtiası olan sınıfın önünde); emtia
    // yaprakları kendi puanıyla. Eşitte katalog sırası.
    const byWeight = <T extends { sortOrder: number; score: number; weight: number }>(
      a: T,
      b: T,
    ) => b.weight - a.weight || b.score - a.score || a.sortOrder - b.sortOrder;
    const byScore = <T extends { sortOrder: number; score: number }>(a: T, b: T) =>
      b.score - a.score || a.sortOrder - b.sortOrder;

    const segments = Array.from(segmentMap.values())
      .sort(byWeight)
      .map((seg) => ({
        id: seg.id,
        code: seg.code,
        nameTr: categoryName(seg),
        level: seg.level,
        segmentLetter: seg.segmentLetter,
        families: Array.from(seg.families.values())
          .sort(byWeight)
          .map((fam) => ({
            id: fam.id,
            code: fam.code,
            nameTr: categoryName(fam),
            level: fam.level,
            classes: Array.from(fam.classes.values())
              .sort((a, b) => b.ownScore - a.ownScore || byWeight(a, b))
              .map((cls) => ({
                id: cls.id,
                code: cls.code,
                nameTr: categoryName(cls),
                level: cls.level,
                isMatch: cls.isMatch,
                commodities: Array.from(cls.commodities.values())
                  .sort(byScore)
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
    return { segments, truncated: poolFull || pool.length > CATEGORY_SEARCH_RESULT_CAP };
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
   */
  async getByIds(ids: string[]) {
    if (ids.length === 0) return [];

    const cats = await this.prisma.category.findMany({
      where: { id: { in: ids } },
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
   */
  async validateIds(
    ids: string[],
    options: number | { minLevel?: number; exactLevel?: number } = {
      minLevel: 3,
    },
  ): Promise<void> {
    if (ids.length === 0) return;

    const opts =
      typeof options === "number" ? { minLevel: options } : options;

    const found = await this.prisma.category.findMany({
      // Gizli segmentin kodu "geçersiz" sayılır — seçicide zaten görünmez.
      where: { id: { in: ids }, isActive: true, ...hiddenCategoryWhere() },
      select: { id: true, level: true },
    });

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
