import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { normalizeShortCode, validateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";

@Injectable()
export class CompanyConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** supkeysId ile hedef firmaya bağlantı daveti gönder. */
  async invite(user: AuthenticatedCompanyUser, supkeysIdRaw: string) {
    const code = normalizeShortCode(supkeysIdRaw);
    if (!validateShortCode(code)) {
      throw new BadRequestException("Geçersiz firma kodu (XXXX-XXXX)");
    }

    const target = await this.prisma.company.findUnique({
      where: { supkeysId: code },
      select: { id: true, name: true, isActive: true },
    });
    if (!target || !target.isActive) {
      throw new NotFoundException("Bu koda sahip firma bulunamadı");
    }
    if (target.id === user.companyId) {
      throw new BadRequestException("Kendinize davet gönderemezsiniz");
    }

    // Her iki yönde mevcut bağlantı/davet var mı?
    const existing = await this.prisma.companyConnection.findFirst({
      where: {
        OR: [
          { inviterCompanyId: user.companyId, inviteeCompanyId: target.id },
          { inviterCompanyId: target.id, inviteeCompanyId: user.companyId },
        ],
      },
      select: { status: true, inviteeCompanyId: true },
    });
    if (existing) {
      if (existing.status === "ACTIVE") {
        throw new ConflictException("Bu firmayla zaten bağlısınız");
      }
      // Karşı taraf zaten sana davet attıysa, kabul et demek daha doğru.
      if (existing.inviteeCompanyId === user.companyId) {
        throw new ConflictException(
          "Bu firma size zaten davet göndermiş — Gelen Davetler'den kabul edin",
        );
      }
      throw new ConflictException("Bu firmaya zaten davet gönderdiniz");
    }

    const conn = await this.prisma.companyConnection.create({
      data: {
        inviterCompanyId: user.companyId,
        inviteeCompanyId: target.id,
        invitedById: user.userId,
        status: "PENDING",
        origin: "INVITE",
      },
    });
    return { id: conn.id, status: conn.status, targetName: target.name };
  }

  /** Bana gelen bekleyen davetler. */
  async listIncoming(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: { inviteeCompanyId: companyId, status: "PENDING" },
      include: {
        inviter: { select: { id: true, name: true, supkeysId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      connectionId: r.id,
      company: r.inviter,
      createdAt: r.createdAt,
    }));
  }

  /** Aktif bağlantılarım (her iki yön — karşı firmayı döner). */
  async list(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { inviterCompanyId: companyId },
          { inviteeCompanyId: companyId },
        ],
      },
      include: {
        inviter: { select: { id: true, name: true, supkeysId: true } },
        invitee: { select: { id: true, name: true, supkeysId: true } },
      },
      orderBy: { decidedAt: "desc" },
    });
    return rows.map((r) => ({
      connectionId: r.id,
      origin: r.origin,
      company:
        r.inviterCompanyId === companyId ? r.invitee : r.inviter,
      decidedAt: r.decidedAt,
    }));
  }

  /** Gelen daveti kabul et. */
  async accept(user: AuthenticatedCompanyUser, connectionId: string) {
    const conn = await this.requireIncoming(user.companyId, connectionId);
    await this.prisma.companyConnection.update({
      where: { id: conn.id },
      data: { status: "ACTIVE", decidedAt: new Date() },
    });
    return { ok: true };
  }

  /** Gelen daveti reddet (kaydı sil). */
  async reject(user: AuthenticatedCompanyUser, connectionId: string) {
    const conn = await this.requireIncoming(user.companyId, connectionId);
    await this.prisma.companyConnection.delete({ where: { id: conn.id } });
    return { ok: true };
  }

  private async requireIncoming(companyId: string, connectionId: string) {
    const conn = await this.prisma.companyConnection.findUnique({
      where: { id: connectionId },
      select: { id: true, inviteeCompanyId: true, status: true },
    });
    if (!conn || conn.inviteeCompanyId !== companyId) {
      throw new NotFoundException("Davet bulunamadı");
    }
    if (conn.status !== "PENDING") {
      throw new ConflictException("Davet zaten yanıtlanmış");
    }
    return conn;
  }
}
