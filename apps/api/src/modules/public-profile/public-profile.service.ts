import { Prisma } from "@rothern/db";
import { isCategoryCode, tokenizeQuery } from "@rothern/shared";
import {
  PUBLIC_PRODUCT_SELECT,
  toPublicProduct,
  toPublicProductCard,
} from "./dto/public-product.projection";
import { hasPublicProfile } from "../../common/company/public-profile-gate";
import {
  labelAttributes,
  resolveCategoryAttributes,
} from "../../common/company/category-attributes";
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
    // Kapı TEK KAYNAK (`common/company/public-profile-gate.ts`): sitemap ve
    // pazar yeri kartındaki ad bağlantısı AYNI kararı verir. Admin bloğu da
    // buradan geçer — blok yalnız isBlocked set eder, isActive/publicEnabled'a
    // dokunmaz.
    if (!c || !hasPublicProfile({ ...c, tier: c.tier as string })) {
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


  /* ================================================================== */
  /* HERKESE AÇIK ÜRÜNLER (Faz 2)                                        */
  /* ================================================================== */

  /**
   * Firmanın vitrindeki ürünleri.
   *
   * Kapı İKİ katmanlı ve ikisi de gerekli:
   *   1. FİRMA public profil kapısından geçmeli (`hasPublicProfile`) — profil
   *      sayfası yoksa ürün sayfasının bağlı olacağı bir gövde de yok.
   *   2. ÜRÜN yayımlanmış olmalı (`isPublic`) — taslak sızmasın.
   *
   * Firma kapısı kapalıysa 404: "firma var ama ürünleri gizli" demek yerine
   * hiç yokmuş gibi davranmak, opt-in olmayan firmanın varlığını bile
   * duyurmamak demek.
   */
  async listPublicProducts(
    slug: string,
    q?: { q?: string; categoryId?: string; page?: number },
  ) {
    const company = await this.requirePublicCompany(slug);
    const pageSize = 24;
    const page = Math.max(1, q?.page ?? 1);
    const tokens = q?.q ? tokenizeQuery(q.q) : [];

    const where: Prisma.CompanyItemWhereInput = {
      companyId: company.id,
      isPublic: true,
      isActive: true,
      slug: { not: null },
      ...(q?.categoryId && isCategoryCode(q.categoryId)
        ? // Firma içi kategori süzgeci ata zincirini kapsar: "Elektrik"
          // seçen ziyaretçi altındaki yaprakları da görür.
          { categoryId: { startsWith: q.categoryId.replace(/0+$/, "") } }
        : {}),
      ...(tokens.length
        ? { AND: tokens.map((t) => ({ searchText: { contains: t } })) }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.companyItem.count({ where }),
      this.prisma.companyItem.findMany({
        where,
        select: PUBLIC_PRODUCT_SELECT,
        // Tamamlanma skoru yüksek olan önce: eksiksiz ürün vitrinin yüzü.
        orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(toPublicProductCard),
      total,
      page,
      pageSize,
    };
  }

  /** Tekil ürün — firma slug'ı + ürün slug'ı. */
  async getPublicProduct(slug: string, productSlug: string) {
    const company = await this.requirePublicCompany(slug);
    const row = await this.prisma.companyItem.findFirst({
      where: {
        companyId: company.id,
        slug: productSlug,
        isPublic: true,
        isActive: true,
      },
      select: PUBLIC_PRODUCT_SELECT,
    });
    if (!row) throw new NotFoundException("Ürün bulunamadı");
    // Nitelikler ETİKETLENEREK döner: ziyaretçiye ham anahtar
    // ("koruma_sinifi") göstermek bir hata ekranı gibi okunur. Çözümleyici
    // panelle AYNI kaynak — sorulan alanla gösterilen etiket ayrışamaz.
    const attributeDefs = await resolveCategoryAttributes(
      this.prisma,
      row.categoryId,
    );
    return {
      product: {
        ...toPublicProduct(row),
        attributeList: labelAttributes(row.attributes, attributeDefs),
      },
      company: {
        name: company.name,
        slug: company.slug,
        city: company.city,
        country: company.country,
        logoUrl: company.logoUrl,
        industry: company.industry,
        activities: company.activities,
      },
    };
  }

  /**
   * Ürün sitemap'i — YALNIZ dizinlenebilir olanlar.
   * Firma kapısı + ürün yayımı; ikisi de sorguda.
   */
  async productSitemap() {
    const rows = await this.prisma.companyItem.findMany({
      where: {
        isPublic: true,
        isActive: true,
        slug: { not: null },
        company: {
          publicEnabled: true,
          isActive: true,
          isBlocked: false,
          slug: { not: null },
          ...anyPackageWhere(),
        },
      },
      select: {
        slug: true,
        updatedAt: true,
        company: { select: { slug: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 45000,
    });
    return rows
      .filter((r) => r.slug && r.company.slug)
      .map((r) => ({
        companySlug: r.company.slug as string,
        slug: r.slug as string,
        updatedAt: r.updatedAt.toISOString(),
      }));
  }

  /**
   * Public profil kapısından geçen firmayı getirir, geçmiyorsa 404.
   * `getBySlug` ile AYNI kapı (`hasPublicProfile`) — ayrışırsa profili
   * olmayan bir firmanın ürünleri görünür hâle gelirdi.
   */
  private async requirePublicCompany(slug: string) {
    const c = await this.prisma.company.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        country: true,
        logoUrl: true,
        industry: true,
        activities: true,
        publicEnabled: true,
        isActive: true,
        isBlocked: true,
        tier: true,
        membershipEndAt: true,
      },
    });
    if (!c || !hasPublicProfile({ ...c, tier: c.tier as string })) {
      throw new NotFoundException("Profil bulunamadı");
    }
    return c;
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
