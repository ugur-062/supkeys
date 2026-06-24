import { BadRequestException, Injectable } from "@nestjs/common";
import {
  isValidCountryCode,
  isValidTaxIdForCountry,
  isValidTckn,
} from "@supkeys/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { buildCorporateIdentityData } from "../../common/helpers/corporate-identity.helper";
import { validateCategorySelection } from "../../common/helpers/category-selection.helper";
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
    const country = (dto.country || "TR").toUpperCase();
    if (!isValidCountryCode(country)) {
      throw new BadRequestException("Geçersiz ülke seçimi");
    }
    const isTR = country === "TR";
    const isSole = dto.companyType === "SOLE_PROPRIETOR";

    if (!isValidTaxIdForCountry(dto.taxNumber, country, isSole)) {
      throw new BadRequestException(
        isTR
          ? isSole
            ? "Şahıs firması için 11 haneli geçerli TCKN giriniz"
            : "Tüzel kişi için 10 haneli geçerli vergi numarası giriniz"
          : "Geçerli bir vergi/sicil numarası giriniz",
      );
    }
    // TR: yetkili TCKN + vergi dairesi + ilçe zorunlu. Yabancı: gevşek.
    if (isTR) {
      if (!dto.authorizedTckn || !isValidTckn(dto.authorizedTckn)) {
        throw new BadRequestException("Yetkili T.C. Kimlik No geçersiz");
      }
      if (!dto.taxOffice?.trim()) {
        throw new BadRequestException("Vergi dairesi zorunlu");
      }
      if (!dto.district?.trim()) {
        throw new BadRequestException("İlçe zorunlu");
      }
    }

    // UNSPSC: 1-3 ANA (segment) + sınırsız ALT.
    const { mainIds, subIds, mainNames } = await validateCategorySelection(
      this.prisma,
      dto.mainCategoryIds,
      dto.subCategoryIds ?? [],
    );
    const mainSector = mainNames[0] ?? null;

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        legalName: dto.legalName.trim(),
        companyType: dto.companyType,
        country,
        taxNumber: dto.taxNumber.trim(),
        taxOffice: dto.taxOffice?.trim() || null,
        city: dto.city.trim(),
        district: dto.district?.trim() || null,
        stateRegion: dto.stateRegion?.trim() || null,
        neighborhood: dto.neighborhood?.trim() || null,
        postalCode: dto.postalCode?.trim() || null,
        addressLine: dto.addressLine.trim(),
        billingTitle: dto.billingTitle?.trim() || null,
        billingEmail: dto.billingEmail?.trim() || null,
        authorizedTckn: dto.authorizedTckn?.trim() || null,
        authorizedTitle: dto.authorizedTitle.trim(),
        sectorCategoryIds: mainIds,
        subCategoryIds: subIds,
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
