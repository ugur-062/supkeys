import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  buildBreadcrumb,
  CategoryService,
} from "../../categories/services/category.service";

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
}
