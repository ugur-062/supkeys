import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  buildBreadcrumb,
  CategoryService,
} from "../../categories/services/category.service";
import { StorageService } from "../../storage/storage.service";
import type {
  AddProfilePhotoDto,
  FinalizeCoverDto,
  RequestProfileUploadDto,
} from "../dto/request-profile-upload.dto";
import type { UpdateCompanyInfoDto } from "../dto/update-company-info.dto";
import type { UpdatePublicProfileDto } from "../dto/update-public-profile.dto";

const CATEGORY_PARENT_CHAIN_INCLUDE = {
  parent: {
    include: {
      parent: {
        include: {
          parent: {
            select: { id: true, nameTr: true, segmentLetter: true, level: true },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class SupplierProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoryService: CategoryService,
    private readonly storage: StorageService,
  ) {}

  async getCategories(supplierUserId: string) {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { supplierId: true },
    });
    if (!user) throw new NotFoundException("Tedarikçi kullanıcı bulunamadı");

    const rows = await this.prisma.supplierCategory.findMany({
      where: { supplierId: user.supplierId },
      include: {
        category: { include: CATEGORY_PARENT_CHAIN_INCLUDE },
      },
    });

    return rows.map((sc) => ({
      id: sc.category.id,
      code: sc.category.code,
      nameTr: sc.category.nameTr,
      level: sc.category.level,
      breadcrumb: buildBreadcrumb(sc.category),
    }));
  }

  async updateCategories(supplierUserId: string, categoryIds: string[]) {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { supplierId: true },
    });
    if (!user) throw new NotFoundException("Tedarikçi kullanıcı bulunamadı");

    // Tedarikçi SADECE ana başlık (Segment level 1) seçer — wrong-level / missing → 400/404.
    await this.categoryService.validateIds(categoryIds, { exactLevel: 1 });

    // Replace-all: tek transactionda eski satırları temizle + yenilerini yaz.
    await this.prisma.$transaction([
      this.prisma.supplierCategory.deleteMany({
        where: { supplierId: user.supplierId },
      }),
      this.prisma.supplierCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          supplierId: user.supplierId,
          categoryId,
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.getCategories(supplierUserId);
  }

  // ============================================================
  // Çekirdek firma bilgisi (iletişim/adres) — self-servis düzenleme
  // ============================================================

  /**
   * Tedarikçinin iletişim/adres bilgilerini günceller. Yasal kimlik alanları
   * (ünvan, firma tipi, vergi no, vergi dairesi) bilinçli olarak değiştirilemez.
   * Dönüş: login/me ile aynı SupplierProfile şekli (store senkronu için).
   */
  async updateCompanyInfo(supplierUserId: string, dto: UpdateCompanyInfoDto) {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { supplierId: true },
    });
    if (!user) throw new NotFoundException("Tedarikçi kullanıcı bulunamadı");

    const data: Prisma.SupplierUpdateInput = {};
    if (dto.industry !== undefined) data.industry = dto.industry.trim() || null;
    if (dto.website !== undefined) data.website = dto.website?.trim() || null;
    if (dto.city !== undefined) data.city = dto.city.trim();
    if (dto.district !== undefined) data.district = dto.district.trim();
    if (dto.addressLine !== undefined)
      data.addressLine = dto.addressLine.trim();
    if (dto.postalCode !== undefined)
      data.postalCode = dto.postalCode.trim() || null;

    return this.prisma.supplier.update({
      where: { id: user.supplierId },
      data,
      select: {
        id: true,
        companyName: true,
        companyType: true,
        taxNumber: true,
        taxOffice: true,
        industry: true,
        website: true,
        city: true,
        district: true,
        addressLine: true,
        postalCode: true,
        membership: true,
        isActive: true,
        isBlocked: true,
      },
    });
  }

  // ============================================================
  // V2-PUBLIC-PROFILE — Tedarikçi public profili (PREMIUM)
  // ============================================================

  /**
   * Editör için: tedarikçinin mevcut public profil alanlarını + isPremium
   * + PREMIUM olmadığında upgrade'e yönlendirme için ipucu döner.
   */
  async getPublicProfile(supplierUserId: string) {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { supplierId: true },
    });
    if (!user) throw new NotFoundException("Tedarikçi kullanıcı bulunamadı");

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: user.supplierId },
      select: {
        slug: true,
        publicEnabled: true,
        coverImageUrl: true,
        logoImageUrl: true,
        aboutText: true,
        services: true,
        website: true,
        linkedinUrl: true,
        instagramUrl: true,
        membership: true,
        companyName: true,
        companyType: true,
        taxNumber: true,
        taxOffice: true,
        mersisNo: true,
        publicShowTaxInfo: true,
        publicShowMersis: true,
        foundedYear: true,
        employeeCount: true,
        certifications: true,
        photos: {
          orderBy: { orderIndex: "asc" },
          select: { id: true, url: true, caption: true },
        },
      },
    });
    if (!supplier) throw new NotFoundException("Tedarikçi bulunamadı");

    // Cover + logo + photos key → URL (public veya presigned GET)
    const [coverImageUrl, logoImageUrl, photoUrls] = await Promise.all([
      this.storage.resolveImageUrl(supplier.coverImageUrl),
      this.storage.resolveImageUrl(supplier.logoImageUrl),
      Promise.all(
        supplier.photos.map((p) => this.storage.resolveImageUrl(p.url)),
      ),
    ]);

    return {
      slug: supplier.slug,
      publicEnabled: supplier.publicEnabled,
      coverImageUrl,
      logoImageUrl,
      aboutText: supplier.aboutText,
      services: supplier.services,
      website: supplier.website,
      linkedinUrl: supplier.linkedinUrl,
      instagramUrl: supplier.instagramUrl,
      companyName: supplier.companyName,
      foundedYear: supplier.foundedYear,
      employeeCount: supplier.employeeCount,
      certifications: supplier.certifications,
      companyType: supplier.companyType,
      taxNumber: supplier.taxNumber,
      taxOffice: supplier.taxOffice,
      mersisNo: supplier.mersisNo,
      publicShowTaxInfo: supplier.publicShowTaxInfo,
      publicShowMersis: supplier.publicShowMersis,
      photos: supplier.photos.map((p, i) => ({
        id: p.id,
        url: photoUrls[i] ?? "",
        caption: p.caption,
      })),
      isPremium: supplier.membership === "PREMIUM",
    };
  }

  /**
   * Public profil güncelleme. Sadece PREMIUM tedarikçiler için izinli; aksi 403.
   * Slug çakışırsa 409. Boş slug ("") → null (public profil kapanır).
   */
  async updatePublicProfile(
    supplierUserId: string,
    dto: UpdatePublicProfileDto,
  ) {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { supplierId: true },
    });
    if (!user) throw new NotFoundException("Tedarikçi kullanıcı bulunamadı");

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: user.supplierId },
      select: { id: true, membership: true, companyType: true },
    });
    if (!supplier) throw new NotFoundException("Tedarikçi bulunamadı");

    if (supplier.membership !== "PREMIUM") {
      throw new ForbiddenException(
        "Public profil özelliği PREMIUM üyelere özeldir",
      );
    }

    // V2-TRUST KVKK gate: şahıs işletmesinde vergi no = TC kimlik no →
    // herkese açık paylaşılması kişisel veri ihlali. Reddet.
    if (
      (dto.publicShowTaxInfo === true || dto.publicShowMersis === true) &&
      supplier.companyType === "SOLE_PROPRIETOR"
    ) {
      throw new BadRequestException(
        "Şahıs işletmelerinde vergi numarası ve MERSİS herkese açık paylaşılamaz (KVKK)",
      );
    }

    // Slug değişiyorsa: format zaten DTO'da doğrulandı; çakışma kontrolü
    // (kendi slug'ı hariç). Boş string → null (slug kaldırılır).
    const data: Record<string, unknown> = {};
    if (dto.slug !== undefined) {
      const newSlug = dto.slug.trim();
      if (newSlug === "") {
        data.slug = null;
      } else {
        const existing = await this.prisma.supplier.findUnique({
          where: { slug: newSlug },
          select: { id: true },
        });
        if (existing && existing.id !== supplier.id) {
          throw new ConflictException(
            "Bu slug başka bir tedarikçi tarafından kullanılıyor",
          );
        }
        data.slug = newSlug;
      }
    }
    if (dto.publicEnabled !== undefined) data.publicEnabled = dto.publicEnabled;
    if (dto.aboutText !== undefined) {
      const trimmed = dto.aboutText.trim();
      data.aboutText = trimmed === "" ? null : trimmed;
    }
    if (dto.services !== undefined) {
      // Boş string'leri ele, trim, max 20 öğe (DTO'da zaten ArrayMaxSize)
      data.services = dto.services
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    if (dto.website !== undefined) {
      data.website = dto.website.trim() === "" ? null : dto.website;
    }
    if (dto.linkedinUrl !== undefined) {
      data.linkedinUrl =
        dto.linkedinUrl.trim() === "" ? null : dto.linkedinUrl;
    }
    if (dto.instagramUrl !== undefined) {
      data.instagramUrl =
        dto.instagramUrl.trim() === "" ? null : dto.instagramUrl;
    }
    // V2-PUBLIC-PROFILE-DETAILS — kuruluş yılı, çalışan sayısı, sertifikalar
    if (dto.foundedYear !== undefined) {
      data.foundedYear = dto.foundedYear;
    }
    if (dto.employeeCount !== undefined) {
      const trimmed = dto.employeeCount.trim();
      data.employeeCount = trimmed === "" ? null : trimmed;
    }
    if (dto.certifications !== undefined) {
      data.certifications = dto.certifications
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
    }
    // V2-TRUST — MERSİS + opt-in toggle'lar
    if (dto.mersisNo !== undefined) {
      const trimmed = dto.mersisNo.trim();
      data.mersisNo = trimmed === "" ? null : trimmed;
    }
    if (dto.publicShowTaxInfo !== undefined) {
      data.publicShowTaxInfo = dto.publicShowTaxInfo;
    }
    if (dto.publicShowMersis !== undefined) {
      data.publicShowMersis = dto.publicShowMersis;
    }

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data,
    });

    return this.getPublicProfile(supplierUserId);
  }

  // ============================================================
  // V2-PUBLIC-PROFILE — Cover + galeri R2 upload akışı
  // ============================================================

  private async getPremiumSupplier(
    supplierUserId: string,
  ): Promise<{ id: string }> {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { supplierId: true },
    });
    if (!user) throw new NotFoundException("Tedarikçi kullanıcı bulunamadı");
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: user.supplierId },
      select: { id: true, membership: true },
    });
    if (!supplier) throw new NotFoundException("Tedarikçi bulunamadı");
    if (supplier.membership !== "PREMIUM") {
      throw new ForbiddenException(
        "Public profil özelliği PREMIUM üyelere özeldir",
      );
    }
    return { id: supplier.id };
  }

  /**
   * Güvenlik: client'tan gelen key, request eden supplier'a ait olmalı.
   * Aksi: forbidden (başka supplier'ın slot'una upload edilemez).
   */
  private assertKeyBelongsToSupplier(
    key: string,
    supplierId: string,
    kind: "cover" | "photo" | "logo",
  ): void {
    const expected = `/supplier-profile/${supplierId}/${kind}-`;
    if (!key.includes(expected)) {
      throw new ForbiddenException("Bu key size ait değil");
    }
  }

  /** Cover için presigned PUT URL üretir. */
  async requestCoverUpload(
    supplierUserId: string,
    dto: RequestProfileUploadDto,
  ) {
    const supplier = await this.getPremiumSupplier(supplierUserId);
    const id = randomUUID();
    const key = this.storage.buildSupplierProfileKey(
      supplier.id,
      "cover",
      id,
      dto.filename,
    );
    const uploadUrl = await this.storage.generatePresignedPut(key, dto.mimeType);
    return { uploadUrl, key };
  }

  /**
   * Cover finalize: R2'da var mı kontrol et, eski cover'ı R2'dan sil
   * (DB'de daha güncel coverImageUrl tutulurdu), supplier.coverImageUrl = key.
   */
  async finalizeCover(supplierUserId: string, dto: FinalizeCoverDto) {
    const supplier = await this.getPremiumSupplier(supplierUserId);
    this.assertKeyBelongsToSupplier(dto.key, supplier.id, "cover");

    const check = await this.storage.checkExists(dto.key);
    if (!check.exists) {
      throw new BadRequestException(
        "Yüklenmiş dosya bulunamadı — önce R2'ya PUT atın",
      );
    }

    const old = await this.prisma.supplier.findUnique({
      where: { id: supplier.id },
      select: { coverImageUrl: true },
    });
    if (old?.coverImageUrl && old.coverImageUrl !== dto.key) {
      // Eski kapağı R2'dan sil — hata yutulur (idempotent)
      await this.storage.deleteObject(old.coverImageUrl).catch(() => undefined);
    }

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { coverImageUrl: dto.key },
    });

    return this.getPublicProfile(supplierUserId);
  }

  async removeCover(supplierUserId: string) {
    const supplier = await this.getPremiumSupplier(supplierUserId);
    const current = await this.prisma.supplier.findUnique({
      where: { id: supplier.id },
      select: { coverImageUrl: true },
    });
    if (current?.coverImageUrl) {
      await this.storage
        .deleteObject(current.coverImageUrl)
        .catch(() => undefined);
      await this.prisma.supplier.update({
        where: { id: supplier.id },
        data: { coverImageUrl: null },
      });
    }
    return this.getPublicProfile(supplierUserId);
  }

  /** Logo (profil resmi) için presigned PUT URL üretir. */
  async requestLogoUpload(
    supplierUserId: string,
    dto: RequestProfileUploadDto,
  ) {
    const supplier = await this.getPremiumSupplier(supplierUserId);
    const id = randomUUID();
    const key = this.storage.buildSupplierProfileKey(
      supplier.id,
      "logo",
      id,
      dto.filename,
    );
    const uploadUrl = await this.storage.generatePresignedPut(key, dto.mimeType);
    return { uploadUrl, key };
  }

  /** Logo finalize: cover ile aynı pattern, supplier.logoImageUrl = key. */
  async finalizeLogo(supplierUserId: string, dto: FinalizeCoverDto) {
    const supplier = await this.getPremiumSupplier(supplierUserId);
    this.assertKeyBelongsToSupplier(dto.key, supplier.id, "logo");

    const check = await this.storage.checkExists(dto.key);
    if (!check.exists) {
      throw new BadRequestException(
        "Yüklenmiş dosya bulunamadı — önce R2'ya PUT atın",
      );
    }

    const old = await this.prisma.supplier.findUnique({
      where: { id: supplier.id },
      select: { logoImageUrl: true },
    });
    if (old?.logoImageUrl && old.logoImageUrl !== dto.key) {
      await this.storage.deleteObject(old.logoImageUrl).catch(() => undefined);
    }

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { logoImageUrl: dto.key },
    });

    return this.getPublicProfile(supplierUserId);
  }

  async removeLogo(supplierUserId: string) {
    const supplier = await this.getPremiumSupplier(supplierUserId);
    const current = await this.prisma.supplier.findUnique({
      where: { id: supplier.id },
      select: { logoImageUrl: true },
    });
    if (current?.logoImageUrl) {
      await this.storage
        .deleteObject(current.logoImageUrl)
        .catch(() => undefined);
      await this.prisma.supplier.update({
        where: { id: supplier.id },
        data: { logoImageUrl: null },
      });
    }
    return this.getPublicProfile(supplierUserId);
  }

  /** Galeri foto için presigned PUT URL üretir. */
  async requestPhotoUpload(
    supplierUserId: string,
    dto: RequestProfileUploadDto,
  ) {
    const supplier = await this.getPremiumSupplier(supplierUserId);
    const id = randomUUID();
    const key = this.storage.buildSupplierProfileKey(
      supplier.id,
      "photo",
      id,
      dto.filename,
    );
    const uploadUrl = await this.storage.generatePresignedPut(key, dto.mimeType);
    return { uploadUrl, key };
  }

  /** Galeri foto kaydı oluştur. Max 12 foto/supplier. */
  async addPhoto(supplierUserId: string, dto: AddProfilePhotoDto) {
    const supplier = await this.getPremiumSupplier(supplierUserId);
    this.assertKeyBelongsToSupplier(dto.key, supplier.id, "photo");

    const check = await this.storage.checkExists(dto.key);
    if (!check.exists) {
      throw new BadRequestException(
        "Yüklenmiş dosya bulunamadı — önce R2'ya PUT atın",
      );
    }

    const count = await this.prisma.supplierPhoto.count({
      where: { supplierId: supplier.id },
    });
    if (count >= 12) {
      throw new BadRequestException(
        "Galeri en fazla 12 fotoğraf içerebilir",
      );
    }

    const photo = await this.prisma.supplierPhoto.create({
      data: {
        supplierId: supplier.id,
        url: dto.key,
        caption: dto.caption?.trim() || null,
        orderIndex: count,
      },
      select: { id: true, url: true, caption: true },
    });

    const url = await this.storage.resolveImageUrl(photo.url);
    return {
      id: photo.id,
      url: url ?? "",
      caption: photo.caption,
    };
  }

  async removePhoto(supplierUserId: string, photoId: string) {
    const supplier = await this.getPremiumSupplier(supplierUserId);
    const photo = await this.prisma.supplierPhoto.findUnique({
      where: { id: photoId },
      select: { id: true, url: true, supplierId: true },
    });
    if (!photo) throw new NotFoundException("Foto bulunamadı");
    if (photo.supplierId !== supplier.id) {
      throw new ForbiddenException("Bu foto size ait değil");
    }
    await this.storage.deleteObject(photo.url).catch(() => undefined);
    await this.prisma.supplierPhoto.delete({ where: { id: photoId } });
    return this.getPublicProfile(supplierUserId);
  }
}
