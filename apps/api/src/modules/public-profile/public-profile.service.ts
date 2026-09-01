import { tierAtLeast } from "@rothern/shared";
import {
  REVIEW_SUMMARY_SELECT,
  REVIEW_SUMMARY_TAKE,
  buildReviewSummary,
} from "../company-reviews/review-summary";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import {
  effectiveTier,
  anyPackageWhere,
} from "../../common/company/effective-tier";

/**
 * Herkese açık (auth gerektirmeyen) firma profili. SEO sayfası bunu kullanır.
 * İHALE DÖNDÜRMEZ — ihaleler yalnızca uygulama-içi (giriş yapan) profilde.
 */
@Injectable()
export class PublicProfileService {
  constructor(private readonly prisma: PrismaBypassService) {}

  async getBySlug(slug: string) {
    const c = await this.prisma.company.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        rothernId: true,
        industry: true,
        activities: true,
        city: true,
        country: true,
        logoUrl: true,
        coverImageUrl: true,
        aboutText: true,
        services: true,
        certifications: true,
        photos: true,
        certificateImages: true,
        foundedYear: true,
        employeeCount: true,
        website: true,
        linkedinUrl: true,
        instagramUrl: true,
        publicEnabled: true,
        isActive: true,
        isBlocked: true,
        tier: true,
        membershipEndAt: true, // INV-TIER-1: effectiveTier hesabı için (yanıtta sızmaz)
        updatedAt: true,
      },
    });
    // Admin tarafından bloklanan firma dışarıda (SEO profilinde) görünmez —
    // blok yalnız isBlocked set eder, isActive/publicEnabled'a dokunmaz.
    if (
      !c ||
      !c.isActive ||
      c.isBlocked ||
      !c.publicEnabled ||
      // INV-TIER-1: efektif tier (süresi-dolmuş PAKET SEO profili görünmesin).
      !tierAtLeast(effectiveTier(c.tier, c.membershipEndAt), "BRONZ")
    ) {
      throw new NotFoundException("Profil bulunamadı");
    }
    // 2026-08-22: firma bazında gruplu özet; HERKESE AÇIK uçta değerlendiren
    // adı ASLA (revealNames=false) — "X, Y'den alım yapmış" ticari ilişki
    // haritasıdır; "Doğrulanmış alıcı/tedarikçi" + rol + tarih yeter.
    const reviewRows = await this.prisma.companyReview.findMany({
      where: { targetCompanyId: c.id },
      select: REVIEW_SUMMARY_SELECT,
      orderBy: { createdAt: "desc" },
      take: REVIEW_SUMMARY_TAKE,
    });
    const reviewSummary = buildReviewSummary(reviewRows, { revealNames: false });
    const { id, publicEnabled, isActive, isBlocked, tier, membershipEndAt, ...pub } =
      c;
    void id;
    void publicEnabled;
    void isActive;
    void isBlocked;
    void tier;
    void membershipEndAt; // INV-TIER-1 iç hesap alanı — public yanıtta sızmaz
    return {
      ...pub,
      // Faz T: "Gold Üye" rozeti (yalnız GOLD; güven iddiası TAŞIMAZ —
      // adlandırma bilinçli "Gold Üye").
      goldMember:
        effectiveTier(tier as string, membershipEndAt as Date | null) ===
        "GOLD",
      // rating: geriye uyumlu kısa biçim (firma-ağırlıklı ortalama + sipariş sayısı).
      rating: { avg: reviewSummary.avg, count: reviewSummary.orders },
      reviewSummary,
    };
  }

  /** Sitemap için yayınlanmış public profillerin slug + son güncelleme. */
  async listPublicSlugs() {
    return this.prisma.company.findMany({
      where: {
        publicEnabled: true,
        isActive: true,
        isBlocked: false,
        // INV-TIER-1: efektif PAKET (sitemap'te süresi-dolmuş PAKET olmasın).
        ...anyPackageWhere(),
        slug: { not: null },
      },
      select: { slug: true, updatedAt: true },
      take: 5000,
      orderBy: { updatedAt: "desc" },
    });
  }
}
