import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

@Injectable()
export class CompanyReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tamamlanmış siparişte karşı tarafı puanla — ÇİFT YÖNLÜ: alıcı satıcıyı,
   * satıcı alıcıyı puanlar. Sipariş başına taraf-başına tek (hedef karşı taraf).
   */
  async upsert(
    user: AuthenticatedCompanyUser,
    input: { orderId: string; rating: number; comment?: string },
  ) {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new BadRequestException("Puan 1 ile 5 arasında olmalı");
    }
    const order = await this.prisma.companyOrder.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        status: true,
        buyerCompanyId: true,
        sellerCompanyId: true,
      },
    });
    // Alıcı VEYA satıcı puanlayabilir; hedef her zaman karşı taraf (body'den
    // değil siparişten türetilir → spoofing yok).
    const isBuyer = order?.buyerCompanyId === user.companyId;
    const isSeller = order?.sellerCompanyId === user.companyId;
    if (!order || (!isBuyer && !isSeller)) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
    if (order.status !== "COMPLETED") {
      throw new BadRequestException(
        "Yalnızca tamamlanmış siparişler değerlendirilebilir",
      );
    }
    const targetCompanyId = isBuyer
      ? order.sellerCompanyId
      : order.buyerCompanyId;
    await this.prisma.companyReview.upsert({
      where: {
        orderId_reviewerCompanyId: {
          orderId: order.id,
          reviewerCompanyId: user.companyId,
        },
      },
      create: {
        orderId: order.id,
        reviewerCompanyId: user.companyId,
        targetCompanyId,
        rating: input.rating,
        comment: input.comment?.trim() || null,
      },
      update: {
        rating: input.rating,
        comment: input.comment?.trim() || null,
      },
    });
    return { ok: true };
  }

  /** Bir siparişe ait kendi (bu firmanın verdiği) değerlendirme (varsa). */
  async getForOrder(user: AuthenticatedCompanyUser, orderId: string) {
    const r = await this.prisma.companyReview.findUnique({
      where: {
        orderId_reviewerCompanyId: { orderId, reviewerCompanyId: user.companyId },
      },
      select: { rating: true, comment: true },
    });
    return r ? { rating: r.rating, comment: r.comment } : null;
  }

  /** Bir firmaya yapılan değerlendirmeler + ortalama (profil için). */
  async listForCompany(companyId: string) {
    const [reviews, agg] = await Promise.all([
      this.prisma.companyReview.findMany({
        where: { targetCompanyId: companyId },
        include: { reviewer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.companyReview.aggregate({
        where: { targetCompanyId: companyId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);
    return {
      avg: agg._avg.rating ?? 0,
      count: agg._count,
      reviews: reviews.map((r) => ({
        rating: r.rating,
        comment: r.comment,
        reviewer: r.reviewer.name,
        createdAt: r.createdAt,
      })),
    };
  }
}
