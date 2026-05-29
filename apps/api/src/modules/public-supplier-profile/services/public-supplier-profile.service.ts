import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";

export interface PublicSupplierReview {
  id: string;
  rating: number;
  reviewText: string | null;
  /** B2B normu — değerlendiren alıcı firmanın adı. */
  reviewerName: string;
  createdAt: string;
}

export interface PublicSupplierProfileResponse {
  slug: string;
  companyName: string;
  companyType: string;
  industry: string | null;
  city: string;
  district: string;
  website: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  coverImageUrl: string | null;
  /** V2-PUBLIC-PROFILE — Logo (profil resmi). Hero avatar yerine. */
  logoImageUrl: string | null;
  aboutText: string | null;
  services: string[];
  categories: { id: string; nameTr: string }[];
  photos: { id: string; url: string; caption: string | null }[];
  /** "X yıldır Supkeys üyesi" gibi etiket için. */
  memberSinceIso: string;
  /** V2-PUBLIC-PROFILE-DETAILS — Detaylı alanlar. */
  foundedYear: number | null;
  employeeCount: string | null;
  certifications: string[];
  /** V2-TRUST — Tescil ve doğrulama. Şahıs işletmesi için tax/mersis hep null. */
  taxNumber: string | null;
  taxOffice: string | null;
  mersisNo: string | null;
  /** En az bir trust signal public olarak gösteriliyor mu (hero "Doğrulanmış" rozeti için). */
  verifiedBusiness: boolean;
  /** V2-REVIEWS — Toplam istatistikler (tüm review'ları sayar, public ya da değil). */
  rating: {
    average: number | null;
    count: number;
    /** 1-5 yıldız bazında kaç değerlendirme var (anahtarlar "1"-"5"). */
    distribution: Record<string, number>;
  };
  /** V2-REVIEWS — Son 10 herkese açık yorum (en yeni → en eski). */
  reviews: PublicSupplierReview[];
}

@Injectable()
export class PublicSupplierProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Slug ile herkese açık tedarikçi profilini döner.
   *
   * Görünür olma koşulları (hepsi sağlanmalı):
   *  - slug atanmış (PREMIUM upgrade akışında veya editörde set edilir)
   *  - membership === PREMIUM
   *  - publicEnabled === true (default true; editörden kapatılabilir)
   *  - isActive === true
   *  - isBlocked === false
   *
   * Aksi: 404 (hangi koşul ihlal edildiği sızdırılmaz).
   */
  async getBySlug(slug: string): Promise<PublicSupplierProfileResponse> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { slug },
      include: {
        categories: {
          include: {
            category: {
              select: { id: true, nameTr: true },
            },
          },
        },
        photos: {
          orderBy: { orderIndex: "asc" },
          select: { id: true, url: true, caption: true },
        },
      },
    });

    if (
      !supplier ||
      supplier.membership !== "PREMIUM" ||
      !supplier.publicEnabled ||
      !supplier.isActive ||
      supplier.isBlocked
    ) {
      throw new NotFoundException("Profil bulunamadı");
    }

    // Cover/logo/galeri URL + rating aggregate + son yorumlar paralel
    const [
      coverImageUrl,
      logoImageUrl,
      photoUrls,
      aggregate,
      distribution,
      reviewsRaw,
    ] = await Promise.all([
      this.storage.resolveImageUrl(supplier.coverImageUrl),
      this.storage.resolveImageUrl(supplier.logoImageUrl),
      Promise.all(
        supplier.photos.map((p) => this.storage.resolveImageUrl(p.url)),
      ),
        this.prisma.supplierReview.aggregate({
          where: { supplierId: supplier.id },
          _avg: { rating: true },
          _count: { _all: true },
        }),
        this.prisma.supplierReview.groupBy({
          by: ["rating"],
          where: { supplierId: supplier.id },
          _count: { _all: true },
        }),
        this.prisma.supplierReview.findMany({
          where: { supplierId: supplier.id, isPublic: true },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            rating: true,
            reviewText: true,
            createdAt: true,
            tenant: { select: { name: true } },
          },
        }),
      ]);

    const ratingDist: Record<string, number> = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0,
    };
    for (const row of distribution) {
      ratingDist[String(row.rating)] = row._count._all;
    }

    return {
      slug: supplier.slug!,
      companyName: supplier.companyName,
      companyType: supplier.companyType,
      industry: supplier.industry,
      city: supplier.city,
      district: supplier.district,
      website: supplier.website,
      linkedinUrl: supplier.linkedinUrl,
      instagramUrl: supplier.instagramUrl,
      coverImageUrl,
      logoImageUrl,
      aboutText: supplier.aboutText,
      services: supplier.services,
      categories: supplier.categories.map((sc) => ({
        id: sc.category.id,
        nameTr: sc.category.nameTr,
      })),
      photos: supplier.photos.map((p, i) => ({
        id: p.id,
        url: photoUrls[i] ?? "",
        caption: p.caption,
      })),
      memberSinceIso: supplier.createdAt.toISOString(),
      foundedYear: supplier.foundedYear,
      employeeCount: supplier.employeeCount,
      certifications: supplier.certifications,
      // V2-TRUST — KVKK filter: SOLE_PROPRIETOR'da vergi/MERSİS hep null
      ...(() => {
        const isSoleProp = supplier.companyType === "SOLE_PROPRIETOR";
        const showTax = supplier.publicShowTaxInfo && !isSoleProp;
        const showMersis = supplier.publicShowMersis && !isSoleProp;
        return {
          taxNumber: showTax ? supplier.taxNumber : null,
          taxOffice: showTax ? supplier.taxOffice : null,
          mersisNo: showMersis ? supplier.mersisNo : null,
          verifiedBusiness: showTax || showMersis,
        };
      })(),
      rating: {
        average: aggregate._avg.rating
          ? Number(aggregate._avg.rating.toFixed(2))
          : null,
        count: aggregate._count._all,
        distribution: ratingDist,
      },
      reviews: reviewsRaw.map((r) => ({
        id: r.id,
        rating: r.rating,
        reviewText: r.reviewText,
        reviewerName: r.tenant.name,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /**
   * V2-SEO — Tüm görünür (PREMIUM + publicEnabled + slug + aktif) tedarikçileri
   * sitemap için döner. updatedAt: profile change → sitemap revalidate sinyali.
   */
  async listForSitemap(): Promise<{ slug: string; updatedAt: string }[]> {
    const rows = await this.prisma.supplier.findMany({
      where: {
        slug: { not: null },
        membership: "PREMIUM",
        publicEnabled: true,
        isActive: true,
        isBlocked: false,
      },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
      slug: r.slug!,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}
