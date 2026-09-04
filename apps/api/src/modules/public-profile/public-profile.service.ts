import { Prisma } from "@rothern/db";
import { categoryPrefix, isCategoryCode, tokenizeQuery } from "@rothern/shared";
import {
  PUBLIC_PRODUCT_SELECT,
  toPublicProduct,
  toPublicProductCard,
} from "./dto/public-product.projection";
import {
  hasPublicProfile,
  publicProductWhere,
} from "../../common/company/public-profile-gate";
import {
  labelAttributes,
  resolveCategoryAttributes,
} from "../../common/company/category-attributes";
import { looksLikeProse } from "../../common/company/public-text-quality";
import { buildDirectory, directoryFacets, type DirectoryParams } from "../../common/company/company-directory";
import { relatedProducts } from "../../common/company/related-products";
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

  /**
   * HERKESE AÇIK FİRMA PROFİLİ — v2 (2026-09-04, Europages kalıbı, kullanıcı
   * kararı): profil TAMAMEN gezilebilir. Ziyaretçi ad, şehir, faaliyet tipi,
   * kategoriler, logo/kapak/galeri, Hakkında (tam), hizmetler, sertifikalar,
   * kuruluş yılı, çalışan aralığı ve ORTALAMA puanı (tek sayı) görür.
   *
   * ÜYEYE KALAN: Rothern ID, web/sosyal/iletişim, puan DAĞILIMI ve sipariş
   * sayıları, değerlendirme metinleri, açık talep/ilan listesi. Bunlar
   * projeksiyonda YOK — `null` bile değil (anahtar adı RSC yüküne düşer).
   *
   * Test verisi (düzyazı sezgisinden geçmeyen Hakkında) HİÇ dönmez:
   * `common/company/public-text-quality.ts`.
   */
  async getBySlug(slug: string) {
    const c = await this.prisma.company.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        industry: true,
        activities: true,
        city: true,
        country: true,
        logoUrl: true,
        coverImageUrl: true,
        aboutText: true,
        services: true,
        certifications: true,
        certificateImages: true,
        photos: true,
        foundedYear: true,
        employeeCount: true,
        buyerCategoryIds: true,
        sellerCategoryIds: true,
        publicEnabled: true,
        isActive: true,
        isBlocked: true,
        tier: true,
        membershipEndAt: true, // INV-TIER-1: effectiveTier hesabı için (yanıtta sızmaz)
        companyVerificationStatus: true,
        updatedAt: true,
      },
    });
    // Kapı TEK KAYNAK (`common/company/public-profile-gate.ts`): sitemap ve
    // pazar yeri kartındaki ad bağlantısı AYNI kararı verir.
    if (!c || !hasPublicProfile({ ...c, tier: c.tier as string })) {
      throw new NotFoundException("Profil bulunamadı");
    }
    const [categories, reviewRows, productCount] = await Promise.all([
      this.resolveCategoryNames([...c.sellerCategoryIds, ...c.buyerCategoryIds]),
      this.prisma.companyReview.findMany({
        where: { targetCompanyId: c.id },
        select: REVIEW_SUMMARY_SELECT,
        orderBy: { createdAt: "desc" },
        take: REVIEW_SUMMARY_TAKE,
      }),
      this.prisma.companyItem.count({
        where: { ...publicProductWhere(), companyId: c.id },
      }),
    ]);
    const summary = buildReviewSummary(reviewRows, { revealNames: false });
    return {
      name: c.name,
      slug: c.slug,
      industry: c.industry,
      activities: c.activities,
      city: c.city,
      country: c.country,
      logoUrl: c.logoUrl,
      coverImageUrl: c.coverImageUrl,
      photos: c.photos,
      aboutText: looksLikeProse(c.aboutText) ? c.aboutText : null,
      services: c.services,
      certifications: c.certifications,
      certificateImages: c.certificateImages,
      foundedYear: c.foundedYear,
      employeeCount: c.employeeCount,
      categories,
      productCount,
      // Ortalama TEK SAYI; dağılım ve sipariş sayıları üyeye (ticari ilişki
      // haritası). Değerlendirme yoksa null — "0,0" yazmak puan kırar.
      ratingAvg: summary.orders > 0 ? summary.avg : null,
      updatedAt: c.updatedAt,
      // Faz T: "Gold Üye" rozeti (yalnız GOLD; güven iddiası TAŞIMAZ).
      goldMember:
        effectiveTier(c.tier as string, c.membershipEndAt as Date | null) ===
        "GOLD",
      // KYC tamam — "Doğrulanmış" rozeti. Yalnız admin `setVerification`.
      verified: c.companyVerificationStatus === "VERIFIED",
    };
  }

  /** Herkese açık firma dizini — TEK KAYNAK `common/company/company-directory.ts` (panel de okur). */
  async publicDirectory(q: DirectoryParams) {
    const res = await buildDirectory(this.prisma, q);
    // Kimlik alanları public karttan DÜŞER (Rothern ID üyeye).
    return { ...res, items: res.items.map(({ id, rothernId, ...card }) => { void id; void rothernId; return card; }) };
  }

  publicDirectoryFacets() {
    return directoryFacets(this.prisma);
  }

  /** Ürün sayfası ilişkili bloklar — panel ve public aynı fonksiyon. */
  related(companySlug: string, productSlug: string) {
    return relatedProducts(this.prisma, companySlug, productSlug);
  }

  /**
   * Kategori kodlarını L1 segment adına indirger (firma beyanı L1'de;
   * alt kategori beyanları ayrı alanda ve ziyaretçiye basılmaz).
   */
  private async resolveCategoryNames(ids: string[]) {
    const uniq = [...new Set(ids.filter((id) => /^\d{8}$/.test(id)))].slice(
      0,
      12,
    );
    if (uniq.length === 0) return [] as { id: string; name: string }[];
    const rows = await this.prisma.category.findMany({
      where: { id: { in: uniq } },
      select: { id: true, nameTr: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r.nameTr]));
    return uniq
      .filter((id) => byId.has(id))
      .map((id) => ({ id, name: byId.get(id) as string }));
  }

  /**
   * FİRMA DİZİNİ ÖZETİ — anonim ziyaretçiye liste yerine SAYI.
   *
   * Dizin girişli (`company/directory`); ziyaretçi "kimler var" sorusuna
   * kimlik görmeden cevap alır: doğrulanmış firma sayısı + en çok temsil
   * edilen 8 üst kategori. Kapı dizinle aynı küme DEĞİL, bilinçli: sayı
   * platformun tamamını anlatır (profil açmamış doğrulanmış firma da sayılır),
   * kimseyi işaret etmez.
   */
  async directorySummary() {
    const [verifiedCompanies, rows] = await Promise.all([
      this.prisma.company.count({
        where: {
          companyVerificationStatus: "VERIFIED",
          isActive: true,
          isBlocked: false,
        },
      }),
      this.prisma.company.findMany({
        where: { isActive: true, isBlocked: false },
        select: { sellerCategoryIds: true, buyerCategoryIds: true },
        take: 5000,
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    const counts = new Map<string, number>();
    for (const r of rows) {
      const seen = new Set<string>();
      for (const id of [...r.sellerCategoryIds, ...r.buyerCategoryIds]) {
        if (!/^\d{8}$/.test(id)) continue;
        const seg = `${id.slice(0, 2)}000000`;
        if (seen.has(seg)) continue;
        seen.add(seg);
        counts.set(seg, (counts.get(seg) ?? 0) + 1);
      }
    }
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const names = await this.resolveCategoryNames(top.map(([id]) => id));
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    return {
      verifiedCompanies,
      topCategories: top
        .filter(([id]) => nameById.has(id))
        .map(([id, count]) => ({ id, name: nameById.get(id) as string, count })),
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
      ...publicProductWhere(),
      companyId: company.id,
      ...(q?.categoryId && isCategoryCode(q.categoryId)
        ? // Firma içi kategori süzgeci ata zincirini kapsar: "Elektrik"
          // seçen ziyaretçi altındaki yaprakları da görür.
          { categoryId: { startsWith: categoryPrefix(q.categoryId) as string } }
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
        ...publicProductWhere(),
        companyId: company.id,
        slug: productSlug,
      },
      select: PUBLIC_PRODUCT_SELECT,
    });
    if (!row) throw new NotFoundException("Ürün bulunamadı");
    // Nitelikler ETİKETLENEREK döner: ziyaretçiye ham anahtar
    // ("koruma_sinifi") göstermek bir hata ekranı gibi okunur. Çözümleyici
    // panelle AYNI kaynak — sorulan alanla gösterilen etiket ayrışamaz.
    const [attributeDefs, category] = await Promise.all([
      resolveCategoryAttributes(this.prisma, row.categoryId),
      row.categoryId
        ? this.prisma.category.findUnique({
            where: { id: row.categoryId },
            select: { id: true, nameTr: true },
          })
        : null,
    ]);
    return {
      product: {
        ...toPublicProduct(row),
        attributeList: labelAttributes(row.attributes, attributeDefs),
        // Kırıntı için kategori adı (Ana sayfa › Kategori › Firma › Ürün).
        category: category ? { id: category.id, name: category.nameTr } : null,
      },
      company: {
        name: company.name,
        slug: company.slug,
        city: company.city,
        country: company.country,
        logoUrl: company.logoUrl,
        industry: company.industry,
        activities: company.activities,
        verified: company.companyVerificationStatus === "VERIFIED",
      },
    };
  }

  /**
   * Ürün sitemap'i — YALNIZ dizinlenebilir olanlar.
   * Firma kapısı + ürün yayımı; ikisi de sorguda.
   */
  async productSitemap() {
    const rows = await this.prisma.companyItem.findMany({
      where: publicProductWhere(),
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
        companyVerificationStatus: true,
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
