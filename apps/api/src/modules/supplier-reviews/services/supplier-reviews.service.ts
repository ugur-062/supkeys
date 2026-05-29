import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { UpsertSupplierReviewDto } from "../dto/upsert-supplier-review.dto";

const EDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

/**
 * V2-REVIEWS — Buyer (tenant) tarafı supplier review CRUD.
 *
 * Kurallar:
 *  - Sadece kendi tenant'ının COMPLETED siparişi değerlendirilebilir
 *  - 1 sipariş → 1 review (orderId @unique)
 *  - Düzenleme penceresi: updatedAt'tan 30 gün
 *  - rating 1-5 (DTO seviyesinde doğrulandı)
 */
@Injectable()
export class SupplierReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Alıcı kendi siparişine ait review'unu okur + canReview / canEdit flag'leri.
   * Order başka tenant'a aitse 404 (yetki sızdırılmaz).
   */
  async getOwnReview(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, tenantId: true, status: true, supplierId: true },
    });
    if (!order || order.tenantId !== tenantId) {
      throw new NotFoundException("Sipariş bulunamadı");
    }

    const review = await this.prisma.supplierReview.findUnique({
      where: { orderId },
      select: {
        id: true,
        rating: true,
        reviewText: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      review,
      canReview: order.status === "COMPLETED",
      canEdit: review ? this.isWithinEditWindow(review.updatedAt) : false,
    };
  }

  /** Idempotent upsert: order'a review yoksa create, varsa (window içinde) update. */
  async upsertReview(
    tenantId: string,
    userId: string,
    orderId: string,
    dto: UpsertSupplierReviewDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, tenantId: true, status: true, supplierId: true },
    });
    if (!order || order.tenantId !== tenantId) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
    if (order.status !== "COMPLETED") {
      throw new ForbiddenException(
        "Sadece tamamlanan siparişler değerlendirilebilir",
      );
    }

    const existing = await this.prisma.supplierReview.findUnique({
      where: { orderId },
      select: { id: true, updatedAt: true, isPublic: true },
    });

    if (existing) {
      if (!this.isWithinEditWindow(existing.updatedAt)) {
        throw new ForbiddenException(
          "30 günlük düzenleme süresi geçti",
        );
      }
      return this.prisma.supplierReview.update({
        where: { orderId },
        data: {
          rating: dto.rating,
          reviewText: dto.reviewText?.trim() || null,
          isPublic: dto.isPublic ?? existing.isPublic,
        },
      });
    }

    return this.prisma.supplierReview.create({
      data: {
        supplierId: order.supplierId,
        orderId,
        tenantId,
        createdById: userId,
        rating: dto.rating,
        reviewText: dto.reviewText?.trim() || null,
        isPublic: dto.isPublic ?? true,
      },
    });
  }

  async deleteReview(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, tenantId: true },
    });
    if (!order || order.tenantId !== tenantId) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
    const existing = await this.prisma.supplierReview.findUnique({
      where: { orderId },
      select: { id: true, updatedAt: true },
    });
    if (!existing) return { deleted: false };
    if (!this.isWithinEditWindow(existing.updatedAt)) {
      throw new ForbiddenException("30 günlük düzenleme süresi geçti");
    }
    await this.prisma.supplierReview.delete({ where: { orderId } });
    return { deleted: true };
  }

  private isWithinEditWindow(updatedAt: Date): boolean {
    return Date.now() - updatedAt.getTime() < EDIT_WINDOW_MS;
  }
}
