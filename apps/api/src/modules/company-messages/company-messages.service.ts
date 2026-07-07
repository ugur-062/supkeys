import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CompanyBlocksService } from "../company-blocks/company-blocks.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { EmailService } from "../email/email.service";
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
  private readonly logger = new Logger(CompanyMessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: CompanyBlocksService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  /** Yeni mesaj e-postası — alıcının bildirim e-postasına (best-effort). */
  private async emailNewMessage(
    companyId: string,
    portal: MessagePortal,
    senderName: string,
  ) {
    try {
      const c = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          name: true,
          billingEmail: true,
          users: {
            where: { isActive: true, deletedAt: null },
            select: { email: true, firstName: true, lastName: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });
      const email = c?.billingEmail || c?.users[0]?.email;
      if (!c || !email) return;
      const name = c.users[0]
        ? `${c.users[0].firstName} ${c.users[0].lastName}`.trim() || c.name
        : c.name;
      const baseUrl =
        this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
      const subject = `${senderName} size mesaj gönderdi`;
      await this.email.send({
        to: { email, name },
        subject,
        templateData: {
          template: "notification",
          data: {
            subject,
            heading: "Yeni mesajınız var",
            paragraphs: [
              "Merhaba,",
              `${senderName} size Rothern üzerinden bir mesaj gönderdi. Görüntülemek ve yanıtlamak için giriş yapın.`,
            ],
            ctaLabel: "Mesajları Gör",
            ctaUrl: `${baseUrl}/company/${portal}/mesajlar`,
          },
        },
        context: { type: "message_received", id: companyId },
      });
    } catch (err) {
      this.logger.warn(
        `Mesaj e-postası gönderilemedi (${companyId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

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
    // Bloklu karşı taraf gelen kutusunda da görünmez (karşılıklı-görünmezlik).
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    const where =
      portal === "satinalma"
        ? {
            buyerCompanyId: user.companyId,
            sellerCompanyId: { notIn: blockedIds },
          }
        : {
            sellerCompanyId: user.companyId,
            buyerCompanyId: { notIn: blockedIds },
          };

    const threads = await this.prisma.messageThread.findMany({
      where,
      take: 200,
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
    // Blok (iki yön) → konuşma GÖRÜNMEZ (send() ile tutarlı karşılıklı-görünmezlik;
    // engellenen taraf eski geçmişi de okuyamaz).
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    if (blockedIds.includes(otherCompanyId)) {
      throw new NotFoundException("Firma bulunamadı");
    }

    const parties = this.parties(user.companyId, portal, otherCompanyId);
    const thread = await this.prisma.messageThread.findUnique({
      where: {
        buyerCompanyId_sellerCompanyId: {
          buyerCompanyId: parties.buyerCompanyId,
          sellerCompanyId: parties.sellerCompanyId,
        },
      },
      // Son 200 mesaj (pagination cap) — uzun konuşmalarda sınırsız yükleme yok.
      include: { messages: { orderBy: { createdAt: "desc" }, take: 200 } },
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
      // desc çekildi → gösterim için eskiden yeniye çevir.
      messages: [...thread.messages].reverse().map((m) => ({
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
    // Engel (iki yön) mesajlaşmayı da kapatır — engelleyen taraf sızdırılmaz.
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    if (blockedIds.includes(otherCompanyId)) {
      throw new NotFoundException("Firma bulunamadı");
    }

    const parties = this.parties(user.companyId, portal, otherCompanyId);
    const now = new Date();

    // E-posta spam-koruması için önceki aktiviteyi yakala (upsert güncellemeden).
    const existingThread = await this.prisma.messageThread.findUnique({
      where: {
        buyerCompanyId_sellerCompanyId: {
          buyerCompanyId: parties.buyerCompanyId,
          sellerCompanyId: parties.sellerCompanyId,
        },
      },
      select: { lastMessageAt: true },
    });

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

    // E-posta (best-effort, spam-önleyici): yalnızca konuşmada boşluk varsa (son
    // mesajdan >15 dk ya da ilk mesaj) → karşı taraf muhtemelen uygulamada değil.
    // Aktif yazışmada her mesaja mail atılmaz.
    const GAP_MS = 15 * 60_000;
    const lastAt = existingThread?.lastMessageAt;
    const quiet = !lastAt || now.getTime() - lastAt.getTime() > GAP_MS;
    if (quiet) {
      void this.emailNewMessage(otherCompanyId, portal, message.senderName);
    }

    return {
      id: message.id,
      body: message.body,
      senderName: message.senderName,
      mine: true,
      createdAt: message.createdAt,
    };
  }

  /**
   * Nav rozeti — okunmamış mesaj sayısı. `portal` verilirse yalnız o portalın
   * thread'leri (satınalma → firma ALICI; satış → firma SATICI). Verilmezse
   * iki portal toplamı (geriye uyum).
   */
  async unreadCount(user: AuthenticatedCompanyUser, portalRaw?: string) {
    const portal =
      portalRaw === "satinalma" || portalRaw === "satis" ? portalRaw : null;
    const threadWhere = portal
      ? portal === "satinalma"
        ? { buyerCompanyId: user.companyId }
        : { sellerCompanyId: user.companyId }
      : {
          OR: [
            { buyerCompanyId: user.companyId },
            { sellerCompanyId: user.companyId },
          ],
        };
    // Bloklu gönderenlerin okunmamışları rozete sayılmaz (karşılıklı-görünmezlik).
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    const count = await this.prisma.message.count({
      where: {
        readAt: null,
        senderCompanyId: { notIn: [user.companyId, ...blockedIds] },
        thread: threadWhere,
      },
    });
    return { count };
  }
}
