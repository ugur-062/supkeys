import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { validateCategorySelection } from "../../../common/helpers/category-selection.helper";
import {
  downloadImageBuffer,
  extForContentType,
  fetchSiteMeta,
} from "../../../common/website-import";
import { generateCompanyAbout } from "../../../common/ai-about";
import { CategoryService } from "../../categories/services/category.service";
import { StorageService } from "../../storage/storage.service";
import type { UpdateTenantCategoriesDto } from "../dto/update-tenant-categories.dto";
import type { FinalizeTenantImageDto, RequestTenantUploadDto } from "../dto/tenant-upload.dto";
import type { UpdateTenantPublicProfileDto } from "../dto/update-tenant-public-profile.dto";

const SELECT = {
  name: true,
  slug: true,
  supkeysId: true,
  industry: true,
  city: true,
  publicEnabled: true,
  aboutText: true,
  website: true,
  linkedinUrl: true,
  instagramUrl: true,
  logoUrl: true,
  coverImageUrl: true,
  services: true,
  foundedYear: true,
  employeeCount: true,
  certifications: true,
} as const;

@Injectable()
export class TenantPublicProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly categories: CategoryService,
  ) {}

  /**
   * Alıcının faaliyet kategorileri — ana (segment, ≤3) + alt (sınırsız),
   * isim/breadcrumb ile çözümlenmiş. Firma profili kategori kartı için.
   */
  async getMyCategories(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { sectorCategoryIds: true, subCategoryIds: true },
    });
    if (!t) throw new NotFoundException("Firma bulunamadı");

    const resolved = await this.categories.getByIds([
      ...t.sectorCategoryIds,
      ...t.subCategoryIds,
    ]);
    const byId = new Map(resolved.map((c) => [c.id, c]));
    // Seçim sırasını koru (ilk ana = "ana kategori").
    const main = t.sectorCategoryIds
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c);
    const sub = t.subCategoryIds
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c);
    return { main, sub };
  }

  /** Alıcının kategorilerini güncelle (ana ≤3 + alt sınırsız). */
  async updateMyCategories(tenantId: string, dto: UpdateTenantCategoriesDto) {
    const { mainIds, subIds, mainNames } = await validateCategorySelection(
      this.prisma,
      dto.mainCategoryIds,
      dto.subCategoryIds ?? [],
    );
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        sectorCategoryIds: mainIds,
        subCategoryIds: subIds,
        industry: mainNames[0] ?? null,
      },
    });
    return this.getMyCategories(tenantId);
  }

  /** Logo + cover key'lerini görüntülenebilir URL'e çevirir. */
  private async serialize(t: {
    name: string;
    slug: string;
    supkeysId: string | null;
    industry: string | null;
    city: string | null;
    publicEnabled: boolean;
    aboutText: string | null;
    website: string | null;
    linkedinUrl: string | null;
    instagramUrl: string | null;
    logoUrl: string | null;
    coverImageUrl: string | null;
    services: string[];
    foundedYear: number | null;
    employeeCount: string | null;
    certifications: string[];
  }) {
    const [logoUrl, coverImageUrl] = await Promise.all([
      this.storage.resolveImageUrl(t.logoUrl),
      this.storage.resolveImageUrl(t.coverImageUrl),
    ]);
    return { ...t, logoUrl, coverImageUrl };
  }

  async getMine(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: SELECT,
    });
    if (!t) throw new NotFoundException("Firma bulunamadı");
    return this.serialize(t);
  }

  async updateMine(tenantId: string, dto: UpdateTenantPublicProfileDto) {
    const clean = (v: string | undefined) =>
      v === undefined ? undefined : v.trim() || null;

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.publicEnabled !== undefined
          ? { publicEnabled: dto.publicEnabled }
          : {}),
        ...(dto.aboutText !== undefined ? { aboutText: clean(dto.aboutText) } : {}),
        ...(dto.website !== undefined ? { website: clean(dto.website) } : {}),
        ...(dto.linkedinUrl !== undefined
          ? { linkedinUrl: clean(dto.linkedinUrl) }
          : {}),
        ...(dto.instagramUrl !== undefined
          ? { instagramUrl: clean(dto.instagramUrl) }
          : {}),
        ...(dto.services !== undefined
          ? {
              services: dto.services
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 20),
            }
          : {}),
        ...(dto.foundedYear !== undefined
          ? { foundedYear: dto.foundedYear }
          : {}),
        ...(dto.employeeCount !== undefined
          ? { employeeCount: clean(dto.employeeCount) }
          : {}),
        ...(dto.certifications !== undefined
          ? {
              certifications: dto.certifications
                .map((c) => c.trim())
                .filter(Boolean)
                .slice(0, 20),
            }
          : {}),
      },
    });
    return this.getMine(tenantId);
  }

  /** Herkese açık — slug ile profil. publicEnabled+isActive değilse 404. */
  async getPublicBySlug(slug: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { ...SELECT, isActive: true },
    });
    if (!t || !t.publicEnabled || !t.isActive) {
      throw new NotFoundException("Profil bulunamadı");
    }
    const { isActive: _isActive, ...rest } = t;
    return this.serialize(rest);
  }

  // ===== Görsel upload (logo + cover) =====

  private assertOwnKey(key: string, tenantId: string, kind: "logo" | "cover") {
    if (!key.includes(`/tenant-profile/${tenantId}/${kind}-`)) {
      throw new BadRequestException("Geçersiz dosya anahtarı");
    }
  }

  async requestUpload(
    tenantId: string,
    kind: "logo" | "cover",
    dto: RequestTenantUploadDto,
  ) {
    const key = this.storage.buildTenantProfileKey(
      tenantId,
      kind,
      randomUUID(),
      dto.filename,
    );
    const uploadUrl = await this.storage.generatePresignedPut(key, dto.mimeType);
    return { uploadUrl, key };
  }

  async finalize(
    tenantId: string,
    kind: "logo" | "cover",
    dto: FinalizeTenantImageDto,
  ) {
    this.assertOwnKey(dto.key, tenantId, kind);
    const check = await this.storage.checkExists(dto.key);
    if (!check.exists) {
      throw new BadRequestException(
        "Yüklenmiş dosya bulunamadı — önce R2'ya PUT atın",
      );
    }
    const field = kind === "logo" ? "logoUrl" : "coverImageUrl";
    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { [field]: true },
    });
    const oldKey = (current as Record<string, string | null> | null)?.[field];
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { [field]: dto.key },
    });
    if (oldKey && oldKey !== dto.key) {
      await this.storage.deleteObject(oldKey).catch(() => undefined);
    }
    return this.getMine(tenantId);
  }

  async removeImage(tenantId: string, kind: "logo" | "cover") {
    const field = kind === "logo" ? "logoUrl" : "coverImageUrl";
    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { [field]: true },
    });
    const oldKey = (current as Record<string, string | null> | null)?.[field];
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { [field]: null },
    });
    if (oldKey) await this.storage.deleteObject(oldKey).catch(() => undefined);
    return this.getMine(tenantId);
  }

  // ===== Web sitesinden otomatik doldurma (OG meta + favicon) =====

  /**
   * Web sitesinin OG meta + favicon'undan logo/kapak/açıklama çekip profile
   * uygular. Görseller R2'ya kopyalanır (dış URL'e bağımlı kalmaz).
   */
  async importFromWebsite(tenantId: string, website: string) {
    const meta = await fetchSiteMeta(website);
    const tenantRow = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const imported = { logo: false, cover: false, about: false, social: false };

    if (meta.ogImage) {
      const key = await this.downloadImageToR2(tenantId, "cover", meta.ogImage);
      if (key) {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { coverImageUrl: key },
        });
        imported.cover = true;
      }
    }
    if (meta.logo) {
      const key = await this.downloadImageToR2(tenantId, "logo", meta.logo);
      if (key) {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { logoUrl: key },
        });
        imported.logo = true;
      }
    }
    // Açık "Otomatik Doldur" — varsa üzerine yazılır (kullanıcı sonra düzenler).
    const data: {
      aboutText?: string;
      linkedinUrl?: string;
      instagramUrl?: string;
    } = {};
    // Önce AI ile site içeriğinden profesyonel metin üret; olmazsa og:description.
    const aiAbout = await generateCompanyAbout({
      companyName: tenantRow?.name ?? "",
      siteText: meta.text,
    });
    const about = aiAbout ?? meta.description;
    if (about) {
      data.aboutText = about.slice(0, 2000);
      imported.about = true;
    }
    if (meta.linkedin) {
      data.linkedinUrl = meta.linkedin.slice(0, 300);
      imported.social = true;
    }
    if (meta.instagram) {
      data.instagramUrl = meta.instagram.slice(0, 300);
      imported.social = true;
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.tenant.update({ where: { id: tenantId }, data });
    }

    const profile = await this.getMine(tenantId);
    return { ...profile, imported };
  }

  private async downloadImageToR2(
    tenantId: string,
    kind: "logo" | "cover",
    imageUrl: string,
  ): Promise<string | null> {
    const img = await downloadImageBuffer(imageUrl);
    if (!img) return null;
    const key = this.storage.buildTenantProfileKey(
      tenantId,
      kind,
      randomUUID(),
      `import.${extForContentType(img.contentType)}`,
    );
    await this.storage.putObject(key, img.buffer, img.contentType);
    return key;
  }
}
