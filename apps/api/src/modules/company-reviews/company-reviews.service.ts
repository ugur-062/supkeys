import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CompanyRole } from "@rothern/db";
import { tierAtLeast } from "@rothern/shared";
import { effectiveTier } from "../../common/company/effective-tier";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import {
  REVIEW_SUMMARY_SELECT,
  REVIEW_SUMMARY_TAKE,
  buildReviewSummary,
} from "./review-summary";

@Injectable()
export class CompanyReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tamamlanmış siparişte karşı tarafı puanla — ÇİFT YÖNLÜ: alıcı satıcıyı,
   * satıcı alıcıyı puanlar. Sipariş başına taraf-başına tek (hedef karşı taraf).
   */
  async upsert(
    user: AuthenticatedCompanyUser,
    input: { orderId: string; rating: number; comment?: string; showName?: boolean },
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
    // Rol kapısı (salt-okunur garanti #5) — assertOrderRole deseni: firma
    // adına KALICI itibar beyanını siparişin tarafı olan işlem rolü yazar
    // (alıcı yanı Satın Almacı, satıcı yanı Satışçı). Etiket-only/rolsüz
    // üye yazamaz (Faz R: SAHIP muaf değil).
    const neededRole = isBuyer
      ? CompanyRole.SATIN_ALMACI
      : CompanyRole.SATISCI;
    if (!user.roles.includes(neededRole)) {
      throw new ForbiddenException(
        isBuyer
          ? "Değerlendirme yazmak için Satın Almacı rolü gerekir"
          : "Değerlendirme yazmak için Satışçı rolü gerekir",
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
        // Opt-in referans: varsayılan anonim ("Doğrulanmış alıcı/tedarikçi").
        showName: input.showName === true,
      },
      update: {
        rating: input.rating,
        comment: input.comment?.trim() || null,
        ...(input.showName !== undefined ? { showName: input.showName } : {}),
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
      select: { rating: true, comment: true, showName: true },
    });
    return r ? { rating: r.rating, comment: r.comment, showName: r.showName } : null;
  }

  /**
   * Bir firmaya yapılan değerlendirmelerin ÖZETİ (firma bazında gruplu;
   * platform-içi → opt-in adlar görünür). Profil uçları aynı yardımcıyı kullanır.
   */
  async listForCompany(user: AuthenticatedCompanyUser, companyId: string) {
    // Denetim 2026-08-23 Parça 4: bu uç kapısızdı — ilişkisiz/paketsiz çağıran,
    // profil sayfasında 404 alacağı bir firmanın değerlendirme özetini (opt-in
    // veren ortakların FİRMA ADLARI + yorumlar dahil) okuyabiliyordu. Kapı
    // company-connections.getProfile ile AYNI olmalı: ilişkili VEYA herkese
    // açık dizin kaydı; aksi halde varlığı sızdırmamak için 404.
    if (companyId !== user.companyId) {
      const target = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { tier: true, membershipEndAt: true, publicEnabled: true },
      });
      if (!target) throw new NotFoundException("Firma profili bulunamadı");
      const relation = await this.prisma.companyConnection.count({
        where: {
          OR: [
            { inviterCompanyId: user.companyId, inviteeCompanyId: companyId },
            { inviterCompanyId: companyId, inviteeCompanyId: user.companyId },
          ],
        },
      });
      const publiclyListed =
        tierAtLeast(user.tier, "BRONZ") &&
        tierAtLeast(
          effectiveTier(target.tier, target.membershipEndAt),
          "BRONZ",
        ) &&
        target.publicEnabled;
      if (relation === 0 && !publiclyListed) {
        throw new NotFoundException("Firma profili bulunamadı");
      }
    }
    const rows = await this.prisma.companyReview.findMany({
      where: { targetCompanyId: companyId },
      select: REVIEW_SUMMARY_SELECT,
      orderBy: { createdAt: "desc" },
      take: REVIEW_SUMMARY_TAKE,
    });
    return buildReviewSummary(rows, { revealNames: true });
  }
}
