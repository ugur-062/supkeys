import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { foldSearchText } from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";

/**
 * V2-6 — 4 seviye UNSPSC kategori servisi.
 *   level 1 = Segment   (XX000000)
 *   level 2 = Family    (XXXX0000)
 *   level 3 = Class     (XXXXXX00)
 *   level 4 = Commodity (XXXXXXXX)
 *
 * Lazy loading: frontend ilk açılışta sadece roots (level 1) çeker, expand
 * edildiğinde o parent'ın direkt çocuklarını ister. Tedarikçi ve tender
 * "seçim" katmanları sadece Level 3+4'tür (Class veya Commodity).
 */
// CACHE_TTL_MS — allCategoriesById (P-5) breadcrumb cache TTL. Kategoriler
// statik (V2-7'ye kadar değişmez), 1 saat yeterli; restart cache'i temizler.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

interface CategoryNode {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  parentId: string | null;
  segmentLetter: string | null;
}

@Injectable()
export class CategoryService {
  /**
   * Performans audit P-5 — Tüm aktif kategorileri tek seferde yükleyen index.
   * `tender.list` ve `tender.findOne` her tender × kategori için 4-seviye
   * `parent.parent.parent.parent` include'u atıyordu (her join seviyesi ayrı
   * batched query). UNSPSC tüm subset ~4000 kayıt, ~400KB JS object → tek
   * boot/cache turunda Map'e yüklenirse breadcrumb O(depth) lookup, list
   * endpoint Prisma include'u tek seviyeye düşer.
   */
  private allCategoriesById: Map<string, CategoryNode> | null = null;
  private allCategoriesExpiresAt = 0;
  private readonly logger = new Logger(CategoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tüm aktif kategorileri Map'e yükle (1h cache). Breadcrumb lookup için
   * `parent.parent...` zinciri burada in-memory yürütülür.
   */
  private async loadAllCategories(): Promise<Map<string, CategoryNode>> {
    const now = Date.now();
    if (
      this.allCategoriesById &&
      this.allCategoriesExpiresAt > now
    ) {
      return this.allCategoriesById;
    }
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        nameTr: true,
        level: true,
        parentId: true,
        segmentLetter: true,
      },
    });
    const map = new Map<string, CategoryNode>();
    for (const r of rows) {
      map.set(r.id, r);
    }
    this.allCategoriesById = map;
    this.allCategoriesExpiresAt = now + CACHE_TTL_MS;
    return map;
  }

  /**
   * Verilen ID'ler için breadcrumb string'lerini in-memory map üzerinden
   * O(depth) hesaplar. Aktif olmayan veya bulunamayan ID için map'te entry yok.
   */
  async getBreadcrumbsByIds(
    ids: string[],
  ): Promise<Map<string, { node: CategoryNode; breadcrumb: string }>> {
    if (ids.length === 0) return new Map();
    const all = await this.loadAllCategories();
    const result = new Map<string, { node: CategoryNode; breadcrumb: string }>();
    for (const id of ids) {
      const node = all.get(id);
      if (!node) continue;
      const parts: string[] = [];
      let cur: CategoryNode | undefined = node;
      while (cur) {
        if (cur.level === 1) {
          const letter = cur.segmentLetter ? `${cur.segmentLetter}. ` : "";
          parts.unshift(`${letter}${cur.nameTr}`);
        } else {
          parts.unshift(cur.nameTr);
        }
        cur = cur.parentId ? all.get(cur.parentId) : undefined;
      }
      result.set(id, { node, breadcrumb: parts.join(" › ") });
    }
    return result;
  }

  /**
   * V2-6.5 — Tüm aktif kategoriler (flat). Modal'ın tek seferde tree'nin
   * tamamını çekmesi için. parentId üzerinden client-side traverse yapılır;
   * eski lazy /children endpoint çağrılarına gerek yok.
   */
  /**
   * Payload optimizasyonu — yalnızca L1-L3 (Segment/Family/Class) döner.
   * L4 commodity'ler (toplam yığının ~%80'i) class açılınca `/children` ile
   * lazy çekilir. Her düğüme `childCount` eklenir (L4 sayısı dahil) → frontend
   * commodity'leri yüklemeden "expand var mı" gösterebilir.
   */
  async getAllActive() {
    const cats = await this.prisma.category.findMany({
      where: { isActive: true, level: { lte: 3 } },
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

  /** Bir parent'ın direkt çocukları (L4 commodity lazy-load için). */
  async childrenOf(parentId: string) {
    if (!parentId) return [];
    const cats = await this.prisma.category.findMany({
      where: { isActive: true, parentId },
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

  /** Verilen düğümlere `childCount` (aktif direkt çocuk sayısı) ekler. */
  private async attachChildCount<T extends { id: string }>(
    cats: T[],
  ): Promise<(T & { childCount: number })[]> {
    if (cats.length === 0) return [];
    const counts = await this.prisma.category.groupBy({
      by: ["parentId"],
      where: { isActive: true, parentId: { in: cats.map((c) => c.id) } },
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
  async searchHierarchical(query: string): Promise<{
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
    const folded = foldSearchText(q);
    const nameFilter = {
      OR: [
        { searchText: { contains: folded } },
        { nameTr: { contains: q, mode: "insensitive" as const } },
      ],
    };

    const matched = await this.prisma.category.findMany({
      where: {
        isActive: true,
        level: { in: [3, 4] },
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
      orderBy: [{ level: "desc" }, { sortOrder: "asc" }],
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
        throw new BadRequestException(
          "Sadece Class veya Commodity seviyesindeki kategoriler seçilebilir (Segment/Family seçilemez).",
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
