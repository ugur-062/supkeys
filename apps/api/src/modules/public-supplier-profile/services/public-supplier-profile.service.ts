import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";

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
  aboutText: string | null;
  services: string[];
  categories: { id: string; nameTr: string }[];
  photos: { id: string; url: string; caption: string | null }[];
  /** "X yıldır Supkeys üyesi" gibi etiket için. */
  memberSinceIso: string;
}

@Injectable()
export class PublicSupplierProfileService {
  constructor(private readonly prisma: PrismaService) {}

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
      coverImageUrl: supplier.coverImageUrl,
      aboutText: supplier.aboutText,
      services: supplier.services,
      categories: supplier.categories.map((sc) => ({
        id: sc.category.id,
        nameTr: sc.category.nameTr,
      })),
      photos: supplier.photos,
      memberSinceIso: supplier.createdAt.toISOString(),
    };
  }
}
