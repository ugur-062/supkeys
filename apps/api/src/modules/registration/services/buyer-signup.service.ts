import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { generateShortCode, generateSlug, uniqueSlug } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { TwoFactorService } from "../../two-factor/two-factor.service";
import { hashToken } from "../helpers/token.helper";
import {
  BuyerSignupDto,
  VerifyBuyerEmailDto,
} from "../dto/buyer-signup.dto";

/**
 * Madde 29 — Alıcı signup. Tedarikçiyle simetrik; TEK FARK: admin davet linki
 * (demo sonrası) zorunlu. Hesap davet kabulünde anında oluşur; e-posta davetten
 * gelir. 6 haneli kod ile doğrulanır; doğrulanana kadar login engellenir.
 */
@Injectable()
export class BuyerSignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async signup(dto: BuyerSignupDto) {
    const tokenHash = hashToken(dto.invitationToken);
    const demo = await this.prisma.demoRequest.findUnique({
      where: { inviteToken: tokenHash },
      select: {
        id: true,
        companyName: true,
        inviteSentToEmail: true,
        inviteTokenExpAt: true,
        inviteUsedAt: true,
        linkedApplicationId: true,
      },
    });
    if (!demo || !demo.inviteSentToEmail) {
      throw new NotFoundException("Davet bulunamadı");
    }
    if (demo.inviteUsedAt || demo.linkedApplicationId) {
      throw new ConflictException("Bu davet zaten kullanılmış");
    }
    if (demo.inviteTokenExpAt && demo.inviteTokenExpAt < new Date()) {
      throw new GoneException("Davet süresi dolmuş");
    }

    const email = demo.inviteSentToEmail.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("Bu e-posta ile zaten bir hesap var");
    }

    const baseSlug = generateSlug(demo.companyName) || "firma";
    const slug = await uniqueSlug(baseSlug, async (candidate) => {
      const found = await this.prisma.tenant.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return !!found;
    });

    const { authId } = await this.supabaseAuth.createUser(email, dto.password, {
      role: "tenant_user",
      from_demo: demo.id,
    });

    let created: { id: string; firstName: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: demo.companyName || "Yeni Firma",
            slug,
            supkeysId: generateShortCode(),
          },
          select: { id: true },
        });
        const user = await tx.user.create({
          data: {
            email,
            authId,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            phone: dto.phone?.trim() || null,
            role: "COMPANY_ADMIN",
            tenantId: tenant.id,
            // emailVerifiedAt null → doğrulanana kadar login engelli.
          },
          select: { id: true, firstName: true },
        });
        await tx.demoRequest.update({
          where: { id: demo.id },
          data: { inviteUsedAt: new Date() },
        });
        return user;
      });
    } catch (err) {
      await this.supabaseAuth.deleteUser(authId).catch(() => undefined);
      throw err;
    }

    const { challengeId, expiresAt } = await this.twoFactor.issueChallenge(
      { kind: "user", id: created.id, email, firstName: created.firstName },
      "EMAIL_VERIFY",
    );
    return { challengeId, expiresAt, email };
  }

  async verifyEmail(dto: VerifyBuyerEmailDto) {
    this.twoFactor.assertCodeFormat(dto.code);
    const { id } = await this.twoFactor.verifyChallenge(
      dto.challengeId,
      dto.code,
      { kind: "user", purpose: "EMAIL_VERIFY" },
    );
    await this.prisma.user.update({
      where: { id },
      data: { emailVerifiedAt: new Date() },
    });
    return { ok: true };
  }

  async resend(challengeId: string) {
    const ch = await this.prisma.twoFactorChallenge.findUnique({
      where: { id: challengeId },
      select: { userId: true },
    });
    if (!ch?.userId) {
      throw new ConflictException("Geçersiz oturum");
    }
    const u = await this.prisma.user.findUnique({
      where: { id: ch.userId },
      select: { id: true, email: true, firstName: true },
    });
    if (!u) throw new ConflictException("Kullanıcı bulunamadı");
    return this.twoFactor.issueChallenge(
      { kind: "user", id: u.id, email: u.email, firstName: u.firstName },
      "EMAIL_VERIFY",
    );
  }
}
