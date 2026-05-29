import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  buildBreadcrumb,
  CategoryService,
} from "../../categories/services/category.service";
import type { UpdatePublicProfileDto } from "../dto/update-public-profile.dto";

const CATEGORY_PARENT_CHAIN_INCLUDE = {
  parent: {
    include: {
      parent: {
        include: {
          parent: {
            select: { id: true, nameTr: true, segmentLetter: true, level: true },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class SupplierProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoryService: CategoryService,
  ) {}

  async getCategories(supplierUserId: string) {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { supplierId: true },
    });
    if (!user) throw new NotFoundException("Tedarikçi kullanıcı bulunamadı");

    const rows = await this.prisma.supplierCategory.findMany({
      where: { supplierId: user.supplierId },
      include: {
        category: { include: CATEGORY_PARENT_CHAIN_INCLUDE },
      },
    });

    return rows.map((sc) => ({
      id: sc.category.id,
      code: sc.category.code,
      nameTr: sc.category.nameTr,
      level: sc.category.level,
      breadcrumb: buildBreadcrumb(sc.category),
    }));
  }

  async updateCategories(supplierUserId: string, categoryIds: string[]) {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { supplierId: true },
    });
    if (!user) throw new NotFoundException("Tedarikçi kullanıcı bulunamadı");

    // Tedarikçi SADECE ana başlık (Segment level 1) seçer — wrong-level / missing → 400/404.
    await this.categoryService.validateIds(categoryIds, { exactLevel: 1 });

    // Replace-all: tek transactionda eski satırları temizle + yenilerini yaz.
    await this.prisma.$transaction([
      this.prisma.supplierCategory.deleteMany({
        where: { supplierId: user.supplierId },
      }),
      this.prisma.supplierCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          supplierId: user.supplierId,
          categoryId,
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.getCategories(supplierUserId);
  }

  // ============================================================
  // V2-PUBLIC-PROFILE — Tedarikçi public profili (PREMIUM)
  // ============================================================

  /**
   * Editör için: tedarikçinin mevcut public profil alanlarını + isPremium
   * + PREMIUM olmadığında upgrade'e yönlendirme için ipucu döner.
   */
  async getPublicProfile(supplierUserId: string) {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { supplierId: true },
    });
    if (!user) throw new NotFoundException("Tedarikçi kullanıcı bulunamadı");

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: user.supplierId },
      select: {
        slug: true,
        publicEnabled: true,
        coverImageUrl: true,
        aboutText: true,
        services: true,
        website: true,
        linkedinUrl: true,
        instagramUrl: true,
        membership: true,
        companyName: true,
      },
    });
    if (!supplier) throw new NotFoundException("Tedarikçi bulunamadı");

    return {
      slug: supplier.slug,
      publicEnabled: supplier.publicEnabled,
      coverImageUrl: supplier.coverImageUrl,
      aboutText: supplier.aboutText,
      services: supplier.services,
      website: supplier.website,
      linkedinUrl: supplier.linkedinUrl,
      instagramUrl: supplier.instagramUrl,
      companyName: supplier.companyName,
      isPremium: supplier.membership === "PREMIUM",
    };
  }

  /**
   * Public profil güncelleme. Sadece PREMIUM tedarikçiler için izinli; aksi 403.
   * Slug çakışırsa 409. Boş slug ("") → null (public profil kapanır).
   */
  async updatePublicProfile(
    supplierUserId: string,
    dto: UpdatePublicProfileDto,
  ) {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { supplierId: true },
    });
    if (!user) throw new NotFoundException("Tedarikçi kullanıcı bulunamadı");

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: user.supplierId },
      select: { id: true, membership: true },
    });
    if (!supplier) throw new NotFoundException("Tedarikçi bulunamadı");

    if (supplier.membership !== "PREMIUM") {
      throw new ForbiddenException(
        "Public profil özelliği PREMIUM üyelere özeldir",
      );
    }

    // Slug değişiyorsa: format zaten DTO'da doğrulandı; çakışma kontrolü
    // (kendi slug'ı hariç). Boş string → null (slug kaldırılır).
    const data: Record<string, unknown> = {};
    if (dto.slug !== undefined) {
      const newSlug = dto.slug.trim();
      if (newSlug === "") {
        data.slug = null;
      } else {
        const existing = await this.prisma.supplier.findUnique({
          where: { slug: newSlug },
          select: { id: true },
        });
        if (existing && existing.id !== supplier.id) {
          throw new ConflictException(
            "Bu slug başka bir tedarikçi tarafından kullanılıyor",
          );
        }
        data.slug = newSlug;
      }
    }
    if (dto.publicEnabled !== undefined) data.publicEnabled = dto.publicEnabled;
    if (dto.aboutText !== undefined) {
      const trimmed = dto.aboutText.trim();
      data.aboutText = trimmed === "" ? null : trimmed;
    }
    if (dto.services !== undefined) {
      // Boş string'leri ele, trim, max 20 öğe (DTO'da zaten ArrayMaxSize)
      data.services = dto.services
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    if (dto.website !== undefined) {
      data.website = dto.website.trim() === "" ? null : dto.website;
    }
    if (dto.linkedinUrl !== undefined) {
      data.linkedinUrl =
        dto.linkedinUrl.trim() === "" ? null : dto.linkedinUrl;
    }
    if (dto.instagramUrl !== undefined) {
      data.instagramUrl =
        dto.instagramUrl.trim() === "" ? null : dto.instagramUrl;
    }

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data,
    });

    return this.getPublicProfile(supplierUserId);
  }
}
