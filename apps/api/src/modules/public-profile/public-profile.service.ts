import { tierAtLeast, tokenizeQuery } from "@rothern/shared";
import type { CompanyActivity, Prisma } from "@rothern/db";
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

  /**
   * FİRMA DİZİNİ — giriş yapmamış ziyaretçiye açık firma listesi.
   *
   * Kapı `getBySlug` ile AYNI (publicEnabled ∧ isActive ∧ !isBlocked ∧ efektif
   * BRONZ+): dizinde görünen her satırın tıklanabilir bir profil sayfası
   * OLMAK ZORUNDA. Kapıyı gevşetip daha kalabalık bir dizin üretmek, 404'e
   * giden bağlantılarla dolu bir sayfa üretirdi.
   *
   * Kategori süzgeci alıcı VE satıcı eksenlerinin ikisine birden bakar
   * (`hasSome`) — firma "hangi alandayım" beyanını iki ayrı alanda tutuyor ve
   * ziyaretçi bu ayrımı bilmez.
   */
  async listPublic(q: {
    q?: string;
    city?: string;
    category?: string;
    activity?: string;
    page?: number;
  }) {
    const pageSize = 24;
    const page = Math.max(1, q.page ?? 1);
    const tokens = q.q ? tokenizeQuery(q.q) : [];
    const where: Prisma.CompanyWhereInput = {
      publicEnabled: true,
      isActive: true,
      isBlocked: false,
      slug: { not: null },
      ...anyPackageWhere(),
      ...(q.city ? { city: q.city } : {}),
      ...(q.activity
        ? { activities: { has: q.activity as CompanyActivity } }
        : {}),
      ...(q.category
        ? {
            OR: [
              { buyerCategoryIds: { has: q.category } },
              { buyerSubCategoryIds: { has: q.category } },
              { sellerCategoryIds: { has: q.category } },
              { sellerSubCategoryIds: { has: q.category } },
            ],
          }
        : {}),
      ...(tokens.length
        ? {
            AND: tokens.map((t) => ({
              OR: [
                { name: { contains: t, mode: "insensitive" as const } },
                { industry: { contains: t, mode: "insensitive" as const } },
                { aboutText: { contains: t, mode: "insensitive" as const } },
                { services: { has: t } },
              ],
            })),
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        select: {
          name: true,
          slug: true,
          city: true,
          country: true,
          industry: true,
          activities: true,
          logoUrl: true,
          aboutText: true,
          services: true,
          foundedYear: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((c) => ({
        ...c,
        // Kart özeti — tam metin profil sayfasında.
        aboutText: c.aboutText
          ? c.aboutText.replace(/\s+/g, " ").trim().slice(0, 200)
          : null,
        updatedAt: c.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Dizin süzgeçleri: şehir ve faaliyet sayaçları (kapıdan geçenler). */
  async directoryFacets() {
    const rows = await this.prisma.company.findMany({
      where: {
        publicEnabled: true,
        isActive: true,
        isBlocked: false,
        slug: { not: null },
        ...anyPackageWhere(),
      },
      select: { city: true, activities: true },
      take: 5000,
    });
    const cities = new Map<string, number>();
    const activities = new Map<string, number>();
    for (const r of rows) {
      const city = r.city?.trim();
      if (city) cities.set(city, (cities.get(city) ?? 0) + 1);
      for (const a of new Set(r.activities)) {
        activities.set(a, (activities.get(a) ?? 0) + 1);
      }
    }
    return {
      cities: [...cities.entries()]
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr")),
      activities: [...activities.entries()]
        .map(([activity, count]) => ({ activity, count }))
        .sort((a, b) => b.count - a.count),
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
