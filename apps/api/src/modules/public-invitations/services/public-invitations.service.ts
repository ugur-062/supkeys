import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { JwtPayload } from "../../auth/strategies/jwt.strategy";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class PublicInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
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
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.userInvitation.findUnique({
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
        await tx.userInvitation.update({
          where: { id: inv.id },
          data: { status: "EXPIRED" },
        });
        throw new ConflictException("Davet süresi dolmuş");
      }
      if (!inv.tenant.isActive) {
        throw new ConflictException("Firma hesabı pasif durumda");
      }

      // Race koruması: aynı e-posta bu sırada başka bir tenant'a kaydolmuş olabilir
      const existingUser = await tx.user.findUnique({
        where: { email: inv.email },
      });
      if (existingUser) {
        throw new ConflictException(
          "Bu e-posta başka bir hesaba kayıtlı, davet kabul edilemiyor",
        );
      }

      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

      const user = await tx.user.create({
        data: {
          email: inv.email,
          passwordHash,
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
  }
}
