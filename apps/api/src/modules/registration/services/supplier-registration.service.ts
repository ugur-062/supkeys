import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { hashToken } from "../helpers/token.helper";

/**
 * Tedarikçi kayıt — davet bilgisi. (Eski link-tabanlı başvuru akışı kaldırıldı;
 * canlı kayıt artık 6-haneli kod signup'ı kullanıyor — bkz. supplier-signup.service.)
 */
@Injectable()
export class SupplierRegistrationService {
  private readonly logger = new Logger(SupplierRegistrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public: davet token'ından tedarikçiye davet eden tenant + kişi bilgisini
   * döner — /register/supplier sayfası formu prefil etmek için kullanır.
   */
  async getInvitationInfo(token: string) {
    const tokenHash = hashToken(token);
    const invitation = await this.prisma.supplierInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        email: true,
        contactName: true,
        message: true,
        expiresAt: true,
        status: true,
        isExistingSupplier: true,
        openedAt: true,
        tenant: { select: { name: true } },
      },
    });

    if (!invitation) throw new NotFoundException("Davet bulunamadı");
    if (invitation.status === "ACCEPTED") {
      throw new ConflictException("Bu davet zaten kullanılmış");
    }
    if (invitation.status === "CANCELLED") {
      throw new GoneException("Davet iptal edilmiş");
    }
    if (invitation.expiresAt < new Date()) {
      throw new GoneException("Davet süresi dolmuş");
    }

    // Tracking: bu davet ilk kez açılıyorsa openedAt'i set et — alıcı tarafa
    // "açıldı/açılmadı" göstergesi için. Fire-and-forget, hata yutar.
    if (!invitation.openedAt) {
      this.prisma.supplierInvitation
        .update({
          where: { id: invitation.id },
          data: { openedAt: new Date() },
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to set openedAt on invitation ${invitation.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    }

    return {
      tenantName: invitation.tenant.name,
      email: invitation.email,
      contactName: invitation.contactName,
      message: invitation.message,
      expiresAt: invitation.expiresAt,
      isExistingSupplier: invitation.isExistingSupplier,
    };
  }
}
