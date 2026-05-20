import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { MessageContext } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailService } from "../../email/email.service";

/**
 * V2-4 — Mesaj e-posta bildirimi cron'u.
 *
 * Cron her dakika çalışır; gönderildikten 2 dk geçmiş + henüz okunmamış
 * mesajlara e-posta atar. Worst case bildirim gecikmesi 2-3 dk. Debounce
 * mantığı: alıcı 2 dk içinde panele girip okuduysa bildirim atılmaz.
 */
@Injectable()
export class MessageEmailScheduler {
  private readonly logger = new Logger(MessageEmailScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Performans audit P-1 — Batch dependency fetch.
   *
   * Eski yaklaşım: her mesaj için 4 ardışık DB call (recipient + sender +
   * context + update) → 100 mesaj × 4 = 400 sequential round-trip ≈ 2 sn.
   * Aynı thread'de birden çok unread mesaj varsa context (order/tender)
   * tekrar tekrar fetch ediliyordu.
   *
   * Yeni yaklaşım: tüm ID setleri'ni topla → 6 batch findMany (paralel) →
   * in-memory map ile O(1) lookup → enqueue + update paralel.
   * 100 mesaj için 4 batched query + N paralel enqueue = ~150ms (~13×).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processNotifications(): Promise<void> {
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);

    const messages = await this.prisma.message.findMany({
      where: {
        emailNotifiedAt: null,
        sentAt: { lte: twoMinAgo },
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

    // 1) Already-read olanları ayır (in-memory check), tek updateMany ile kapat.
    const alreadyReadIds: string[] = [];
    const pendingMessages: typeof messages = [];
    for (const msg of messages) {
      const opponentReadAt =
        msg.senderType === "TENANT_USER"
          ? msg.thread.supplierLastReadAt
          : msg.thread.tenantLastReadAt;
      if (opponentReadAt && opponentReadAt >= msg.sentAt) {
        alreadyReadIds.push(msg.id);
      } else {
        pendingMessages.push(msg);
      }
    }

    if (alreadyReadIds.length > 0) {
      await this.prisma.message.updateMany({
        where: { id: { in: alreadyReadIds } },
        data: { emailNotifiedAt: new Date() },
      });
    }

    if (pendingMessages.length === 0) return;

    // 2) Dependency ID setlerini topla.
    const recipientSupplierIds = new Set<string>();
    const recipientTenantIds = new Set<string>();
    const senderUserIds = new Set<string>();
    const senderSupplierUserIds = new Set<string>();
    const orderIds = new Set<string>();
    const tenderIds = new Set<string>();

    for (const msg of pendingMessages) {
      if (msg.senderType === "TENANT_USER") {
        recipientSupplierIds.add(msg.thread.supplierId);
      } else {
        recipientTenantIds.add(msg.thread.tenantId);
      }
      if (msg.senderType === "TENANT_USER" && msg.senderUserId) {
        senderUserIds.add(msg.senderUserId);
      } else if (
        msg.senderType === "SUPPLIER_USER" &&
        msg.senderSupplierUserId
      ) {
        senderSupplierUserIds.add(msg.senderSupplierUserId);
      }
      // V2-4.2 — context artık message seviyesinde. DIRECT mesajlarda ek
      // tender/order lookup gerekmez (context label boş gösterilir).
      if (msg.context === "ORDER" && msg.contextRefId) {
        orderIds.add(msg.contextRefId);
      } else if (msg.context === "TENDER" && msg.contextRefId) {
        tenderIds.add(msg.contextRefId);
      }
    }

    // 3) Tüm dependencies'i paralel batch fetch et.
    const [
      supplierPrimaryUsers,
      tenantAdmins,
      senderUsers,
      senderSupplierUsers,
      orders,
      tenders,
    ] = await Promise.all([
      recipientSupplierIds.size > 0
        ? this.prisma.supplierUser.findMany({
            where: {
              supplierId: { in: [...recipientSupplierIds] },
              isActive: true,
            },
            select: {
              supplierId: true,
              email: true,
              firstName: true,
              lastName: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([] as Array<{
            supplierId: string;
            email: string;
            firstName: string;
            lastName: string;
            createdAt: Date;
          }>),
      recipientTenantIds.size > 0
        ? this.prisma.user.findMany({
            where: {
              tenantId: { in: [...recipientTenantIds] },
              role: "COMPANY_ADMIN",
              isActive: true,
            },
            select: {
              tenantId: true,
              email: true,
              firstName: true,
              lastName: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([] as Array<{
            tenantId: string | null;
            email: string;
            firstName: string;
            lastName: string;
            createdAt: Date;
          }>),
      senderUserIds.size > 0
        ? this.prisma.user.findMany({
            where: { id: { in: [...senderUserIds] } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([] as Array<{
            id: string;
            firstName: string;
            lastName: string;
          }>),
      senderSupplierUserIds.size > 0
        ? this.prisma.supplierUser.findMany({
            where: { id: { in: [...senderSupplierUserIds] } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([] as Array<{
            id: string;
            firstName: string;
            lastName: string;
          }>),
      orderIds.size > 0
        ? this.prisma.order.findMany({
            where: { id: { in: [...orderIds] } },
            select: { id: true, orderNumber: true },
          })
        : Promise.resolve([] as Array<{ id: string; orderNumber: string }>),
      tenderIds.size > 0
        ? this.prisma.tender.findMany({
            where: { id: { in: [...tenderIds] } },
            select: { id: true, tenderNumber: true, title: true },
          })
        : Promise.resolve([] as Array<{
            id: string;
            tenderNumber: string;
            title: string;
          }>),
    ]);

    // 4) O(1) lookup map'leri kur. Recipient için orderBy createdAt asc geldi:
    // her supplier/tenant için ilk match'i tut.
    const supplierFirstUser = new Map<
      string,
      { email: string; firstName: string; lastName: string }
    >();
    for (const u of supplierPrimaryUsers) {
      if (!supplierFirstUser.has(u.supplierId)) {
        supplierFirstUser.set(u.supplierId, {
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
        });
      }
    }
    const tenantFirstAdmin = new Map<
      string,
      { email: string; firstName: string; lastName: string }
    >();
    for (const u of tenantAdmins) {
      if (u.tenantId && !tenantFirstAdmin.has(u.tenantId)) {
        tenantFirstAdmin.set(u.tenantId, {
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
        });
      }
    }
    const senderUserMap = new Map(
      senderUsers.map((u) => [u.id, u] as const),
    );
    const senderSupplierUserMap = new Map(
      senderSupplierUsers.map((u) => [u.id, u] as const),
    );
    const orderMap = new Map(orders.map((o) => [o.id, o] as const));
    const tenderMap = new Map(tenders.map((t) => [t.id, t] as const));

    const webUrl =
      this.configService.get<string>("WEB_URL") ?? "http://localhost:3000";

    // 5) Mesajları paralel işle. Her birinin enqueue + update'i bağımsız.
    const enqueuedIds: string[] = [];
    const skippedIds: string[] = []; // recipient yok → mark as notified (no-retry)

    await Promise.allSettled(
      pendingMessages.map(async (msg) => {
        try {
          // Recipient
          const recipient =
            msg.senderType === "TENANT_USER"
              ? supplierFirstUser.get(msg.thread.supplierId)
              : tenantFirstAdmin.get(msg.thread.tenantId);
          if (!recipient) {
            skippedIds.push(msg.id);
            return;
          }
          const recipientSurface: "tenant" | "supplier" =
            msg.senderType === "TENANT_USER" ? "supplier" : "tenant";

          // Sender
          const senderInfo = this.resolveSenderFromMaps(msg, {
            senderUserMap,
            senderSupplierUserMap,
          });

          // V2-4.2 — context message seviyesinde
          const contextLabel = this.resolveContextLabelFromMaps(
            msg.context,
            msg.contextRefId,
            { orderMap, tenderMap },
          );

          const ctaUrl = this.buildCtaUrl(
            recipientSurface,
            msg.context,
            msg.contextRefId,
            msg.thread.tenantId,
            msg.thread.supplierId,
            webUrl,
          );

          const isTruncated = msg.content.length > 200;
          const messagePreview = isTruncated
            ? msg.content.substring(0, 200)
            : msg.content || "(dosya eki)";

          await this.emailService.send({
            to: {
              email: recipient.email,
              name: `${recipient.firstName} ${recipient.lastName}`,
            },
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
          enqueuedIds.push(msg.id);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Email enqueue failed for message ${msg.id}: ${errMsg}`,
          );
        }
      }),
    );

    // 6) Başarılı + skip'lenenleri tek updateMany ile notified işaretle.
    const notifyIds = [...enqueuedIds, ...skippedIds];
    if (notifyIds.length > 0) {
      await this.prisma.message.updateMany({
        where: { id: { in: notifyIds } },
        data: { emailNotifiedAt: new Date() },
      });
    }
  }

  // ---------- helpers ----------

  private resolveSenderFromMaps(
    msg: {
      senderType: "TENANT_USER" | "SUPPLIER_USER";
      senderUserId: string | null;
      senderSupplierUserId: string | null;
      thread: {
        tenant: { name: string };
        supplier: { companyName: string };
      };
    },
    maps: {
      senderUserMap: Map<string, { firstName: string; lastName: string }>;
      senderSupplierUserMap: Map<
        string,
        { firstName: string; lastName: string }
      >;
    },
  ): { companyName: string; personName: string } {
    if (msg.senderType === "TENANT_USER" && msg.senderUserId) {
      const u = maps.senderUserMap.get(msg.senderUserId);
      return {
        companyName: msg.thread.tenant.name,
        personName: u ? `${u.firstName} ${u.lastName}` : "Kullanıcı",
      };
    }
    if (msg.senderType === "SUPPLIER_USER" && msg.senderSupplierUserId) {
      const su = maps.senderSupplierUserMap.get(msg.senderSupplierUserId);
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

  private resolveContextLabelFromMaps(
    context: MessageContext | null,
    contextRefId: string | null,
    maps: {
      orderMap: Map<string, { orderNumber: string }>;
      tenderMap: Map<string, { tenderNumber: string; title: string }>;
    },
  ): string {
    if (!context || context === "DIRECT" || !contextRefId) {
      return "Şirket sohbeti";
    }
    if (context === "ORDER") {
      const order = maps.orderMap.get(contextRefId);
      return order ? `Sipariş ${order.orderNumber}` : "Sipariş";
    }
    const tender = maps.tenderMap.get(contextRefId);
    return tender
      ? `İhale ${tender.tenderNumber} — ${tender.title}`
      : "İhale";
  }

  /**
   * V2-4.2 — Unified thread modeli. Context bağlam etiketi olsa bile CTA
   * doğrudan /mesajlar sayfasındaki contact'a yönlendirir; full conversation
   * orada görünür.
   */
  private buildCtaUrl(
    surface: "tenant" | "supplier",
    _context: MessageContext | null,
    _contextRefId: string | null,
    tenantId: string,
    supplierId: string,
    base: string,
  ): string {
    if (surface === "tenant") {
      return `${base}/dashboard/mesajlar?contact=${supplierId}`;
    }
    return `${base}/supplier/mesajlar?contact=${tenantId}`;
  }
}
