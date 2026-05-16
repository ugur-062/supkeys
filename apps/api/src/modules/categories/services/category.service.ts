import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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

  /** Level 1 (Segment) kategorilerini getirir — ilk açılış için. */
  async getRoots(): Promise<unknown> {
    return this.prisma.category.findMany({
      where: { level: 1, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        nameTr: true,
        level: true,
        segmentLetter: true,
        sortOrder: true,
        _count: { select: { children: true } },
      },
    });
  }

  /** Bir parent'ın direkt çocukları — lazy expand. */
  async getChildren(parentId: string): Promise<unknown> {
    return this.prisma.category.findMany({
      where: { parentId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        nameTr: true,
        level: true,
        parentId: true,
        sortOrder: true,
        _count: { select: { children: true } },
      },
    });
  }

  /**
   * Search — sadece Level 3+4 (Class + Commodity) döner, 4 seviye breadcrumb ile.
   * Min 2 karakter. Top 100.
   */
  async search(query: string) {
    const q = query?.trim() ?? "";
    if (q.length < 2) return [];

    const matched = await this.prisma.category.findMany({
      where: {
        isActive: true,
        level: { in: [3, 4] },
        nameTr: { contains: q, mode: "insensitive" },
      },
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
      take: 100,
      orderBy: [{ level: "desc" }, { sortOrder: "asc" }],
    });

    return matched.map((c) => ({
      id: c.id,
      code: c.code,
      nameTr: c.nameTr,
      level: c.level,
      parentId: c.parentId,
      breadcrumb: buildBreadcrumb(c),
    }));
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
  }> {
    const q = query?.trim() ?? "";
    if (q.length < 2) return { segments: [] };

    const matched = await this.prisma.category.findMany({
      where: {
        isActive: true,
        level: { in: [3, 4] },
        nameTr: { contains: q, mode: "insensitive" },
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

    if (matched.length === 0) return { segments: [] };

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

    return { segments };
  }

  /** Belirli ID'lerin breadcrumb bilgisi (chip listesi için). */
  async getByIds(ids: string[]) {
    if (ids.length === 0) return [];

    const cats = await this.prisma.category.findMany({
      where: { id: { in: ids }, isActive: true },
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
