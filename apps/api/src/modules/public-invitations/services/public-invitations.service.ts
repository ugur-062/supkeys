import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { JwtPayload } from "../../auth/strategies/jwt.strategy";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";

@Injectable()
export class PublicInvitationsService {
  private readonly logger = new Logger(PublicInvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  async getByToken(token: string) {
    const inv = await this.prisma.userInvitation.findUnique({
      where: { token },
      include: { tenant: { select: { name: true, isActive: true } } },
    });
    if (!inv) throw new NotFoundException("Davet bulunamadı");

    if (inv.status === "ACCEPTED") {
      throw new ConflictException("Davet zaten kabul edilmiş");
    }
    if (inv.status === "CANCELLED") {
      throw new ConflictException("Davet iptal edilmiş");
    }

    if (inv.expiresAt < new Date()) {
      // On-the-fly EXPIRED
      if (inv.status === "PENDING") {
        await this.prisma.userInvitation.update({
          where: { id: inv.id },
          data: { status: "EXPIRED" },
        });
      }
      throw new ConflictException("Davet süresi dolmuş");
    }

    if (!inv.tenant.isActive) {
      throw new ConflictException("Firma hesabı pasif durumda");
    }

    return {
      email: inv.email,
      role: inv.role,
      tenantName: inv.tenant.name,
      expiresAt: inv.expiresAt.toISOString(),
    };
  }

  async accept(token: string, dto: AcceptInvitationDto) {
    // Pre-validate dışarıda; Supabase auth user create işlemi $transaction
    // dışına çıkıyor — DB rollback'i Supabase'i geri almaz, manuel compensate
    // gerekiyor. Bu yüzden Supabase çağrısı tx açılmadan önce yapılır.
    const inv = await this.prisma.userInvitation.findUnique({
      where: { token },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, isActive: true },
        },
      },
    });
    if (!inv) throw new NotFoundException("Davet bulunamadı");
    if (inv.status === "ACCEPTED") {
      throw new ConflictException("Davet zaten kabul edilmiş");
    }
    if (inv.status === "CANCELLED") {
      throw new ConflictException("Davet iptal edilmiş");
    }
    if (inv.expiresAt < new Date()) {
      await this.prisma.userInvitation.update({
        where: { id: inv.id },
        data: { status: "EXPIRED" },
      });
      throw new ConflictException("Davet süresi dolmuş");
    }
    if (!inv.tenant.isActive) {
      throw new ConflictException("Firma hesabı pasif durumda");
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: inv.email },
    });
    if (existingUser) {
      throw new ConflictException(
        "Bu e-posta başka bir hesaba kayıtlı, davet kabul edilemiyor",
      );
    }

    // Supabase Auth source-of-truth: önce auth.users'a yaz.
    const { authId } = await this.supabaseAuth.createUser(
      inv.email,
      dto.password,
      { role: "tenant_user", tenant_id: inv.tenantId },
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Race koruması — tx içinde davet statüsünü tekrar doğrula
        const fresh = await tx.userInvitation.findUnique({ where: { token } });
        if (!fresh || fresh.status !== "PENDING") {
          throw new ConflictException("Davet artık geçerli değil");
        }

        const user = await tx.user.create({
          data: {
            email: inv.email,
            authId,
            passwordHash: null,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
            role: inv.role,
            isActive: true,
            tenantId: inv.tenantId,
            invitedById: inv.invitedById,
            invitedAt: inv.createdAt,
            lastLoginAt: new Date(),
          },
        });

        await tx.userInvitation.update({
          where: { id: inv.id },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        });

        const payload: JwtPayload = {
          sub: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          type: "tenant",
        };
        const tokenJwt = this.jwt.sign(payload);

        return {
          token: tokenJwt,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            tenant: {
              id: inv.tenant.id,
              name: inv.tenant.name,
              slug: inv.tenant.slug,
            },
          },
        };
      });
    } catch (err) {
      // DB tx failed — Supabase auth user'ı kompansa et (orphan kalmasın)
      try {
        await this.supabaseAuth.deleteUser(authId);
      } catch (cleanupErr) {
        this.logger.error(
          `Davet kabul DB tx fail sonrası auth.users cleanup hatası (${authId}): ${
            cleanupErr instanceof Error ? cleanupErr.message : cleanupErr
          }`,
        );
      }
      throw err;
    }
  }
}
