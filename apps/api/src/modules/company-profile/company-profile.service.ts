import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { generateSlug } from "@supkeys/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { UpdateCompanyProfileDto } from "./dto/update-company-profile.dto";

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];

const SELECT = {
  id: true,
  name: true,
  legalName: true,
  industry: true,
  website: true,
  country: true,
  city: true,
  district: true,
  addressLine: true,
  postalCode: true,
  aboutText: true,
  publicEnabled: true,
  logoUrl: true,
  coverImageUrl: true,
  linkedinUrl: true,
  instagramUrl: true,
  employeeCount: true,
  foundedYear: true,
  services: true,
  certifications: true,
  photos: true,
  certificateImages: true,
  buyerCategoryIds: true,
  sellerCategoryIds: true,
  taxNumber: true,
  supkeysId: true,
  slug: true,
  tier: true,
  companyVerificationStatus: true,
} as const;

@Injectable()
export class CompanyProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Logo/kapak için presigned PUT URL üretir (tarayıcı doğrudan R2'ye yükler). */
  async requestImageUploadUrl(
    companyId: string,
    kind: "logo" | "cover" | "gallery",
    fileName: string,
    mimeType: string,
  ) {
    if (!IMAGE_MIME.includes(mimeType)) {
      throw new BadRequestException("Yalnızca JPEG, PNG veya WebP yüklenebilir");
    }
    // logo/cover sabit (üzerine yazılır); gallery her foto benzersiz.
    const id = kind === "gallery" ? randomUUID() : companyId;
    const key = this.storage.buildTenantProfileKey(
      companyId,
      kind,
      id,
      fileName,
    );
    const url = await this.storage.generatePresignedPut(key, mimeType);
    return { url, key };
  }

  /**
   * Yükleme bitince key → kalıcı public URL'e çevirir (DB'ye YAZMAZ — URL forma
   * konup diğer alanlarla birlikte Kaydet'te kalıcılaşır).
   */
  async resolveUploadedImage(key: string) {
    const url =
      this.storage.getPublicUrl(key) ??
      (await this.storage.resolveImageUrl(key));
    return { url };
  }

  async get(companyId: string) {
    const c = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: SELECT,
    });
    if (!c) throw new NotFoundException("Firma bulunamadı");
    return c;
  }

  /** Düzenlenebilir profil alanları (yetki: company:manage / YONETICI). */
  async update(companyId: string, dto: UpdateCompanyProfileDto) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.legalName !== undefined) data.legalName = dto.legalName.trim() || null;
    if (dto.industry !== undefined) data.industry = dto.industry.trim() || null;
    if (dto.website !== undefined) data.website = dto.website.trim() || null;
    if (dto.city !== undefined) data.city = dto.city.trim() || null;
    if (dto.district !== undefined) data.district = dto.district.trim() || null;
    if (dto.addressLine !== undefined)
      data.addressLine = dto.addressLine.trim() || null;
    if (dto.postalCode !== undefined)
      data.postalCode = dto.postalCode.trim() || null;
    if (dto.aboutText !== undefined)
      data.aboutText = dto.aboutText.trim() || null;
    if (dto.publicEnabled !== undefined) data.publicEnabled = dto.publicEnabled;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl.trim() || null;
    if (dto.coverImageUrl !== undefined)
      data.coverImageUrl = dto.coverImageUrl.trim() || null;
    if (dto.linkedinUrl !== undefined)
      data.linkedinUrl = dto.linkedinUrl.trim() || null;
    if (dto.instagramUrl !== undefined)
      data.instagramUrl = dto.instagramUrl.trim() || null;
    if (dto.employeeCount !== undefined)
      data.employeeCount = dto.employeeCount.trim() || null;
    if (dto.foundedYear !== undefined) data.foundedYear = dto.foundedYear ?? null;
    if (dto.services !== undefined)
      data.services = dto.services.map((s) => s.trim()).filter(Boolean);
    if (dto.certifications !== undefined)
      data.certifications = dto.certifications.map((s) => s.trim()).filter(Boolean);
    if (dto.photos !== undefined)
      data.photos = dto.photos.map((s) => s.trim()).filter(Boolean);
    if (dto.certificateImages !== undefined)
      data.certificateImages = dto.certificateImages
        .map((s) => s.trim())
        .filter(Boolean);
    if (dto.buyerCategoryIds !== undefined)
      data.buyerCategoryIds = dto.buyerCategoryIds;
    if (dto.sellerCategoryIds !== undefined)
      data.sellerCategoryIds = dto.sellerCategoryIds;

    // Public profil açıksa ve henüz slug yoksa SEO-dostu benzersiz slug üret.
    const current = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true, publicEnabled: true },
    });
    const willBePublic =
      (data.publicEnabled as boolean | undefined) ??
      current?.publicEnabled ??
      false;
    if (willBePublic && !current?.slug) {
      const baseName =
        (data.name as string | undefined) ?? current?.name ?? "firma";
      data.slug = await this.ensureUniqueSlug(baseName, companyId);
    }

    const c = await this.prisma.company.update({
      where: { id: companyId },
      data,
      select: SELECT,
    });
    return c;
  }

  private async ensureUniqueSlug(
    name: string,
    selfId: string,
  ): Promise<string> {
    const base = generateSlug(name).slice(0, 60) || "firma";
    let candidate = base;
    for (let i = 2; i < 50; i++) {
      const clash = await this.prisma.company.findFirst({
        where: { slug: candidate, id: { not: selfId } },
        select: { id: true },
      });
      if (!clash) return candidate;
      candidate = `${base}-${i}`;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
