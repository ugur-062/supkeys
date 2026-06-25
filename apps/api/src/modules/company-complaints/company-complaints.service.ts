import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { normalizeShortCode, validateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

@Injectable()
export class CompanyComplaintsService {
  constructor(private readonly prisma: PrismaService) {}

  async file(
    actor: AuthenticatedCompanyUser,
    input: { supkeysId: string; reason: string; detail?: string },
  ) {
    const code = normalizeShortCode(input.supkeysId);
    if (!validateShortCode(code)) {
      throw new BadRequestException("Geçersiz firma kodu");
    }
    const target = await this.prisma.company.findUnique({
      where: { supkeysId: code },
      select: { id: true, name: true },
    });
    if (!target) throw new NotFoundException("Firma bulunamadı");
    if (target.id === actor.companyId) {
      throw new BadRequestException("Kendinizi şikayet edemezsiniz");
    }
    const dup = await this.prisma.companyComplaint.findFirst({
      where: {
        complainantCompanyId: actor.companyId,
        againstCompanyId: target.id,
        status: "OPEN",
      },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException("Bu firma için zaten açık şikayetiniz var");
    }
    const c = await this.prisma.companyComplaint.create({
      data: {
        complainantCompanyId: actor.companyId,
        againstCompanyId: target.id,
        reason: input.reason.trim(),
        detail: input.detail?.trim() || null,
        createdById: actor.userId,
      },
    });
    return { id: c.id, ok: true };
  }

  async listMine(actor: AuthenticatedCompanyUser) {
    const rows = await this.prisma.companyComplaint.findMany({
      where: { complainantCompanyId: actor.companyId },
      include: { against: { select: { name: true, supkeysId: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      against: r.against,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }
}
