import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { UpdateCompanyProfileDto } from "./dto/update-company-profile.dto";

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
  buyerCategoryIds: true,
  sellerCategoryIds: true,
  taxNumber: true,
  supkeysId: true,
  tier: true,
  companyVerificationStatus: true,
} as const;

@Injectable()
export class CompanyProfileService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (dto.buyerCategoryIds !== undefined)
      data.buyerCategoryIds = dto.buyerCategoryIds;
    if (dto.sellerCategoryIds !== undefined)
      data.sellerCategoryIds = dto.sellerCategoryIds;

    const c = await this.prisma.company.update({
      where: { id: companyId },
      data,
      select: SELECT,
    });
    return c;
  }
}
