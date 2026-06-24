import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { hashToken } from "../helpers/token.helper";

/**
 * Alıcı kayıt — davet bilgisi. (Eski link-tabanlı başvuru akışı kaldırıldı;
 * canlı kayıt artık 6-haneli kod signup'ı kullanıyor — bkz. buyer-signup.service.)
 */
@Injectable()
export class BuyerRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public: davet token'ından firma bilgilerini döner — /register/buyer sayfası
   * formu prefil etmek ve kullanıcıya bağlamı göstermek için kullanır.
   */
  async getInvitationInfo(token: string) {
    const tokenHash = hashToken(token);
    const demo = await this.prisma.demoRequest.findUnique({
      where: { inviteToken: tokenHash },
      select: {
        companyName: true,
        contactName: true,
        inviteSentToEmail: true,
        inviteSentMessage: true,
        inviteTokenExpAt: true,
        inviteUsedAt: true,
        linkedApplicationId: true,
      },
    });

    if (!demo) throw new NotFoundException("Davet bulunamadı");

    if (demo.linkedApplicationId) {
      throw new ConflictException(
        "Bu davet zaten kullanılmış, kayıt tamamlanmış",
      );
    }
    if (demo.inviteUsedAt) {
      throw new ConflictException("Bu davet zaten kullanılmış");
    }
    if (demo.inviteTokenExpAt && demo.inviteTokenExpAt < new Date()) {
      throw new GoneException("Davet süresi dolmuş");
    }

    return {
      companyName: demo.companyName,
      contactName: demo.contactName,
      email: demo.inviteSentToEmail,
      message: demo.inviteSentMessage,
      expiresAt: demo.inviteTokenExpAt,
    };
  }
}
