import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Herkese açık (auth gerektirmeyen) firma profili. SEO sayfası bunu kullanır.
 * İHALE DÖNDÜRMEZ — ihaleler yalnızca uygulama-içi (giriş yapan) profilde.
 */
@Injectable()
export class PublicProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getBySlug(slug: string) {
    const c = await this.prisma.company.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        rothernId: true,
        industry: true,
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
      c.tier !== "PAKET"
    ) {
      throw new NotFoundException("Profil bulunamadı");
    }
    const ratingAgg = await this.prisma.companyReview.aggregate({
      where: { targetCompanyId: c.id },
      _avg: { rating: true },
      _count: true,
    });
    const { id, publicEnabled, isActive, isBlocked, tier, ...pub } = c;
    void id;
    void publicEnabled;
    void isActive;
    void isBlocked;
    void tier;
    return {
      ...pub,
      rating: { avg: ratingAgg._avg.rating ?? 0, count: ratingAgg._count },
    };
  }

  /** Sitemap için yayınlanmış public profillerin slug + son güncelleme. */
  async listPublicSlugs() {
    return this.prisma.company.findMany({
      where: {
        publicEnabled: true,
        isActive: true,
        isBlocked: false,
        tier: "PAKET",
        slug: { not: null },
      },
      select: { slug: true, updatedAt: true },
      take: 5000,
      orderBy: { updatedAt: "desc" },
    });
  }
}
