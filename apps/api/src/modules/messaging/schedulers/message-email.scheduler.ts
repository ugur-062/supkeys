import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { MessageContext } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";

/**
 * V2-4 — Mesaj e-posta bildirimi cron'u.
 *
 * Mesaj gönderildikten sonra karşı taraf 5 dk içinde panele girip okumadıysa
 * cron e-posta gönderir (debounce: peş peşe gönderilen mesajlarda spam önlenir
 * — kullanıcı uygulamada zaten görür, dışarıdaysa tek e-posta yeterli).
 */
@Injectable()
export class MessageEmailScheduler {
  private readonly logger = new Logger(MessageEmailScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processNotifications(): Promise<void> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const messages = await this.prisma.message.findMany({
      where: {
        emailNotifiedAt: null,
        sentAt: { lte: fiveMinAgo },
      },
      include: {
        thread: {
          include: {
            tenant: { select: { name: true } },
            supplier: { select: { companyName: true } },
          },
        },
      },
      orderBy: { sentAt: "asc" },
      take: 100,
    });

    if (messages.length === 0) return;
    this.logger.log(`Processing ${messages.length} pending message email(s)`);

    for (const msg of messages) {
      try {
        // Mesajdan sonra karşı taraf okudu mu? (oku-zamanı > sent-zamanı)
        const opponentReadAt =
          msg.senderType === "TENANT_USER"
            ? msg.thread.supplierLastReadAt
            : msg.thread.tenantLastReadAt;
        if (opponentReadAt && opponentReadAt >= msg.sentAt) {
          // Okumuş — e-postaya gerek yok, mark notified.
          await this.prisma.message.update({
            where: { id: msg.id },
            data: { emailNotifiedAt: new Date() },
          });
          continue;
        }

        const recipient = await this.resolveRecipient(msg);
        if (!recipient) {
          // Karşı tarafta aktif kullanıcı yok — skip & mark.
          await this.prisma.message.update({
            where: { id: msg.id },
            data: { emailNotifiedAt: new Date() },
          });
          continue;
        }

        const senderInfo = await this.resolveSender(msg);
        const contextLabel = await this.resolveContextLabel(
          msg.thread.context,
          msg.thread.contextRefId,
        );
        const ctaUrl = this.buildCtaUrl(
          recipient.surface,
          msg.thread.context,
          msg.thread.contextRefId,
          msg.thread.supplierId,
        );

        const isTruncated = msg.content.length > 200;
        const messagePreview = isTruncated
          ? msg.content.substring(0, 200)
          : msg.content || "(dosya eki)";

        await this.emailQueue.enqueue({
          to: { email: recipient.email, name: recipient.name },
          templateData: {
            template: "message_notification",
            data: {
              recipientName: recipient.firstName,
              senderCompanyName: senderInfo.companyName,
              senderPersonName: senderInfo.personName,
              contextLabel,
              messagePreview,
              isTruncated,
              ctaUrl,
            },
          },
          context: { type: "message", id: msg.id },
        });

        await this.prisma.message.update({
          where: { id: msg.id },
          data: { emailNotifiedAt: new Date() },
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Email enqueue failed for message ${msg.id}: ${errMsg}`,
        );
      }
    }
  }

  // ---------- helpers ----------

  private async resolveRecipient(msg: {
    senderType: "TENANT_USER" | "SUPPLIER_USER";
    thread: { tenantId: string; supplierId: string };
  }): Promise<
    | {
        email: string;
        firstName: string;
        name: string;
        surface: "tenant" | "supplier";
      }
    | null
  > {
    if (msg.senderType === "TENANT_USER") {
      // Tenant gönderdi → supplier'a bildir (1. supplierUser).
      const supUser = await this.prisma.supplierUser.findFirst({
        where: { supplierId: msg.thread.supplierId, isActive: true },
        select: { email: true, firstName: true, lastName: true },
        orderBy: { createdAt: "asc" },
      });
      if (!supUser) return null;
      return {
        email: supUser.email,
        firstName: supUser.firstName,
        name: `${supUser.firstName} ${supUser.lastName}`,
        surface: "supplier",
      };
    }
    // SUPPLIER_USER gönderdi → tenant COMPANY_ADMIN'lere
    const admin = await this.prisma.user.findFirst({
      where: {
        tenantId: msg.thread.tenantId,
        role: "COMPANY_ADMIN",
        isActive: true,
      },
      select: { email: true, firstName: true, lastName: true },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) return null;
    return {
      email: admin.email,
      firstName: admin.firstName,
      name: `${admin.firstName} ${admin.lastName}`,
      surface: "tenant",
    };
  }

  private async resolveSender(msg: {
    senderType: "TENANT_USER" | "SUPPLIER_USER";
    senderUserId: string | null;
    senderSupplierUserId: string | null;
    thread: {
      tenant: { name: string };
      supplier: { companyName: string };
    };
  }): Promise<{ companyName: string; personName: string }> {
    if (msg.senderType === "TENANT_USER" && msg.senderUserId) {
      const u = await this.prisma.user.findUnique({
        where: { id: msg.senderUserId },
        select: { firstName: true, lastName: true },
      });
      return {
        companyName: msg.thread.tenant.name,
        personName: u ? `${u.firstName} ${u.lastName}` : "Kullanıcı",
      };
    }
    if (msg.senderType === "SUPPLIER_USER" && msg.senderSupplierUserId) {
      const su = await this.prisma.supplierUser.findUnique({
        where: { id: msg.senderSupplierUserId },
        select: { firstName: true, lastName: true },
      });
      return {
        companyName: msg.thread.supplier.companyName,
        personName: su ? `${su.firstName} ${su.lastName}` : "Kullanıcı",
      };
    }
    return {
      companyName:
        msg.senderType === "TENANT_USER"
          ? msg.thread.tenant.name
          : msg.thread.supplier.companyName,
      personName: "Kullanıcı",
    };
  }

  private async resolveContextLabel(
    context: MessageContext,
    contextRefId: string,
  ): Promise<string> {
    if (context === "ORDER") {
      const order = await this.prisma.order.findUnique({
        where: { id: contextRefId },
        select: { orderNumber: true },
      });
      return order ? `Sipariş ${order.orderNumber}` : "Sipariş";
    }
    const tender = await this.prisma.tender.findUnique({
      where: { id: contextRefId },
      select: { tenderNumber: true, title: true },
    });
    return tender
      ? `İhale ${tender.tenderNumber} — ${tender.title}`
      : "İhale";
  }

  private buildCtaUrl(
    surface: "tenant" | "supplier",
    context: MessageContext,
    contextRefId: string,
    supplierId: string,
  ): string {
    const base =
      this.configService.get<string>("WEB_URL") ?? "http://localhost:3000";

    if (surface === "tenant") {
      if (context === "ORDER") {
        return `${base}/dashboard/siparisler/${contextRefId}?tab=messages`;
      }
      return `${base}/dashboard/ihaleler/${contextRefId}?tab=messages&supplier=${supplierId}`;
    }
    // supplier surface
    if (context === "ORDER") {
      return `${base}/supplier/siparisler/${contextRefId}?tab=messages`;
    }
    return `${base}/supplier/ihaleler/${contextRefId}?tab=messages`;
  }
}
