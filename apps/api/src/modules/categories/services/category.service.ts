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
@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Level 1 (Segment) kategorilerini getirir — ilk açılış için. */
  async getRoots() {
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
  async getChildren(parentId: string) {
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
   * Validation — ID'ler aktif kategoriye işaret etmeli; `requireMinLevel`
   * verilirse her ID'nin level'ı en az o seviyede olmalı.
   *
   * Tender + Supplier seçimi → requireMinLevel = 3 (Class veya Commodity).
   * Level 1/2 (Segment/Family) sadece accordion grup başlığıdır; seçilemez.
   */
  async validateIds(
    ids: string[],
    requireMinLevel: number = 3,
  ): Promise<void> {
    if (ids.length === 0) return;

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

    const tooHigh = found.filter((c) => c.level < requireMinLevel);
    if (tooHigh.length > 0) {
      throw new BadRequestException(
        `Sadece Class veya Commodity seviyesindeki kategoriler seçilebilir (Segment/Family seçilemez).`,
      );
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
