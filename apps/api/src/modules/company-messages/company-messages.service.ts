import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { RealtimeService } from "../realtime/realtime.service";

/**
 * Portal — mesajlaşma bağımsızlığının anahtarı. Satınalma'da firma ALICI
 * rolünde, Satış'ta SATICI rolünde. Thread her zaman (buyer, seller) çifti
 * olduğundan iki portalın gelen kutuları birbirinden tamamen ayrıdır.
 */
export type MessagePortal = "satinalma" | "satis";

interface ThreadParties {
  buyerCompanyId: string;
  sellerCompanyId: string;
}

@Injectable()
export class CompanyMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  private parties(
    companyId: string,
    portal: MessagePortal,
    otherCompanyId: string,
  ): ThreadParties {
    return portal === "satinalma"
      ? { buyerCompanyId: companyId, sellerCompanyId: otherCompanyId }
      : { buyerCompanyId: otherCompanyId, sellerCompanyId: companyId };
  }

  private assertPortal(portal: string): MessagePortal {
    if (portal !== "satinalma" && portal !== "satis") {
      throw new BadRequestException("Geçersiz portal");
    }
    return portal;
  }

  /** Portal gelen kutusu — bu portalda firmanın tüm konuşmaları (özet). */
  async listThreads(user: AuthenticatedCompanyUser, portalRaw: string) {
    const portal = this.assertPortal(portalRaw);
    const where =
      portal === "satinalma"
        ? { buyerCompanyId: user.companyId }
        : { sellerCompanyId: user.companyId };

    const threads = await this.prisma.messageThread.findMany({
      where,
      include: {
        buyerCompany: { select: { id: true, name: true } },
        sellerCompany: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: {
          select: {
            messages: {
              where: {
                readAt: null,
                senderCompanyId: { not: user.companyId },
              },
            },
          },
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    });

    return threads.map((t) => {
      const other =
        portal === "satinalma" ? t.sellerCompany : t.buyerCompany;
      const last = t.messages[0];
      return {
        threadId: t.id,
        otherPartyId: other.id,
        otherPartyName: other.name,
        lastMessagePreview: last?.body.slice(0, 120) ?? null,
        lastMessageAt: t.lastMessageAt,
        unread: t._count.messages > 0,
      };
    });
  }

  /**
   * Bir firmayla bu portaldaki konuşma — mesajlar + karşı taraf. GET sırasında
   * gelen okunmamış mesajlar okundu işaretlenir. Thread yoksa boş döner
   * (mesaj atılınca oluşturulur).
   */
  async getThread(
    user: AuthenticatedCompanyUser,
    portalRaw: string,
    otherCompanyId: string,
  ) {
    const portal = this.assertPortal(portalRaw);
    const other = await this.prisma.company.findUnique({
      where: { id: otherCompanyId },
      select: { id: true, name: true },
    });
    if (!other) throw new NotFoundException("Firma bulunamadı");

    const parties = this.parties(user.companyId, portal, otherCompanyId);
    const thread = await this.prisma.messageThread.findUnique({
      where: {
        buyerCompanyId_sellerCompanyId: {
          buyerCompanyId: parties.buyerCompanyId,
          sellerCompanyId: parties.sellerCompanyId,
        },
      },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!thread) {
      return {
        thread: null,
        otherParty: other,
        messages: [],
      };
    }

    // Gelen okunmamışları okundu yap.
    await this.prisma.message.updateMany({
      where: {
        threadId: thread.id,
        readAt: null,
        senderCompanyId: { not: user.companyId },
      },
      data: { readAt: new Date() },
    });

    return {
      thread: { id: thread.id, lastMessageAt: thread.lastMessageAt },
      otherParty: other,
      messages: thread.messages.map((m) => ({
        id: m.id,
        body: m.body,
        senderName: m.senderName,
        mine: m.senderCompanyId === user.companyId,
        createdAt: m.createdAt,
      })),
    };
  }

  /** Mesaj gönder — thread yoksa oluşturur (find-or-create). */
  async send(
    user: AuthenticatedCompanyUser,
    portalRaw: string,
    otherCompanyId: string,
    body: string,
  ) {
    const portal = this.assertPortal(portalRaw);
    if (otherCompanyId === user.companyId) {
      throw new BadRequestException("Kendine mesaj gönderemezsin");
    }
    const other = await this.prisma.company.findUnique({
      where: { id: otherCompanyId },
      select: { id: true },
    });
    if (!other) throw new NotFoundException("Firma bulunamadı");

    const parties = this.parties(user.companyId, portal, otherCompanyId);
    const now = new Date();

    const thread = await this.prisma.messageThread.upsert({
      where: {
        buyerCompanyId_sellerCompanyId: {
          buyerCompanyId: parties.buyerCompanyId,
          sellerCompanyId: parties.sellerCompanyId,
        },
      },
      create: { ...parties, lastMessageAt: now },
      update: { lastMessageAt: now },
    });

    const message = await this.prisma.message.create({
      data: {
        threadId: thread.id,
        senderCompanyId: user.companyId,
        senderUserId: user.userId,
        senderName: `${user.firstName} ${user.lastName}`.trim(),
        body,
      },
    });
    // Sinyal-only: karşı tarafın rozeti/kutusu anında tazelensin (veri REST'ten).
    this.realtime?.pingMessage(otherCompanyId);

    return {
      id: message.id,
      body: message.body,
      senderName: message.senderName,
      mine: true,
      createdAt: message.createdAt,
    };
  }

  /** Nav rozeti — iki portal toplamı okunmamış mesaj sayısı. */
  async unreadCount(user: AuthenticatedCompanyUser) {
    const count = await this.prisma.message.count({
      where: {
        readAt: null,
        senderCompanyId: { not: user.companyId },
        thread: {
          OR: [
            { buyerCompanyId: user.companyId },
            { sellerCompanyId: user.companyId },
          ],
        },
      },
    });
    return { count };
  }
}
