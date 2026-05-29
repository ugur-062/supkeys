import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
        aboutText: true,
        services: true,
        website: true,
        linkedinUrl: true,
        instagramUrl: true,
        membership: true,
        companyName: true,
        photos: {
          orderBy: { orderIndex: "asc" },
          select: { id: true, url: true, caption: true },
        },
      },
    });
    if (!supplier) throw new NotFoundException("Tedarikçi bulunamadı");

    // Cover key → URL (public veya presigned GET); photos.url da aynı
    const [coverImageUrl, photoUrls] = await Promise.all([
      this.storage.resolveImageUrl(supplier.coverImageUrl),
      Promise.all(
        supplier.photos.map((p) => this.storage.resolveImageUrl(p.url)),
      ),
    ]);

    return {
      slug: supplier.slug,
      publicEnabled: supplier.publicEnabled,
      coverImageUrl,
      aboutText: supplier.aboutText,
      services: supplier.services,
      website: supplier.website,
      linkedinUrl: supplier.linkedinUrl,
      instagramUrl: supplier.instagramUrl,
      companyName: supplier.companyName,
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
      select: { id: true, membership: true },
    });
    if (!supplier) throw new NotFoundException("Tedarikçi bulunamadı");

    if (supplier.membership !== "PREMIUM") {
      throw new ForbiddenException(
        "Public profil özelliği PREMIUM üyelere özeldir",
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
    kind: "cover" | "photo",
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
