import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  categoryCatalogWhere,
  foldSearchText,
  tokenizeQuery,
  type CategoryCatalog,
} from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";

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
    const cats = await this.prisma.category.findMany({
      where: { isActive: true, level: { lte: 2 } },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        code: true,
        nameTr: true,
        level: true,
        parentId: true,
        segmentLetter: true,
        sortOrder: true,
      },
    });
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
    const cats = await this.prisma.category.findMany({
      where: { isActive: true, level: 1 },
      orderBy: [{ sortOrder: "asc" }],
      select: {
        id: true,
        code: true,
        nameTr: true,
        level: true,
        parentId: true,
        segmentLetter: true,
        sortOrder: true,
      },
    });
    return this.attachChildCount(cats);
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
    const cats = await this.prisma.category.findMany({
      where: { isActive: true, parentId, ...categoryCatalogWhere(catalog) },
      orderBy: [{ sortOrder: "asc" }],
      select: {
        id: true,
        code: true,
        nameTr: true,
        level: true,
        parentId: true,
        segmentLetter: true,
        sortOrder: true,
      },
    });
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
  }> {
    const q = query?.trim() ?? "";
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
    const tokens = tokenizeQuery(q);
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

    // Katalog süzgeci YALNIZ burada: eşleşenler L3+L4 ve iki katalog yalnız
    // L4'te ayrışıyor. Aşağıdaki `famMatches` (L2 + L3 çocukları) süzülmüyor —
    // o katmanlar iki dışa aktarımda birebir aynı.
    const matched = await this.prisma.category.findMany({
      where: {
        isActive: true,
        level: { in: [3, 4] },
        ...categoryCatalogWhere(catalog),
        ...nameFilter,
      },
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
      take: 200,
      // SINIF (L3) ÖNCE, emtia (L4) sonra — kırpma sırası kritik.
      //
      // Eskiden `level: "desc"` idi (emtia önce). Katalog küçük ve eşanlamlı
      // sözlüğü boşken bu zararsızdı: geniş bir sorgu bile 200'ü zor buluyordu.
      // Katalog 10.991 kategoriye ve sözlük 61k kelimeye çıkınca durum tersine
      // döndü — ölçüm (2026-09-01, canlı): "makine" 92 sınıf + 474 emtia
      // eşleştiriyor ve emtia-önce sıralamada ilk 200'e giren sınıf sayısı
      // SIFIR. Kullanıcı 200 tekil ürün görüyor, gezinebileceği tek bir üst
      // başlık görmüyordu.
      //
      // Sınıf önce gelince gezinilebilir omurga kırpmadan KURTULUYOR; ağaç
      // kurucusu eşleşen emtianın sınıfını zaten (isMatch:false ile) ekliyor,
      // yani yol bilgisi kaybolmuyor.
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
    });

    // Family (L2) adıyla arama da bulsun: eşleşen family'lerin TÜM Class'ları
    // sonuç ağacına eklenir — "Pano ve dağıtım sistemleri" yazan kullanıcı
    // altındaki seçilebilir detayları görür (Class/Commodity adı eşleşmese de).
    const famMatches = await this.prisma.category.findMany({
      where: {
        isActive: true,
        level: 2,
        ...nameFilter,
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
      commodities: Map<
        string,
        {
          id: string;
          code: string;
          nameTr: string;
          level: number;
          sortOrder: number;
          isMatch: boolean;
        }
      >;
    }
    interface FamilyAcc {
      id: string;
      code: string;
      nameTr: string;
      level: number;
      sortOrder: number;
      classes: Map<string, ClassAcc>;
    }
    interface SegmentAcc {
      id: string;
      code: string;
      nameTr: string;
      level: number;
      segmentLetter: string | null;
      sortOrder: number;
      families: Map<string, FamilyAcc>;
    }

    const segmentMap = new Map<string, SegmentAcc>();

    for (const cat of matched) {
      // Tüm match level 3 veya 4. Parent zinciri 4-seviye yukarı çıkar.
      let segment: typeof cat.parent | null = null;
      let family: typeof cat.parent | null = null;
      let cls: typeof cat | typeof cat.parent | null = null;
      let commodity: typeof cat | null = null;

      if (cat.level === 4) {
        commodity = cat;
        cls = cat.parent;
        family = cls?.parent ?? null;
        segment = family?.parent ?? null;
      } else if (cat.level === 3) {
        cls = cat;
        family = (cat as typeof cat & { parent: typeof cat.parent }).parent;
        segment = family?.parent ?? null;
      }

      if (!segment || !family || !cls) continue;

      let segAcc = segmentMap.get(segment.id);
      if (!segAcc) {
        segAcc = {
          id: segment.id,
          code: segment.code,
          nameTr: segment.nameTr,
          level: segment.level,
          segmentLetter: segment.segmentLetter,
          sortOrder: segment.sortOrder,
          families: new Map(),
        };
        segmentMap.set(segment.id, segAcc);
      }

      let famAcc = segAcc.families.get(family.id);
      if (!famAcc) {
        famAcc = {
          id: family.id,
          code: family.code,
          nameTr: family.nameTr,
          level: family.level,
          sortOrder: family.sortOrder,
          classes: new Map(),
        };
        segAcc.families.set(family.id, famAcc);
      }

      let clsAcc = famAcc.classes.get(cls.id);
      if (!clsAcc) {
        clsAcc = {
          id: cls.id,
          code: cls.code,
          nameTr: cls.nameTr,
          level: cls.level,
          sortOrder: cls.sortOrder,
          isMatch: cat.level === 3 && cat.id === cls.id,
          commodities: new Map(),
        };
        famAcc.classes.set(cls.id, clsAcc);
      } else if (cat.level === 3 && cat.id === cls.id) {
        clsAcc.isMatch = true;
      }

      if (commodity) {
        if (!clsAcc.commodities.has(commodity.id)) {
          clsAcc.commodities.set(commodity.id, {
            id: commodity.id,
            code: commodity.code,
            nameTr: commodity.nameTr,
            level: commodity.level,
            sortOrder: commodity.sortOrder,
            isMatch: true,
          });
        }
      }
    }

    // Family eşleşmeleri: segment→family bloğu kur, Class çocuklarını ekle
    // (isMatch=false — vurgu yalnız ada eşleşen düğümde kalır).
    for (const fam of famMatches) {
      const segment = fam.parent;
      if (!segment) continue;
      let segAcc = segmentMap.get(segment.id);
      if (!segAcc) {
        segAcc = {
          id: segment.id,
          code: segment.code,
          nameTr: segment.nameTr,
          level: segment.level,
          segmentLetter: segment.segmentLetter,
          sortOrder: segment.sortOrder,
          families: new Map(),
        };
        segmentMap.set(segment.id, segAcc);
      }
      let famAcc = segAcc.families.get(fam.id);
      if (!famAcc) {
        famAcc = {
          id: fam.id,
          code: fam.code,
          nameTr: fam.nameTr,
          level: fam.level,
          sortOrder: fam.sortOrder,
          classes: new Map(),
        };
        segAcc.families.set(fam.id, famAcc);
      }
      for (const cls of fam.children) {
        if (!famAcc.classes.has(cls.id)) {
          famAcc.classes.set(cls.id, {
            id: cls.id,
            code: cls.code,
            nameTr: cls.nameTr,
            level: cls.level,
            sortOrder: cls.sortOrder,
            isMatch: false,
            commodities: new Map(),
          });
        }
      }
    }

    const sortByOrder = <T extends { sortOrder: number }>(a: T, b: T) =>
      a.sortOrder - b.sortOrder;

    const segments = Array.from(segmentMap.values())
      .sort(sortByOrder)
      .map((seg) => ({
        id: seg.id,
        code: seg.code,
        nameTr: seg.nameTr,
        level: seg.level,
        segmentLetter: seg.segmentLetter,
        families: Array.from(seg.families.values())
          .sort(sortByOrder)
          .map((fam) => ({
            id: fam.id,
            code: fam.code,
            nameTr: fam.nameTr,
            level: fam.level,
            classes: Array.from(fam.classes.values())
              .sort(sortByOrder)
              .map((cls) => ({
                id: cls.id,
                code: cls.code,
                nameTr: cls.nameTr,
                level: cls.level,
                isMatch: cls.isMatch,
                commodities: Array.from(cls.commodities.values())
                  .sort(sortByOrder)
                  .map((com) => ({
                    id: com.id,
                    code: com.code,
                    nameTr: com.nameTr,
                    level: com.level,
                    isMatch: com.isMatch,
                  })),
              })),
          })),
      }));

    // 200 tavanına çarptıysak kullanıcı bilsin — sessiz kırpma yanıltıcı.
    return { segments, truncated: matched.length >= 200 };
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
                    nameTr: true,
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
      nameTr: c.nameTr,
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
      where: { id: { in: ids }, isActive: true },
      select: { id: true, level: true },
    });

    const foundIds = new Set(found.map((c) => c.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Geçersiz kategori ID: ${missing.join(", ")}`,
      );
    }

    if (opts.exactLevel !== undefined) {
      const wrong = found.filter((c) => c.level !== opts.exactLevel);
      if (wrong.length > 0) {
        throw new BadRequestException(
          opts.exactLevel === 1
            ? "Sadece ana başlık (Segment) seviyesindeki kategoriler seçilebilir."
            : `Sadece level ${opts.exactLevel} kategoriler seçilebilir.`,
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
            ? "Sadece Class veya Commodity seviyesindeki kategoriler seçilebilir (Segment/Family seçilemez)."
            : "Ana başlık (Segment) alt kategori olarak seçilemez — bir alt kırılım seçin.",
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
      parts.unshift(`${letter}${cur.nameTr}`);
    } else if (cur.nameTr) {
      parts.unshift(cur.nameTr);
    }
    cur = cur.parent;
  }
  return parts.join(" › ");
}
