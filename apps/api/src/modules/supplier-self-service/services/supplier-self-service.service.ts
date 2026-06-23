import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@supkeys/db";
import {
  isValidSupplierSector,
  isValidTaxId,
  isValidTckn,
  normalizeShortCode,
  validateShortCode,
} from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { buildCorporateIdentityData } from "../../../common/helpers/corporate-identity.helper";
import { EmailService } from "../../email/email.service";
import { hashToken } from "../../registration/helpers/token.helper";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";
import { CompleteOnboardingDto } from "../dto/complete-onboarding.dto";
import { UpdateCorporateIdentityDto } from "../dto/update-corporate-identity.dto";

@Injectable()
export class SupplierSelfServiceService {
  private readonly logger = new Logger(SupplierSelfServiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Madde 29 — FAZ 2 onboarding'i tamamla. Firma kimliği + yetkili (rol→isManager)
   * + kürasyonlu faaliyet sektörleri (1-3) + teslimat adresi kaydeder,
   * `onboardingCompletedAt` set eder. Panel gate'i bu tarih dolunca açılır.
   */
  async completeOnboarding(
    supplierId: string,
    supplierUserId: string,
    dto: CompleteOnboardingDto,
  ) {
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

    // Faaliyet sektörü — kürasyonlu liste, 1-3 adet, benzersiz.
    const sectors = Array.from(new Set(dto.sectors.map((s) => s.trim())));
    if (sectors.length < 1 || sectors.length > 3) {
      throw new BadRequestException("1-3 arası faaliyet sektörü seçmelisiniz");
    }
    if (!sectors.every((s) => isValidSupplierSector(s))) {
      throw new BadRequestException("Geçersiz faaliyet sektörü seçimi");
    }
    const mainSector = sectors[0];

    // Teslimat adresi — "fatura adresimle aynı" ise fatura adresinden kopyala.
    const delivery = dto.deliveryUseBilling
      ? {
          deliveryCity: dto.city.trim(),
          deliveryDistrict: dto.district.trim(),
          deliveryNeighborhood: dto.neighborhood.trim(),
          deliveryPostalCode: dto.postalCode.trim(),
          deliveryAddressLine: dto.addressLine.trim(),
        }
      : {
          deliveryCity: dto.deliveryCity?.trim() || null,
          deliveryDistrict: dto.deliveryDistrict?.trim() || null,
          deliveryNeighborhood: dto.deliveryNeighborhood?.trim() || null,
          deliveryPostalCode: dto.deliveryPostalCode?.trim() || null,
          deliveryAddressLine: dto.deliveryAddressLine?.trim() || null,
        };
    if (
      !dto.deliveryUseBilling &&
      (!delivery.deliveryCity || !delivery.deliveryAddressLine)
    ) {
      throw new BadRequestException("Teslimat adresi eksik");
    }

    const isManager = dto.role === "MANAGER";

    await this.prisma.$transaction([
      this.prisma.supplier.update({
        where: { id: supplierId },
        data: {
          // Signup'taki placeholder companyName'i gerçek ünvanla değiştir.
          companyName: dto.legalName.trim(),
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
          authorizedTitle: isManager ? "Yönetici" : "Satın Almacı",
          sectors,
          industry: mainSector,
          ...delivery,
          onboardingCompletedAt: new Date(),
        },
      }),
      // Yetkilinin rolü → isManager.
      this.prisma.supplierUser.update({
        where: { id: supplierUserId },
        data: { isManager },
      }),
    ]);

    return { ok: true };
  }

  /**
   * Madde 29 — FAZ 3.1 kurumsal kimlik güncelle (MERSİS, ticaret sicil, KEP,
   * IBAN, IBAN sahibi). Boş string → null. Format kontrolleri shared validator.
   */
  async updateCorporateIdentity(
    supplierId: string,
    dto: UpdateCorporateIdentityDto,
  ) {
    const data = buildCorporateIdentityData(dto);
    await this.prisma.supplier.update({ where: { id: supplierId }, data });
    return { ok: true };
  }

  /**
   * Mevcut tedarikçi: aldığı davetin token'ını ya da kısa kodunu girerek
   * `SupplierTenantRelation` (status=ACTIVE) oluşturur.
   *
   * Mimari karar (D.2.B sadeleştirmesi): Mevcut tedarikçi platform admin
   * tarafından zaten doğrulanmış olduğu için tenant tarafında ek bir onay
   * adımı gerekmez — ilişki direkt aktiftir. Alıcı tenant ve tedarikçi,
   * paralel iki bilgilendirme e-postası alır.
   */
  async acceptInvitation(
    supplierUserId: string,
    supplierId: string,
    supplierEmail: string,
    dto: AcceptInvitationDto,
  ) {
    if (!dto.invitationToken && !dto.shortCode) {
      throw new BadRequestException(
        "Davet token'ı veya kısa kod gerekli",
      );
    }

    const invitation = await this.findInvitation(dto);

    if (invitation.status === "ACCEPTED") {
      throw new ConflictException("Bu davet zaten kullanılmış");
    }
    if (invitation.status === "CANCELLED") {
      throw new GoneException("Davet iptal edilmiş");
    }
    if (invitation.expiresAt < new Date()) {
      throw new GoneException("Davet süresi dolmuş");
    }
    if (!invitation.isExistingSupplier) {
      throw new BadRequestException(
        "Bu davet yeni tedarikçi kaydı için. Profilinizden kabul edilemez.",
      );
    }
    if (invitation.email.toLowerCase() !== supplierEmail.toLowerCase()) {
      throw new ForbiddenException(
        "Davet farklı bir e-postaya gönderilmiş, hesabınızla eşleşmiyor",
      );
    }

    // Mevcut ilişki kontrolü — yeni akışta PENDING_TENANT_APPROVAL üretilmiyor
    // ama legacy datada hâlâ olabilir; orijinal mesajı koruyoruz.
    const existingRelation = await this.prisma.supplierTenantRelation.findUnique({
      where: {
        supplierId_tenantId: {
          supplierId,
          tenantId: invitation.tenantId,
        },
      },
      select: { status: true },
    });
    if (existingRelation) {
      switch (existingRelation.status) {
        case "ACTIVE":
          throw new ConflictException(
            "Zaten bu alıcının onaylı tedarikçisisiniz",
          );
        case "PENDING_TENANT_APPROVAL":
          throw new ConflictException(
            "Bu alıcının onayı zaten bekleniyor",
          );
        case "BLOCKED":
          throw new ConflictException(
            "Bu alıcı tarafından engellenmişsiniz, talep gönderemezsiniz",
          );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const relation = await tx.supplierTenantRelation.create({
        data: {
          supplierId,
          tenantId: invitation.tenantId,
          status: "ACTIVE",
        },
      });

      await tx.supplierInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedBySupplierId: supplierId,
          // Manual short code akışında openedAt boş kalmış olabilir
          openedAt: invitation.openedAt ?? new Date(),
        },
      });

      // V2-7 — Davet bir ihaleye bağlıysa, ilişki kurulduğu an tedarikçiyi
      // o ihaleye davetli yap (ihale hâlâ açıksa).
      if (invitation.tenderId) {
        await this.linkTenderInvitation(tx, invitation.tenderId, supplierId);
      }

      return { relation };
    });

    // Bilgilendirme e-postaları (fire-and-forget, paralel)
    this.notifyRelationEstablished(
      invitation.tenantId,
      supplierId,
      supplierUserId,
    ).catch((err) => {
      this.logger.error(
        `notifyRelationEstablished failed for relation ${result.relation.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      relationId: result.relation.id,
      tenantId: invitation.tenantId,
      tenantName: invitation.tenantName,
      status: "ACTIVE" as const,
      message: `${invitation.tenantName} ile bağlantınız kuruldu! Profilinizde görüntüleyebilirsiniz.`,
    };
  }

  // ---------- Faz 3 madde 6 — Supkeys ID + Alıcı Havuzu ----------

  /** Supplier → alıcıya bağlantı isteği (tedarikçi havuzu / Supkeys ID). */
  async requestConnectToBuyer(
    supplierId: string,
    supplierUserId: string,
    tenantId: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, isActive: true },
    });
    if (!tenant || !tenant.isActive) {
      throw new NotFoundException("Alıcı bulunamadı");
    }

    const existing = await this.prisma.supplierTenantRelation.findUnique({
      where: { supplierId_tenantId: { supplierId, tenantId } },
      select: { status: true },
    });
    if (existing) {
      if (existing.status === "ACTIVE")
        throw new ConflictException("Bu alıcıyla zaten bağlısınız");
      if (existing.status === "PENDING_TENANT_APPROVAL")
        throw new ConflictException("Bu alıcının onayı zaten bekleniyor");
      if (existing.status === "BLOCKED")
        throw new ConflictException("Bu alıcı tarafından engellenmişsiniz");
    }

    // Self-bağlantı (CONNECT_REQUEST) yalnızca PREMIUM tedarikçilere özeldir.
    // Premium biterse bu bağlantılar etkisizleşir (alıcı listesinden düşer),
    // tekrar premium olunca otomatik geri gelir. Standart tedarikçi self-bağlanamaz;
    // alıcının kendisini referans (Supkeys) kodu/davetle eklemesini bekler.
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { membership: true },
    });
    if (supplier?.membership !== "PREMIUM") {
      throw new ForbiddenException(
        "Alıcıya bağlantı isteği göndermek premium üyeliğe özeldir. Premium'a geçin ya da alıcının sizi Supkeys ID'nizle eklemesini isteyin.",
      );
    }

    const relation = await this.prisma.supplierTenantRelation.create({
      data: {
        supplierId,
        tenantId,
        status: "PENDING_TENANT_APPROVAL",
        origin: "CONNECT_REQUEST",
        requestedAt: new Date(),
      },
    });

    return {
      relationId: relation.id,
      tenantName: tenant.name,
      status: "PENDING_TENANT_APPROVAL" as const,
      message: `${tenant.name} firmasına bağlantı isteği gönderildi; onayladığında bağlantınız kurulacak.`,
    };
  }

  /** Supplier → Supkeys ID ile alıcı bul + bağlantı isteği. */
  async connectToBuyerBySupkeysId(
    supplierId: string,
    supplierUserId: string,
    supkeysIdInput: string,
  ) {
    const code = normalizeShortCode(
      supkeysIdInput.trim().replace(/^SK-?/i, ""),
    );
    if (!validateShortCode(code)) {
      throw new BadRequestException("Geçersiz Supkeys ID formatı");
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { supkeysId: code },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException("Bu Supkeys ID ile bir alıcı bulunamadı");
    }
    return this.requestConnectToBuyer(supplierId, supplierUserId, tenant.id);
  }

  /** Alıcı havuzu — tüm tedarikçiler arar/listeler (ad + Supkeys ID). */
  async getBuyerPool(supplierId: string, search?: string) {
    const term = search?.trim();
    // Supkeys ID araması: "SK-XXXX-XXXX" → "XXXX-XXXX" normalize.
    const idTerm = term
      ? normalizeShortCode(term.replace(/^SK-?/i, ""))
      : "";
    const where: Prisma.TenantWhereInput = {
      isActive: true,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { city: { contains: term, mode: "insensitive" } },
              { industry: { contains: term, mode: "insensitive" } },
              { supkeysId: { equals: idTerm } },
            ],
          }
        : {}),
    };

    const tenants = await this.prisma.tenant.findMany({
      where,
      orderBy: { name: "asc" },
      take: 100,
      select: {
        id: true,
        name: true,
        slug: true,
        supkeysId: true,
        publicEnabled: true,
        city: true,
        district: true,
        industry: true,
        logoUrl: true,
        services: true,
      },
    });

    const relations = await this.prisma.supplierTenantRelation.findMany({
      where: { supplierId, tenantId: { in: tenants.map((t) => t.id) } },
      select: { tenantId: true, status: true },
    });
    const relMap = new Map(relations.map((r) => [r.tenantId, r.status]));

    return tenants.map((t) => ({
      ...t,
      relationStatus: relMap.get(t.id) ?? null,
    }));
  }

  // ---------- helpers ----------

  /**
   * V2-7 — Davet kabulüyle tedarikçiyi ihaleye davetli yap. Idempotent (zaten
   * davetliyse atla); ihale DRAFT/OPEN_FOR_BIDS değilse (kapanmış vb.) atla.
   */
  private async linkTenderInvitation(
    tx: Prisma.TransactionClient,
    tenderId: string,
    supplierId: string,
  ) {
    const tender = await tx.tender.findUnique({
      where: { id: tenderId },
      select: { status: true },
    });
    if (
      !tender ||
      (tender.status !== "OPEN_FOR_BIDS" && tender.status !== "DRAFT")
    ) {
      return;
    }

    await tx.tenderInvitation.upsert({
      where: { tenderId_supplierId: { tenderId, supplierId } },
      create: { tenderId, supplierId, status: "PENDING" },
      update: {},
    });
  }

  private async findInvitation(dto: AcceptInvitationDto) {
    if (dto.invitationToken) {
      const tokenHash = hashToken(dto.invitationToken);
      const invitation = await this.prisma.supplierInvitation.findUnique({
        where: { tokenHash },
        include: { tenant: { select: { name: true } } },
      });
      if (!invitation) throw new NotFoundException("Davet bulunamadı");
      return {
        id: invitation.id,
        tenantId: invitation.tenantId,
        tenantName: invitation.tenant.name,
        email: invitation.email,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        isExistingSupplier: invitation.isExistingSupplier,
        openedAt: invitation.openedAt,
        tenderId: invitation.tenderId,
      };
    }

    const normalized = normalizeShortCode(dto.shortCode!);
    if (!validateShortCode(normalized)) {
      throw new BadRequestException(
        "Geçerli bir davet kodu girin (örn: K7X9-3M2P)",
      );
    }
    const invitation = await this.prisma.supplierInvitation.findUnique({
      where: { shortCode: normalized },
      include: { tenant: { select: { name: true } } },
    });
    if (!invitation) throw new NotFoundException("Davet bulunamadı");
    return {
      id: invitation.id,
      tenantId: invitation.tenantId,
      tenantName: invitation.tenant.name,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      isExistingSupplier: invitation.isExistingSupplier,
      openedAt: invitation.openedAt,
    };
  }

  /**
   * 2 paralel bilgilendirme e-postası:
   *   - Alıcı tenant'ın aktif COMPANY_ADMIN'lerine "yeni tedarikçi eklendi"
   *   - Tedarikçi user'a "alıcı bağlantınız aktif"
   */
  private async notifyRelationEstablished(
    tenantId: string,
    supplierId: string,
    supplierUserId: string,
  ) {
    const [supplier, supplierUser, tenant, admins] = await Promise.all([
      this.prisma.supplier.findUnique({
        where: { id: supplierId },
        select: {
          companyName: true,
          taxNumber: true,
          city: true,
          industry: true,
        },
      }),
      this.prisma.supplierUser.findUnique({
        where: { id: supplierUserId },
        select: { email: true, firstName: true, lastName: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
      this.prisma.user.findMany({
        where: { tenantId, role: "COMPANY_ADMIN", isActive: true },
        select: { email: true, firstName: true },
      }),
    ]);
    if (!supplier || !supplierUser || !tenant) return;

    const webUrl = this.config
      .get<string>("WEB_URL", "http://localhost:3000")
      .replace(/\/$/, "");

    const tedarikciDetayUrl = `${webUrl}/dashboard/tedarikciler?tab=approved`;
    const profileUrl = `${webUrl}/supplier/profil`;

    const tasks: Promise<unknown>[] = [];

    // Alıcı admin'lerine bilgi
    for (const admin of admins) {
      tasks.push(
        this.emailService.send({
          to: { email: admin.email, name: admin.firstName },
          templateData: {
            template: "supplier_relation_established_buyer",
            data: {
              adminFirstName: admin.firstName,
              tenantName: tenant.name,
              supplierCompanyName: supplier.companyName,
              supplierTaxNumber: supplier.taxNumber ?? "",
              supplierCity: supplier.city,
              supplierIndustry: supplier.industry ?? null,
              supplierContactEmail: supplierUser.email,
              tedarikciDetayUrl,
            },
          },
          context: { type: "supplier_relation", id: tenantId },
          subject: `🤝 Yeni tedarikçi listenize eklendi: ${supplier.companyName}`,
        }),
      );
    }

    // Tedarikçiye bilgi
    tasks.push(
      this.emailService.send({
        to: {
          email: supplierUser.email,
          name: `${supplierUser.firstName} ${supplierUser.lastName}`,
        },
        templateData: {
          template: "supplier_relation_established_supplier",
          data: {
            supplierUserName: `${supplierUser.firstName} ${supplierUser.lastName}`,
            tenantName: tenant.name,
            profileUrl,
          },
        },
        context: { type: "supplier_relation", id: supplierId },
        subject: `✓ ${tenant.name} ile bağlantınız aktif — Supkeys`,
      }),
    );

    await Promise.allSettled(tasks);
  }
}
