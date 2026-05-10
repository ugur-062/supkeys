import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";

/**
 * V2-6 — UNSPSC kategori sistemi servisi.
 * 2 seviye: Segment (level 1) → Family (level 2). Sadece Family
 * "seçilebilir" — Tedarikçi (many) + Tender (single) Family'e bağlanır.
 */
@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tüm aktif kategorileri tree (segment → families) yapısında döner.
   * Frontend kategori seçici accordion kullanır.
   */
  async getTree() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
    });

    const segments = categories.filter((c) => c.level === 1);
    const families = categories.filter((c) => c.level === 2);

    return segments.map((segment) => ({
      id: segment.id,
      code: segment.code,
      nameTr: segment.nameTr,
      nameEn: segment.nameEn,
      level: segment.level,
      segmentLetter: segment.segmentLetter,
      sortOrder: segment.sortOrder,
      children: families
        .filter((f) => f.parentId === segment.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((f) => ({
          id: f.id,
          code: f.code,
          nameTr: f.nameTr,
          nameEn: f.nameEn,
          level: f.level,
          parentId: f.parentId,
          sortOrder: f.sortOrder,
        })),
    }));
  }

  /**
   * Family seviyesinde arama. Min 2 karakter; max 50 sonuç.
   * Breadcrumb formatı: "A. Segment Adı › Family Adı".
   */
  async search(query: string) {
    const q = query?.trim() ?? "";
    if (q.length < 2) return [];

    const matched = await this.prisma.category.findMany({
      where: {
        isActive: true,
        level: 2,
        OR: [
          { nameTr: { contains: q, mode: "insensitive" } },
          { nameEn: { contains: q, mode: "insensitive" } },
        ],
      },
      include: {
        parent: {
          select: { id: true, nameTr: true, segmentLetter: true },
        },
      },
      take: 50,
      orderBy: [{ sortOrder: "asc" }],
    });

    return matched.map((c) => ({
      id: c.id,
      code: c.code,
      nameTr: c.nameTr,
      nameEn: c.nameEn,
      level: c.level,
      parentId: c.parentId,
      breadcrumb: c.parent
        ? `${c.parent.segmentLetter}. ${c.parent.nameTr} › ${c.nameTr}`
        : c.nameTr,
    }));
  }

  /**
   * ID listesi → enriched detay (chip listesi gösterimi için).
   */
  async getByIds(ids: string[]) {
    if (ids.length === 0) return [];

    const cats = await this.prisma.category.findMany({
      where: { id: { in: ids }, isActive: true },
      include: {
        parent: {
          select: { id: true, nameTr: true, segmentLetter: true },
        },
      },
    });

    return cats.map((c) => ({
      id: c.id,
      code: c.code,
      nameTr: c.nameTr,
      level: c.level,
      breadcrumb: c.parent
        ? `${c.parent.segmentLetter}. ${c.parent.nameTr} › ${c.nameTr}`
        : c.nameTr,
    }));
  }

  /**
   * Validation — service-içi kullanım için. ID'ler aktif kategoriye işaret
   * etmeli; `requireLevel` verilirse her ID'nin o level'da olduğu doğrulanır.
   *
   * Tender create → `requireLevel=2` (Family zorunlu).
   * Supplier register → `requireLevel=2` (Family çoklu).
   */
  async validateIds(ids: string[], requireLevel?: number): Promise<void> {
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

    if (requireLevel !== undefined) {
      const wrongLevel = found.filter((c) => c.level !== requireLevel);
      if (wrongLevel.length > 0) {
        throw new BadRequestException(
          `Sadece level ${requireLevel} (Family) kategoriler seçilebilir. Lütfen alt kategori seçin.`,
        );
      }
    }
  }
}
