import { BadRequestException, Injectable } from "@nestjs/common";
import { isValidTaxId, isValidTckn } from "@supkeys/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { buildCorporateIdentityData } from "../../common/helpers/corporate-identity.helper";
import { CompleteTenantOnboardingDto } from "./dto/complete-tenant-onboarding.dto";
import { UpdateTenantCorporateIdentityDto } from "./dto/update-corporate-identity.dto";

@Injectable()
export class TenantOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Madde 29 — FAZ 2 onboarding'i tamamla (alıcı). Firma kimliği + yetkili +
   * faaliyet sektörü (UNSPSC segment, 1-3) kaydeder, onboardingCompletedAt set.
   */
  async completeOnboarding(tenantId: string, dto: CompleteTenantOnboardingDto) {
    const isSole = dto.companyType === "SOLE_PROPRIETOR";

    if (!isValidTaxId(dto.taxNumber, isSole)) {
      throw new BadRequestException(
        isSole
          ? "Şahıs firması için 11 haneli geçerli TCKN giriniz"
          : "Tüzel kişi için 10 haneli geçerli vergi numarası giriniz",
      );
    }
    if (!isValidTckn(dto.authorizedTckn)) {
      throw new BadRequestException("Yetkili T.C. Kimlik No geçersiz");
    }

    const categoryIds = Array.from(new Set(dto.categoryIds));
    if (categoryIds.length < 1 || categoryIds.length > 3) {
      throw new BadRequestException("1-3 arası faaliyet sektörü seçmelisiniz");
    }
    const segments = await this.prisma.category.findMany({
      where: { id: { in: categoryIds }, level: 1 },
      select: { id: true, nameTr: true },
    });
    if (segments.length !== categoryIds.length) {
      throw new BadRequestException("Geçersiz faaliyet sektörü seçimi");
    }
    const mainSector =
      segments.find((s) => s.id === categoryIds[0])?.nameTr ?? null;

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        legalName: dto.legalName.trim(),
        companyType: dto.companyType,
        taxNumber: dto.taxNumber.trim(),
        taxOffice: dto.taxOffice.trim(),
        city: dto.city.trim(),
        district: dto.district.trim(),
        neighborhood: dto.neighborhood.trim(),
        postalCode: dto.postalCode.trim(),
        addressLine: dto.addressLine.trim(),
        billingTitle: dto.billingTitle?.trim() || null,
        billingEmail: dto.billingEmail?.trim() || null,
        authorizedTckn: dto.authorizedTckn.trim(),
        authorizedTitle: dto.authorizedTitle.trim(),
        sectorCategoryIds: categoryIds,
        industry: mainSector,
        onboardingCompletedAt: new Date(),
      },
    });

    return { ok: true };
  }

  /** Madde 29 — FAZ 3.1 kurumsal kimlik güncelle (alıcı). */
  async updateCorporateIdentity(
    tenantId: string,
    dto: UpdateTenantCorporateIdentityDto,
  ) {
    const data = buildCorporateIdentityData(dto);
    await this.prisma.tenant.update({ where: { id: tenantId }, data });
    return { ok: true };
  }
}
